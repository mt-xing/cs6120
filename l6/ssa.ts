import { BasicBlock, BrilInstruction, BrilProgram, getBlocks, getCfg } from "../bril_shared/cfg.ts";
import { newName } from "../bril_shared/newName.ts";
import { CfgBlockNode, cfgToFn, NiceCfg, niceifyCfg } from "../bril_shared/niceCfg.ts";
import { dominanceGraph, dominanceFrontier, dominanceTree } from "../bril_shared/dom.ts";

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

export function ssa(cfg: NiceCfg, args: string[]): { newArgs: string[], initialInstructions: BrilInstruction[] } {
    const domGraph = dominanceGraph(cfg);
    const domFrontier = dominanceFrontier(domGraph);
    const domTree = dominanceTree(domGraph);
    // printDominanceTree(domTree);
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
    const ogNameLookup = new Map<string, string>();
    varDefs.forEach((_, varName) => {
        varStack[varName] = [varName];
        ogNameLookup.set(varName, varName);
    });
    args.forEach((varName) => {
        varStack[varName] = [varName];
        ogNameLookup.set(varName, varName);
    });
    const rename = (block: CfgBlockNode) => {
        const stuffToPop: string[][] = [];
        block.block.forEach((instr) => {
            if (!("op" in instr)) { return; }

            if (instr.args) {
                instr.args = instr.args.map(oldNameOg => {
                    const oldName = ogNameLookup.get(oldNameOg) ?? oldNameOg;
                    if (!varStack[oldName]) {
                        console.error(oldName, instr, varStack);
                    }
                    return varStack[oldName][varStack[oldName].length - 1];
                });
            }

            if (instr.dest) {
                const oldName = ogNameLookup.get(instr.dest) ?? instr.dest;
                const n = newName(oldName);
                instr.dest = n;
                varStack[oldName].push(n);
                ogNameLookup.set(n, oldName);
                stuffToPop.push(varStack[oldName]);
            }
        });

        block.succs.forEach((s) => {
            if (s === "EXIT") { return; }
            s.block.forEach((p) => {
                if ("op" in p && p.op === "get") {
                    const v = ogNameLookup.get(p.dest!) ?? p.dest!;
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

    const finalArgs = args.map((oldName) => {
        const n = newName(oldName);
        varStack[oldName].push(n);
        ogNameLookup.set(n, oldName);
        return n;
    });

    const newInstructions: BrilInstruction[] = [];
    const argsSet = new Set(args);
    domTree.forEach(x => {
        const s = x.block;
        if (s === "EXIT") { return; }
        s.block.forEach((p) => {
            if ("op" in p && p.op === "get") {
                const v = ogNameLookup.get(p.dest!) ?? p.dest!;
                if (!argsSet.has(v)) {return;}
                const upsilon = {
                    op: "set" as const,
                    args: [v, varStack[v][varStack[v].length - 1]],
                };
                newInstructions.push(upsilon);
                const candidate = allPhis.get(p as {op: "get", dest: string});
                if (candidate === undefined) {
                    allPhis.set(p as {op: "get", dest: string}, new Set([upsilon]));
                } else {
                    candidate.add(upsilon);
                }
            }
        });
    });

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

    return { newArgs: finalArgs, initialInstructions: newInstructions };
}

function getAllReadVars(x: BrilInstruction[], args?: string[]) {
    const vars = new Set<string>();
    x.forEach((instr) => {
        if ("op" in instr) {
            instr.args?.forEach((x) => {
                vars.add(x);
            })
        }
    });
    args?.forEach((x) => vars.delete(x));
    return vars;
}

export function ssaProgram(p: BrilProgram) {
    const cfgs: Record<string, NiceCfg> = {};
    const args: Record<string, string[]> = {};
    const initialInstrs: Record<string, BrilInstruction[]> = {};
    p.functions.forEach(fn => {
        const {blocks, mapping} = getBlocks(fn.instrs);
        const cfg = getCfg(blocks, mapping);
        const name = fn.name;
        cfgs[name] = niceifyCfg(cfg);
        // args[name] = (fn.args?.map(x => x.name)) ?? [];
        const {newArgs, initialInstructions} = ssa(cfgs[name], fn.args?.map(x => x.name) ?? []);
        args[name] = newArgs;
        initialInstrs[name] = initialInstructions;
    });
    
    const finalProgram: BrilProgram = {
        functions: p.functions.map((f) => {
            const newInstrs = cfgToFn(cfgs[f.name]);
            const newArgs = f.args?.map((a, i) => ({...a, name: args[f.name][i]})) ?? undefined;
            const readVars = getAllReadVars(newInstrs, newArgs?.map(x => x.name));
            const setup: BrilInstruction[] = Array.from(readVars).map((x) => {
                return [{
                    op: "undef",
                    dest: x,
                }, {
                    op: "set",
                    args: [x, x],
                }]
            }).flat();
            // console.log(initialInstrs[f.name]);
            return {
                ...f,
                instrs: setup.concat(initialInstrs[f.name].concat(newInstrs)),
                args: newArgs,
            };
        }),
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