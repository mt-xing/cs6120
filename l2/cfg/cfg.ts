type Type = string | {[key: string]: Type};
type BrilInstruction = {
    op: string;
    dest?: string;
    type?: Type;
    args?: string[];
    funcs?: string[];
    labels?: string[];
} | { label: string };
type BrilFunction = {
    name: string;
    args?: {name: string; type: Type}[];
    type?: Type;
    instrs: BrilInstruction[];
};
type BrilProgram = {
    functions: BrilFunction[]
};

const filename = Deno.args[0];
const text = await Deno.readTextFile(filename);

const program = JSON.parse(text) as BrilProgram;

/**
 * Returns the blocks in the CFG in order of appearance,
 * as well as a mapping from the name of each label to the
 * block that follows that label. Note that any blocks not
 * started with a label will not be mapped.
 */
function getBlocks(instructions: BrilInstruction[]): {
    blocks: BrilInstruction[][];
    mapping: Map<string, BrilInstruction[]>;
} {
    const labelledBlocks = new Set<BrilInstruction[]>();
    const mapping = new Map<string, BrilInstruction[]>();
    const blocks: BrilInstruction[][] = [];
    let curr: BrilInstruction[] = [];
    blocks.push(curr);

    instructions.forEach(instr => {
        if ("op" in instr && (instr.op === "jmp" || instr.op === "br")) {
            curr.push(instr);
            curr = [];
            blocks.push(curr);
        } else if ("label" in instr) {
            curr = [];
            blocks.push(curr);
            labelledBlocks.add(curr);
            mapping.set(instr.label, curr);
        } else {
            curr.push(instr);
        }
    });

    return { blocks: blocks.filter(b => b.length > 0 || labelledBlocks.has(b)), mapping };
}

/**
 * Represents each block as an array of Bril Instructions, and represents the CFG as a mapping
 * from blocks to sets of blocks. Note that the first entry in the map is a mapping from
 * an empty array to the first block, representing the entry point of the CFG. Any block that
 * does not have a mapping set is implicitly considered to point to the exit of the CFG.
 */
function getCfg(blocks: BrilInstruction[][], mapping: Map<string, BrilInstruction[]>): Map<BrilInstruction[], Set<BrilInstruction[]>> {
    const cfg = new Map<BrilInstruction[], Set<BrilInstruction[]>>();
    
    if (blocks.length > 0) {
        const s = new Set<BrilInstruction[]>();
        s.add(blocks[0]);
        cfg.set([], s);
    }

    blocks.forEach((block, i, arr) => {
        const last = block.length > 0 ? block[block.length - 1] : undefined;
        if (last && "op" in last && last.op === "jmp") {
            const s = new Set<BrilInstruction[]>();
            s.add(mapping.get(last.labels![0])!);
            cfg.set(block, s);
        } else if (last && "op" in last && last.op === "br") {
            const s = new Set<BrilInstruction[]>();
            s.add(mapping.get(last.labels![0])!);
            s.add(mapping.get(last.labels![1])!);
            cfg.set(block, s);
        } else if (last && "op" in last && last.op === "ret") {
            // Returns do not have a successor in my graph representation
        } else if (i !== arr.length - 1) {
            const s = new Set<BrilInstruction[]>();
            s.add(arr[i + 1]);
            cfg.set(block, s);
        }
    });

    return cfg;
}

program.functions.forEach(fn => {
    const {blocks, mapping} = getBlocks(fn.instrs);
    const cfg = getCfg(blocks, mapping);
    console.log(`CFG for function "${fn.name}"`);
    console.log(cfg);
})