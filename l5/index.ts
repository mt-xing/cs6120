import { dominanceFrontier, dominanceGraph, dominanceTree, printDominanceTree, printGraph } from "./dom.ts";
import { getNiceCfgsFromCommandLine } from "./niceCfg.ts";

const cfgs = await getNiceCfgsFromCommandLine();
Object.entries(cfgs).forEach(([name, cfg]) => {
    console.log("================");
    console.log(name);
    console.log("================");
    console.log();

    const graph = dominanceGraph(cfg);
    printGraph(graph, "Dommed By");

    const tree = dominanceTree(graph);
    printDominanceTree(tree);

    printGraph(dominanceFrontier(graph), "Dom Frontier");
});
