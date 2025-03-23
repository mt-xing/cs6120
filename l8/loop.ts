import { BrilInstruction, BrilProgram, CFG, getBlocks, getCfg, getCfgsFromProgram } from "../bril_shared/cfg.ts";
import { dominanceGraph } from "../bril_shared/dom.ts";
import { mayHaveSideEffect } from "../bril_shared/instr.ts";
import { CfgBlockNode, cfgToFn, NiceCfg, NiceCfgNode, niceifyCfg, printCfgNode } from "../bril_shared/niceCfg.ts";
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

function findAllUsesOfVariable(varName: string, cfg: NiceCfg): Set<NiceCfgNode> {
    const o = new Set<NiceCfgNode>();

    cfg.blocks.forEach((block) => {
        if (typeof block === "string") { return; }
        if (block.block.some((instr) => {
            return "op" in instr && instr.args?.some((a) => a === varName);
        })) {
            o.add(block);
            return;
        }
    });

    return o;
}

function countDefsOfVar(varName: string, loop: Set<NiceCfgNode>): number {
    return Array.from(loop).map((node) => {
        if (typeof node === "string") {
            return 0;
        }
        return node.block.filter((instr) => "op" in instr && instr.dest === varName).length;
    }).reduce((a, x) => a + x, 0);
}

function prependBlock(cfg: NiceCfg, block: CfgBlockNode, loop: Set<NiceCfgNode>) {
    if (block.block.length === 0 || !("label" in block.block[0])) {
        block.block.unshift({
            label: `loop-header-${printCfgNode(block)}-${crypto.randomUUID()}`
        })
    }
    if (!("label" in block.block[0])) {
        throw new Error();
    }
    const label = block.block[0].label;
    const newLabel = `loop-pre-header-${label}-${crypto.randomUUID()}`;
    const newBlock: CfgBlockNode = {
        block: [
            { label: newLabel },
            { op: 'jmp', labels: [label] }
        ],
        preds: new Set(block.preds),
        succs: new Set([block]),
    };
    cfg.blocks.add(newBlock);
    block.preds.clear();
    block.preds.add(newBlock);
    newBlock.preds.forEach((pred) => {
        if (loop.has(pred)) { return; }
        if (pred === "ENTRY") {
            cfg.entry.delete(block);
            cfg.entry.add(newBlock);
            return;
        }
        pred.succs.delete(block);
        pred.succs.add(newBlock);
        const lastInstrInPred = pred.block[pred.block.length - 1];
        if (pred.block.length === 0 || !("op" in lastInstrInPred) || (lastInstrInPred.op !== "jmp" && lastInstrInPred.op !== "br")) {
            pred.block.push({
                op: "jmp",
                labels: [newLabel],
            })
        } else {
            lastInstrInPred.labels = lastInstrInPred.labels?.map(x => x === label ? newLabel : x);
        }
    });
    return newBlock;
}

export function licm(cfg: CFG) {
    const niceCfg = niceifyCfg(cfg);
    const loops = findLoops(niceCfg);
    const reaching = reachingDefs(cfg);
    const dommedBy = dominanceGraph(niceCfg);

    const invariantCandidates = new Map<NiceCfgNode, Set<BrilInstruction>>();
    const instrToBlock = new Map<BrilInstruction, CfgBlockNode>();

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

                    if (!instr.dest) { return; }
                    const { dest } = instr;

                    const uses = findAllUsesOfVariable(dest, niceCfg);
                    if (Array.from(uses).some((use) => typeof use !== "string" && !dommedBy.get(use)!.has(block))) {
                        return;
                    }
                    if (countDefsOfVar(dest, loop) !== 1) {
                        return;
                    }

                    if (!val.has(instr)) {
                        val.add(instr);
                        instrToBlock.set(instr, block);
                        changed = true;
                    }
                }
            });

            return { val, changed };
        })(new Set());

        invariantCandidates.set(headNode, invariantInstrs);
    });

    invariantCandidates.forEach((instrs, headNode) => {
        const loop = loops.get(headNode);
        if (!loop) {throw new Error();}
        if (typeof headNode === "string") {return;}
        const preHeader = prependBlock(niceCfg, headNode, loop);
        const lastInstr = preHeader.block.pop()!;
        instrs.forEach((instr) => {
            preHeader.block.push(instr);
            const containingBlock = instrToBlock.get(instr);
            if (!containingBlock) { throw new Error(); }
            containingBlock.block = containingBlock.block.filter(x => x !== instr);
        });
        preHeader.block.push(lastInstr);
    });

    return niceCfg;
}

export function licmProgram(program: BrilProgram): BrilProgram {
    const p: BrilProgram = {
        functions: program.functions.map((fn) => {
            const {blocks, mapping} = getBlocks(fn.instrs);
            const cfg = getCfg(blocks, mapping);
            const res = licm(cfg);
            return { ...fn, instrs: cfgToFn(res) };
        }),
    };

    return p;
}