import { CfgBlockNode, NiceCfg, NiceCfgNode, printCfgNode } from "./niceCfg.ts";

/**
 * Mapping from block to the blocks that dominate it.
 * Note "ENTRY" implicitly dominates all blocks.
 */
type DomGraph = Map<CfgBlockNode | "EXIT", Set<CfgBlockNode | "EXIT">>;

export function dominanceGraph(cfg: NiceCfg) {
    const dom = new Map<CfgBlockNode | "EXIT", Set<CfgBlockNode | "EXIT">>();
    const exitPreds = cfg.exit;
    const getDom = (b: CfgBlockNode | "EXIT") => {
        const candidate = dom.get(b);
        if (candidate !== undefined) {
            return candidate;
        }
        const n = new Set<CfgBlockNode>();
        dom.set(b, n);
        return n;
    }

    const blockList: Set<CfgBlockNode | "EXIT"> = new Set(cfg.blocks);
    blockList.add("EXIT");

    blockList.forEach((block) => {
        dom.set(block, new Set(blockList));
    });

    let change = true;
    while (change) {
        change = false;
        blockList.forEach((block) => {
            const domSet = getDom(block);
            const originalSize = domSet.size;
            domSet.clear();
            domSet.add(block);

            let predIntersect: Set<CfgBlockNode | "EXIT"> | null = null;

            for (const pred of (block === "EXIT" ? exitPreds : block.preds)) {
                if (pred === "ENTRY") { 
                    predIntersect = new Set();
                } else {
                    if (predIntersect === null) {
                        predIntersect = new Set(getDom(pred));
                    } else if (pred !== block) {
                        predIntersect = predIntersect.intersection(getDom(pred));
                    }
                }
            }

            predIntersect?.forEach(x => {
                domSet.add(x)
            });
            const newSize = domSet.size;

            if (newSize !== originalSize) {
                change = true;
            }
        });
    }
    return dom;
}

export function printGraph(graph: Map<NiceCfgNode, Set<CfgBlockNode | "EXIT">>, label: string) {
    const getBlockString = (b: NiceCfgNode): string => {
        if (b === "EXIT") {
            return "Exit";
        } else if (b === "ENTRY") {
            return "Start";
        }
        return printCfgNode(b);
    };

    graph.forEach((doms, block) => {
        console.log(`Node: ${getBlockString(block)}`);
        console.log(`${label}:`);
        doms.forEach(d => console.log(`-\t${getBlockString(d)}`));
        console.log();
    });
}

type DomTreeNode = {
    block: CfgBlockNode | "EXIT",
    children: Set<DomTreeNode>,
}

export function dominanceTree(graph: DomGraph) {
    const tree = new Set<DomTreeNode>();
    const graphNodes = Array.from(graph).sort((a, b) => a[1].size - b[1].size);
    graphNodes.forEach(([currentNode, domSet]) => {
        let treeNode = tree;
        const remainingDoms = new Set(domSet);
        remainingDoms.delete(currentNode);
        while (remainingDoms.size > 0) {
            const nextTreeNode = Array.from(treeNode).find(x => remainingDoms.has(x.block));
            if (nextTreeNode === undefined) {
                throw new Error();
            }
            treeNode = nextTreeNode.children;
            remainingDoms.delete(nextTreeNode.block);
        }
        treeNode.add({
            block: currentNode,
            children: new Set(),
        });
    });

    return tree;
}

export function printDominanceTree(tree: Set<DomTreeNode>, block?: CfgBlockNode | "EXIT", indent?: number) {
    const i = indent === undefined ? 0 : indent;
    const spacing = Array.from(new Array(i)).reduce(a => a + "\t", "");
    const blockText = block === undefined ? "ENTRY" : printCfgNode(block);
    console.log(`${spacing}|- ${blockText}`);
    tree.forEach(c => {
        printDominanceTree(c.children, c.block, (indent ?? 0) + 1);
    });
}

function reverseMap<T, U>(x: Map<T, Set<U>>): Map<U, Set<T>> {
    const oMap = new Map<U, Set<T>>();
    const get = (u: U) => {
        const candidate = oMap.get(u);
        if (candidate !== undefined) { return candidate; }
        const o = new Set<T>();
        oMap.set(u, o);
        return o;
    }
    x.forEach((valSet, key) => {
        valSet.forEach((val) => {
            get(val).add(key);
        });
    });
    return oMap;
}

export function dominanceFrontier(graph: DomGraph) {
    const mapOfDoms: Map<NiceCfgNode, Set<CfgBlockNode | "EXIT">> = reverseMap(graph);
    mapOfDoms.set("ENTRY", new Set(graph.keys()));

    const o = new Map<CfgBlockNode | "ENTRY", Set<CfgBlockNode | "EXIT">>();

    mapOfDoms.forEach((domSet, node) => {
        const result = new Set<CfgBlockNode | "EXIT">();
        if (node === "EXIT") { return; }
        o.set(node, result);

        domSet.forEach((x) => {
            if (x !== "EXIT") {
                x.succs.forEach((c) => {
                    if (!domSet.has(c) || c === node) {
                        result.add(c);
                    }
                });
            }
        })
    });

    return o;
}
