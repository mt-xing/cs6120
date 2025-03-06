import { BasicBlock, BrilInstruction, CFG, getCfgsFromCmdLine } from "../bril_shared/cfg.ts";
import { jsonStringify } from "../bril_shared/io.ts";
import { extractFromSet } from "../l4/dataflow.ts";
import { newName } from "./newName.ts";

export type CfgBlockNode = {
    block: BasicBlock;
    preds: Set<CfgBlockNode | "ENTRY">;
    succs: Set<CfgBlockNode | "EXIT">;
};

export type NiceCfgNode = CfgBlockNode | "ENTRY" | "EXIT";

export function printCfgNode(n: NiceCfgNode) {
    if (n === "ENTRY") {
        return "Entry";
    }
    if (n === "EXIT") {
        return "Exit";
    }
    if (!n.block) {
        return "undefined";
    }
    if (n.block.length > 0) {
        const firstInstr = n.block[0];
        if ("label" in firstInstr) {
            return firstInstr.label;
        }
    }
    const str = jsonStringify(n.block);
    const MAX_LENGTH = 64;
    if (str.length <= MAX_LENGTH) {
        return str;
    }
    return str.substring(0, MAX_LENGTH) + "...";
}

export type NiceCfg = {
    blocks: Set<CfgBlockNode>;
    entry: Set<CfgBlockNode>;
    exit: Set<CfgBlockNode>;
};

export function niceifyCfg(cfg: CFG): NiceCfg {
    const startBlocks = new Set<CfgBlockNode>();
    const exitBlocks = new Set<CfgBlockNode>();

    const niceBlockLookup = new Map<BasicBlock, CfgBlockNode>();
    const getNiceBlock = (b: BasicBlock): CfgBlockNode => {
        if (b === undefined) {
            console.error(b, niceBlockLookup);
            throw new Error("w");
        }
        const candidate = niceBlockLookup.get(b);
        if (candidate !== undefined) {
            return candidate;
        }
        const x = {
            block: b,
            preds: new Set<CfgBlockNode | "ENTRY">(),
            succs: new Set<CfgBlockNode | "EXIT">(),
        };
        niceBlockLookup.set(b, x);
        return x;
    };
    
    cfg.forEach((outBlocks, inBlock) => {
        if (inBlock === "START") {
            outBlocks.forEach(b => {
                const bb = getNiceBlock(b);
                startBlocks.add(bb);
                bb.preds.add("ENTRY");
            });
            return;
        }
        const current = getNiceBlock(inBlock);
        outBlocks.forEach((outBlock) => {
            const niceOut = getNiceBlock(outBlock);
            niceOut.preds.add(current);
            current.succs.add(niceOut);
            if (!cfg.has(outBlock)) {
                exitBlocks.add(niceOut);
                niceOut.succs.add("EXIT");
            }
        });
    });

    return {
        blocks: new Set(niceBlockLookup.values()),
        entry: startBlocks,
        exit: exitBlocks,
    };
}

export async function getNiceCfgsFromCommandLine(): Promise<Record<string, NiceCfg>> {
    const cfgs = await getCfgsFromCmdLine();
    const r: Record<string, NiceCfg> = {};
    Object.entries(cfgs).forEach(([name, cfg]) => {
        r[name] = niceifyCfg(cfg);
    });
    return r;
}

export function cfgToFn(cfg: NiceCfg): BrilInstruction[] {
    const o: BrilInstruction[] = [];

    if (cfg.entry.size !== 1) {
        throw new Error("Number of start nodes not equal to 1: " + cfg.entry.size);
    }
    const printedNodes = new Set<CfgBlockNode>();
    function processNode(n: CfgBlockNode) {
        if (printedNodes.has(n)) { return; }
        n.block.forEach(x => o.push(x));
        printedNodes.add(n);
        if (n.block.length > 0) {
            const lastInstr = n.block[n.block.length - 1];
            if ("op" in lastInstr) {
                switch (lastInstr.op) {
                    case "jmp":
                    case "br":
                    case "ret":
                        break;
                    default: {
                        if (n.succs.size !== 1) {
                            if (n.succs.size === 0) {
                                n.block.push({
                                    op: "ret"
                                });
                                break;
                            }
                            throw new Error("Non-branch instruction with multiple succs");
                        }
                        const succ = extractFromSet(n.succs);
                        if (succ === "EXIT") {
                            n.block.push({
                                op: "ret"
                            });
                            break;
                        }
                        const hasLabel = succ.block.length > 0 && "label" in succ.block[0] ? succ.block[0].label : undefined;
                        const label = hasLabel ?? newName("jumptarget", "_");
                        const jumpInstr: BrilInstruction = {
                            op: "jmp",
                            label,
                        };
                        n.block.push(jumpInstr);
                        if (hasLabel === undefined) {
                            succ.block.unshift({ label });
                        }
                    }
                }
            }

        }
        n.succs.forEach(x => x === "EXIT" ? undefined : processNode(x));
    }
    processNode(extractFromSet(cfg.entry));

    return o;
}