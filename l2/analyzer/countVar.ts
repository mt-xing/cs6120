type Type = string | {[key: string]: Type};
type BrilFunction = {
    name: string;
    args?: {name: string; type: Type}[];
    type?: Type;
    instrs: {
        op: string;
        dest?: string;
        type?: Type;
        args?: string[];
        funcs?: string[];
        labels?: string[];
    }[];
};
type BrilProgram = {
    functions: BrilFunction[]
};

const filename = Deno.args[0];
const text = await Deno.readTextFile(filename);

const program = JSON.parse(text) as BrilProgram;

function countVarsInFunc(fn: BrilFunction): number {
    const vars = new Set<string>();
    fn.instrs.forEach(instr => {
        if (instr.dest) {
            vars.add(instr.dest);
        }
    });
    return vars.size;
}

const fnToVars = new Map<string, number>();
program.functions.forEach(fn => {
    fnToVars.set(fn.name, countVarsInFunc(fn));
});

fnToVars.entries().forEach(entry => {
    console.log(`Function "${entry[0]}" has ${entry[1]} unique variable${entry[1] === 1 ? '' : 's'}`);
});