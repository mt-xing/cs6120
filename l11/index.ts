import { BrilProgram, getProgramFromCmdLine } from "../bril_shared/cfg.ts";
import { jsonStringify } from "../bril_shared/io.ts";
import { getTraceFromMain, rewriteMainFn } from "./trace.ts";

const program = await getProgramFromCmdLine();
const mainFn = program.functions.filter(x => x.name === "main");
if (mainFn.length !== 1) {
    throw new Error("Could not find single main function");
}
const trace = await getTraceFromMain(program, Deno.args.slice(1));

const newInstrs = rewriteMainFn(mainFn[0], trace);
const newProgram: BrilProgram = {
    functions: [{
        ...mainFn[0],
        instrs: newInstrs
    }].concat(program.functions.filter(x => x.name !== "main")),
};
console.log(jsonStringify(newProgram));