import { BasicBlock, CFG } from "../bril_shared/cfg.ts";

function reverseCfg(cfg: CFG): CFG {
    const r = new Map<BasicBlock | "START", Set<BasicBlock>>();
    
    const blocksWithoutMapping = new Set<BasicBlock>();

    cfg.forEach((outBlocks, inBlock) => {
        if (inBlock === "START") {
            return;
        }
        outBlocks.forEach((outBlock) => {
            const s = r.get(outBlock);
            if (s === undefined) {
                const newS = new Set<BasicBlock>();
                newS.add(inBlock);
                r.set(outBlock, newS);
            } else {
                s.add(inBlock);
            }

            if (!cfg.has(outBlock)) {
                blocksWithoutMapping.add(outBlock);
            }
        });
    });
    
    r.set("START", blocksWithoutMapping);
    return r;
}

function extractFromSet<T>(x: Set<T>): T {
    for (const e of x) {
        x.delete(e);
        return e;
    }
    throw new Error("Set is empty");
}

export function dataflow<T>(
    cfg: CFG,
    forwards: boolean,
    inB1: (() => T),
    transfer: (b: BasicBlock, inB: T) => T,
    merge: (values: T[]) => T,
    eq: (a: T, b: T) => boolean,
): Map<BasicBlock, T> {
    const revCfg = reverseCfg(cfg);

    const graph = forwards ? cfg : revCfg;
    const graphPred = forwards ? revCfg : cfg;

    const outVals = new Map<BasicBlock, T>();

    const worklist = new Set<BasicBlock>();

    graph.forEach((_, block) => {
        if (block !== "START") {
            outVals.set(block, inB1());
            worklist.add(block);
        }
    });
    graphPred.forEach((_, block) => {
        if (block !== "START") {
            outVals.set(block, inB1());
            worklist.add(block);
        }
    });

    while(worklist.size > 0) {
        const block = extractFromSet(worklist);

        const pred = graphPred.get(block);
        const inVals = pred === undefined ? inB1() : merge(Array.from(pred).map(x => outVals.get(x)!));
        const ov = transfer(block, inVals);
        if (!eq(ov, outVals.get(block)!)) {
            outVals.set(block, ov);
            graph.get(block)?.forEach(b => {
                worklist.add(b);
            });
        }
    }

    return outVals;
}