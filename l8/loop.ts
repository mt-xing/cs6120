import { BrilInstruction, CFG } from "../bril_shared/cfg.ts";
import { dominanceGraph } from "../bril_shared/dom.ts";
import { mayHaveSideEffect } from "../bril_shared/instr.ts";
import { NiceCfg, NiceCfgNode, niceifyCfg } from "../bril_shared/niceCfg.ts";
import { iterateUntilConvergence } from "../l3/instructionProcessing.ts";
import { reachingDefs } from "../l4/reaching.ts";

export function findLoops(cfg: NiceCfg) {
    const domGraph = dominanceGraph(cfg);
    const loops = new Map<NiceCfgNode, Set<NiceCfgNode>>();

    const addAllPredsToSet = (node: NiceCfgNode, set: Set<NiceCfgNode>, header: NiceCfgNode) => {
        if (node === header) {
            return;
        }
        if (typeof node !== "string") {
            node.preds.forEach((p) => {
                if (!set.has(p)) {
                    set.add(p);
                    addAllPredsToSet(p, set, header);
                }
            })
        }
    };

    cfg.blocks.forEach((block) => {
        block.succs.forEach((succ) => {
            if (succ !== "EXIT" && domGraph.get(block)?.has(succ)) {
                const headNode = succ;
                const loop = new Set<NiceCfgNode>();
                loops.set(headNode, loop);
                loop.add(block);
                loop.add(headNode);
                addAllPredsToSet(block, loop, headNode);
            }
        });
    });

    return loops;
}

function getFromSet<T>(x: Set<T>): T {
    for (const e of x) {
        return e;
    }
    throw new Error("Set is empty");
}

export function licm(cfg: CFG) {
    const niceCfg = niceifyCfg(cfg);
    const loops = findLoops(niceCfg);
    const reaching = reachingDefs(cfg);

    const invariantCandidates = new Map<NiceCfgNode, Set<BrilInstruction>>();

    loops.forEach((loop, headNode) => {
        const instrsInLoop = new Set<BrilInstruction>();
        const instrsAndBlockInLoop = new Set<{instr: BrilInstruction, block: NiceCfgNode}>();
        loop.forEach((node) => {
            if (typeof node !== "string") {
                node.block.forEach((i) => {
                    instrsInLoop.add(i);
                    instrsAndBlockInLoop.add({instr: i, block: node});
                })
            }
        });

        const invariantInstrs = iterateUntilConvergence<Set<BrilInstruction>>((l) => {

            const val = new Set(l);
            let changed = false;

            instrsAndBlockInLoop.forEach(({instr, block}) => {
                if (mayHaveSideEffect(instr)) {
                    return;
                }
                if (!("op" in instr)) {
                    return;
                }
                if (!instr.args) {
                    return;
                }
                if (typeof block === "string") {
                    console.error("INVALID instruction inside entry / exit block");
                    return;
                }
                const reachingDefs = reaching.get(block.block);

                if (instr.args.every((arg) => {
                    const reachingDefsOfArg = reachingDefs?.get(arg);
                    if (!reachingDefsOfArg || Array.from(reachingDefsOfArg).every(rd => !instrsInLoop.has(rd))) {
                        return true;
                    }
                    if (reachingDefsOfArg.size === 1) {
                        const def = getFromSet(reachingDefsOfArg);
                        if (val.has(def)) {
                            return true;
                        }
                    }
                    return false;
                })) {
                    if (!val.has(instr)) {
                        val.add(instr);
                        changed = true;
                    }
                }
            });

            return { val, changed };
        })(new Set());

        invariantCandidates.set(headNode, invariantInstrs);
    });

    console.log(invariantCandidates);
}