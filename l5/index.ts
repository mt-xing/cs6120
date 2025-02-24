import { dominanceGraph, dominanceTree, printDominanceTree, printGraph } from "./dom.ts";
import { getNiceCfgsFromCommandLine } from "./niceCfg.ts";

const cfgs = await getNiceCfgsFromCommandLine();
Object.entries(cfgs).forEach(([name, cfg]) => {
    console.log(name);
    const graph = dominanceGraph(cfg);
    printGraph(graph);
    const tree = dominanceTree(graph);
    printDominanceTree(tree);
});
