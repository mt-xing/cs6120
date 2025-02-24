import { CfgBlockNode, NiceCfg } from "./niceCfg.ts";

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

    let change = true;
    while (change) {
        change = false;
        blockList.forEach((block) => {
            const domSet = getDom(block);
            const originalSize = domSet.size;
            domSet.add(block);

            let predIntersect: Set<CfgBlockNode | "EXIT"> | null = null;

            for (const pred of (block === "EXIT" ? exitPreds : block.preds)) {
                if (pred === "ENTRY") { continue; }
                if (predIntersect === null) {
                    predIntersect = new Set(getDom(pred));
                } else {
                    predIntersect = predIntersect.intersection(getDom(pred));
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

export function printGraph(graph: DomGraph) {
    const getBlockString = (b: CfgBlockNode | "EXIT"): string => {
        if (b === "EXIT") {
            return "Exit";
        }
        return JSON.stringify(b.block);
    };

    graph.forEach((doms, block) => {
        console.log(`Node: ${getBlockString(block)}`);
        console.log("Doms:");
        doms.forEach(d => console.log(`-\t${getBlockString(d)}`));
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
    const blockText = block === undefined ? "ENTRY" : (block === "EXIT" ? "EXIT" : JSON.stringify(block.block));
    console.log(`${spacing}|- ${blockText}`);
    tree.forEach(c => {
        printDominanceTree(c.children, c.block, (indent ?? 0) + 1);
    });
}