import { dominanceGraph } from "../bril_shared/dom.ts";
import { NiceCfg, NiceCfgNode, printCfgNode } from "../bril_shared/niceCfg.ts";

export function findLoops(cfg: NiceCfg) {
    const domGraph = dominanceGraph(cfg);
    const loops = new Set<Set<NiceCfgNode>>();

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
                console.log("FOUND A BACK EDGE", printCfgNode(block), printCfgNode(succ));
                const headNode = succ;
                const loop = new Set<NiceCfgNode>();
                loops.add(loop);
                loop.add(block);
                loop.add(headNode);
                addAllPredsToSet(block, loop, headNode);
                console.log(loop);
            }
        });
    });

    return loops;
}
