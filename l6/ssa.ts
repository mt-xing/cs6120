import { NiceCfg } from "../bril_shared/niceCfg.ts";
import { dominanceGraph, dominanceFrontier, dominanceTree } from "../l5/dom.ts";
import { CfgBlockNode } from "../l5/niceCfg.ts";

let nameCounter = 0;

function newName(oldName: string) {
    return `${oldName}:${nameCounter++}:${Math.random().toString(36).substring(2)}`
}

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
                    block.block.unshift({
                        op: "get",
                        dest: varName
                    });
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
                    p.dest = varStack[p.dest!][varStack[p.dest!].length - 1];
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
}