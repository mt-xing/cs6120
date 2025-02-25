import { BasicBlock, CFG, getCfgsFromCmdLine } from "../bril_shared/cfg.ts";
import { jsonStringify } from "../bril_shared/io.ts";

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