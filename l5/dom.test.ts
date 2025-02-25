import { assertEquals } from "@std/assert/equals";
import { BrilProgram, getCfgsFromProgram } from "../bril_shared/cfg.ts";
import { pipeStringIntoCmdAndGetOutput } from "../bril_shared/io.ts";
import { dominanceFrontier, dominanceGraph, dominanceTree } from "./dom.ts";
import { NiceCfg, NiceCfgNode, niceifyCfg, printCfgNode } from "./niceCfg.ts";
import { walk, WalkEntry } from "@std/fs/walk";

function doesADominateB(cfg: NiceCfg, a: NiceCfgNode, b: NiceCfgNode) {
    if (a === b) {
        return true;
    }
    function aDomBPath(currentNode: NiceCfgNode, path: Set<NiceCfgNode>): boolean {
        if (currentNode === "ENTRY") {
            return false;
        }
        const preds = currentNode === "EXIT" ? cfg.exit : currentNode.preds;
        // Unreachable node; pretend it also points to entry for consistency 
        if (preds.size === 0) {
            return a === "ENTRY";
        }
        return Array.from(preds).every((pred): boolean => {
            if (pred === a) { return true; }
            if (pred === "ENTRY") { return false; }
            if (path.has(pred)) { return true; }
            return aDomBPath(pred, path.union(new Set([pred])));
        });
    }
    return aDomBPath(b, new Set([b]));
}

function assertADominatesB(cfg: NiceCfg, a: NiceCfgNode, b: NiceCfgNode, filename: string, desc: string) {
    assertEquals(doesADominateB(cfg, a, b), true, `${desc}: ${printCfgNode(a)} does not dominate ${printCfgNode(b)} in ${filename}`);
}

async function testFileForProperDominance(
    filePath: string,
) {
    const brilText = await Deno.readTextFile(filePath);
    const programText = await pipeStringIntoCmdAndGetOutput("bril2json", brilText);

    const program = JSON.parse(programText.stdout) as BrilProgram;

    const cfgs = getCfgsFromProgram(program);

    Object.entries(cfgs).forEach(([_, rawCfg]) => {
        const cfg = niceifyCfg(rawCfg);

        const graph = dominanceGraph(cfg);
        graph.forEach((domSet, node) => {
            domSet.forEach((dom) => {
                assertADominatesB(cfg, dom, node, filePath, "Dominance");
            })
        });

        const tree = dominanceTree(graph);
        function checkTreeDoms(node: ReturnType<typeof dominanceTree>, prev: ReturnType<typeof dominanceTree>) {
            node.forEach((c) => {
                assertADominatesB(cfg, "ENTRY", c.block, filePath, "Dom Tree Entry");
                prev.forEach((p) => {
                    assertADominatesB(cfg, p.block, c.block, filePath, "Dom Tree Children");
                });
                checkTreeDoms(c.children, prev.union(new Set([c])));
            });
        }
        checkTreeDoms(tree, new Set());

        const frontier = dominanceFrontier(graph);
        frontier.forEach((frontier, node) => {
            frontier.forEach((frontierNode) => {
                assertEquals(doesADominateB(cfg, node, frontierNode), false, `Dom Frontier not itself: ${printCfgNode(node)} dominates ${printCfgNode(frontierNode)} in ${filePath}`);
                const preds = frontierNode === "EXIT" ? cfg.exit : frontierNode.preds;
                assertEquals(Array.from(preds).some((x) => doesADominateB(cfg, node, x)), true, `Dom Frontier: ${printCfgNode(node)} does not dominate ${printCfgNode(frontierNode)} in ${filePath}`);
            })
        });
    });
}

async function runOnAllInFolder(t: Deno.TestContext, folder: string) {
    const files: WalkEntry[] = [];
    for await (const file of walk(folder)) {
        if (file.isFile) {
            files.push(file);
        }
    }
    await Promise.all(files.map(file => {
        return t.step(`Dominance Test: ${file.name}`, async () => {
            await testFileForProperDominance(file.path);
        });
    }));
}

function dominanceTest(folders: string[]) {
    Deno.test({
        name: "Dominance Tests",
        async fn(t) {
            await Promise.all(folders.map(x => runOnAllInFolder(t, x)));
        },
        sanitizeExit: false,
        sanitizeOps: false,
        sanitizeResources: false,
    });
}

dominanceTest(["../bril_tests"]);
