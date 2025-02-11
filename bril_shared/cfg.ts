import { pipeStringIntoCmdAndGetOutput } from "./io.ts";

export type Type = string | {[key: string]: Type};
export type BrilInstruction = {
    op: string;
    dest?: string;
    type?: Type;
    args?: string[];
    funcs?: string[];
    labels?: string[];
    value?: number | boolean;
} | { label: string };
export type BrilFunction = {
    name: string;
    args?: {name: string; type: Type}[];
    type?: Type;
    instrs: BrilInstruction[];
};
export type BrilProgram = {
    functions: BrilFunction[]
};

export type BasicBlock = BrilInstruction[];

/**
 * Returns the blocks in the CFG in order of appearance,
 * as well as a mapping from the name of each label to the
 * block that follows that label. Note that any blocks not
 * started with a label will not be mapped.
 */
export function getBlocks(instructions: BrilInstruction[]): {
    blocks: BasicBlock[];
    mapping: Map<string, BasicBlock>;
} {
    const labelledBlocks = new Set<BasicBlock>();
    const mapping = new Map<string, BasicBlock>();
    const blocks: BasicBlock[] = [];
    let curr: BrilInstruction[] = [];
    blocks.push(curr);

    instructions.forEach(instr => {
        if ("op" in instr && (instr.op === "jmp" || instr.op === "br" || instr.op === "speculate" || instr.op === "guard")) {
            curr.push(instr);
            curr = [];
            blocks.push(curr);
        } else if ("label" in instr) {
            curr = [instr];
            blocks.push(curr);
            labelledBlocks.add(curr);
            mapping.set(instr.label, curr);
        } else {
            curr.push(instr);
        }
    });

    return { blocks: blocks.filter(b => b.length > 0 || labelledBlocks.has(b)), mapping };
}

export type CFG = Map<"START" | BasicBlock, Set<BasicBlock>>;

/**
 * Represents each block as an array of Bril Instructions, and represents the CFG as a mapping
 * from blocks to sets of blocks. Note that the first entry in the map is a mapping from
 * the constant "START" to the first block, representing the entry point of the CFG. Any block that
 * does not have a mapping set is implicitly considered to point to the exit of the CFG.
 */
export function getCfg(blocks: BasicBlock[], mapping: Map<string, BasicBlock>): CFG {
    const cfg = new Map<"START" | BasicBlock, Set<BasicBlock>>();
    
    if (blocks.length > 0) {
        const s = new Set<BasicBlock>();
        s.add(blocks[0]);
        cfg.set("START", s);
    }

    blocks.forEach((block, i, arr) => {
        const last = block.length > 0 ? block[block.length - 1] : undefined;
        if (last && "op" in last && last.op === "jmp") {
            const s = new Set<BasicBlock>();
            s.add(mapping.get(last.labels![0])!);
            cfg.set(block, s);
        } else if (last && "op" in last && last.op === "br") {
            const s = new Set<BasicBlock>();
            s.add(mapping.get(last.labels![0])!);
            s.add(mapping.get(last.labels![1])!);
            cfg.set(block, s);
        } else if (last && "op" in last && last.op === "ret") {
            // Returns do not have a successor in my graph representation
        } else if (i !== arr.length - 1) {
            const s = new Set<BasicBlock>();
            s.add(arr[i + 1]);
            cfg.set(block, s);
        }
    });

    return cfg;
}

export async function getProgramFromCmdLine() {
    const filename = Deno.args[0];
    const text = await Deno.readTextFile(filename);

    const splitFileName = filename.split(".");
    if (splitFileName[splitFileName.length - 1].toLowerCase() === "bril") {
        const res = await pipeStringIntoCmdAndGetOutput("bril2json", text);
        const program = JSON.parse(res.stdout) as BrilProgram;
        return program;
    }

    const program = JSON.parse(text) as BrilProgram;
    return program;
}

export function getCfgsFromProgram(program: BrilProgram) {

    const output: Record<string, CFG> = {};

    program.functions.forEach(fn => {
        const {blocks, mapping} = getBlocks(fn.instrs);
        const cfg = getCfg(blocks, mapping);
        output[fn.name] = cfg;
    })

    return output;
}

export async function getCfgsFromCmdLine() {
    const program = await getProgramFromCmdLine();
    return getCfgsFromProgram(program);
}
