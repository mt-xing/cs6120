import { BasicBlock, BrilInstruction, BrilProgram, getCfgsFromProgram } from "../bril_shared/cfg.ts";
import { newName } from "../bril_shared/newName.ts";
import { cfgToFn, NiceCfg } from "../bril_shared/niceCfg.ts";
import { dominanceGraph, dominanceFrontier, dominanceTree } from "../l5/dom.ts";
import { CfgBlockNode, niceifyCfg } from "../l5/niceCfg.ts";

function computeDomTreeLookup(
    tree: ReturnType<typeof dominanceTree>,
    current: "START" | CfgBlockNode,
    m: Map<CfgBlockNode, ReturnType<typeof dominanceTree>>,
): Map<CfgBlockNode, ReturnType<typeof dominanceTree>> {
    if (current !== "START") {
        m.set(current, tree);
    }
    tree.forEach((t) => {
        if (t.block !== "EXIT") {
            computeDomTreeLookup(t.children, t.block, m);
        }
    });
    return m;
}

function addInstrToBlock(block: CfgBlockNode, instr: BrilInstruction, beginning: boolean) {
    const list = block.block;
    if (list.length === 0) {
        list.push(instr);
        return;
    }
    if (beginning) {
        if (!("label" in list[0])) {
            list.unshift(instr);
            return;
        }
        const newList: BasicBlock = [];
        newList.push(list[0]);
        newList.push(instr);
        for (let i = 1; i < list.length; i++) {
            newList.push(list[i]);
        }
        block.block = newList;
        return;
    } else {
        const lastNode = list[list.length - 1];
        if (!("op" in lastNode)) {
            list.push(instr);
            return;
        }
        switch (lastNode.op) {
            case "jmp":
            case "br":
            case "ret":
                break;
            default: 
                list.push(instr);
                return;
        }
        list.pop();
        list.push(instr);
        list.push(lastNode);
        return;
    }
}

export function ssa(cfg: NiceCfg) {
    const domGraph = dominanceGraph(cfg);
    const domFrontier = dominanceFrontier(domGraph);
    const domTree = dominanceTree(domGraph);
    const domTreeLookup = computeDomTreeLookup(domTree, "START", new Map());
    
    const varDefs = new Map<string, Set<CfgBlockNode>>();
    cfg.blocks.forEach((block) => {
        block.block.forEach((instr) => {
            if ("op" in instr && instr.dest) {
                const candidate = varDefs.get(instr.dest);
                if (candidate === undefined) {
                    varDefs.set(instr.dest, new Set([block]));
                } else {
                    candidate.add(block);
                }
            }
        });
    });

    const existingPhis = new Map<CfgBlockNode, Set<string>>();

    varDefs.forEach((defs, varName) => {
        defs.forEach((d) => {
            domFrontier.get(d)?.forEach((block) => {
                if (block === "EXIT") { return; }
                const setOfExistingPhis = existingPhis.get(block);
                // Add phi node to block unless already there
                if (!setOfExistingPhis || !setOfExistingPhis.has(varName)) {
                    addInstrToBlock(block, {
                        op: "get",
                        dest: varName
                    }, true);
                    const s = setOfExistingPhis ?? new Set<string>();
                    s.add(varName);
                    if (!setOfExistingPhis) {
                        existingPhis.set(block, s);
                    }
                }
                // Add block to defs[v]
                defs.add(block);
            });
        });
    });

    const allPhis = new Map<{op: "get", dest: string}, Set<{op: "set", args: string[]}>>();

    const varStack: Record<string, string[]> = {};
    varDefs.forEach((_, varName) => {
        varStack[varName] = [varName];
    });
    const rename = (block: CfgBlockNode) => {
        const stuffToPop: string[][] = [];
        block.block.forEach((instr) => {
            if (!("op" in instr)) { return; }

            if (instr.args) {
                instr.args = instr.args.map(oldName => varStack[oldName][varStack[oldName].length - 1]);
            }

            if (instr.dest) {
                const oldName = instr.dest;
                const n = newName(oldName);
                instr.dest = n;
                varStack[oldName].push(n);
                stuffToPop.push(varStack[oldName]);
            }
        });

        block.succs.forEach((s) => {
            if (s === "EXIT") { return; }
            s.block.forEach((p) => {
                if ("op" in p && p.op === "get") {
                    const v = p.dest!;
                    const upsilon = {
                        op: "set" as const,
                        args: [v, varStack[v][varStack[v].length - 1]],
                    };

                    addInstrToBlock(block, upsilon, false);
                    
                    const candidate = allPhis.get(p as {op: "get", dest: string});
                    if (candidate === undefined) {
                        allPhis.set(p as {op: "get", dest: string}, new Set([upsilon]));
                    } else {
                        candidate.add(upsilon);
                    }
                }
            });
        });

        domTreeLookup.get(block)?.forEach((b) => {
            if (b.block !== "EXIT") {
                rename(b.block);
            }
        });

        // Pop all the names we pushed
        stuffToPop.forEach(x => x.pop());
    };
    domTree.forEach(x => {
        if (x.block !== "EXIT") {
            rename(x.block);
        }
    });

    allPhis.forEach((upsilonNodes, phiNode) => {
        upsilonNodes.forEach((u) => {
            u.args[0] = phiNode.dest;
        })
    });
}

export function ssaProgram(p: BrilProgram) {
    const rawCfgs = getCfgsFromProgram(p);
    
    const cfgs: Record<string, NiceCfg> = {};
    Object.entries(rawCfgs).forEach(([name, cfg]) => {
        cfgs[name] = niceifyCfg(cfg);
        ssa(cfgs[name]);
    });
    
    const finalProgram: BrilProgram = {
        functions: p.functions.map((f) => ({
            ...f,
            instrs: cfgToFn(cfgs[f.name]),
        })),
    };

    return finalProgram;
}

export function outOfSsa(cfg: NiceCfg) {
    cfg.blocks.forEach(x => {
        x.block = x.block.filter((x) => !("op" in x) || x.op !== "get");
        x.block.forEach((instr) => {
            if ("op" in instr && instr.op === "set") {
                instr.op = "id";
                const oldArgs = instr.args!;
                instr.args = [oldArgs[1]];
                instr.dest = oldArgs[0];
            }
        });
    });
}

export function programOutOfSsa(p: BrilProgram) {
    p.functions.forEach((f) => {
        f.instrs = f.instrs.filter((x) => !("op" in x) || x.op !== "get");
        f.instrs.forEach((instr) => {
            if ("op" in instr && instr.op === "set") {
                instr.op = "id";
                const oldArgs = instr.args!;
                instr.args = [oldArgs[1]];
                instr.dest = oldArgs[0];
            }
        });
    });
}