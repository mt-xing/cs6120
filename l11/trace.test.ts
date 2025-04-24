import { brilTest } from "../bril_shared/brilTest.ts";
import { BrilProgram } from "../bril_shared/cfg.ts";
import { rewriteMainFn, getTraceFromMain } from "./trace.ts";

async function optimization(program: BrilProgram, args: string[]): Promise<BrilProgram> {
    const mainFn = program.functions.filter(x => x.name === "main");
    if (mainFn.length !== 1) {
        throw new Error("Could not find single main function");
    }
    const trace = await getTraceFromMain(program, args, true);

    const newInstrs = rewriteMainFn(mainFn[0], trace);
    const newProgram: BrilProgram = {
        functions: [{
            ...mainFn[0],
            instrs: newInstrs
        }].concat(program.functions.filter(x => x.name !== "main")),
    };
    return newProgram;
}

brilTest("Tracing Simple", [
    { folder: "./tests", optimization, strategy: "loose" },
    { folder: "../bril_tests/benchmarks/core", optimization, strategy: "loose" },
]);

brilTest("Tracing Exit", [
    { folder: "./tests/branch", optimization: (program: BrilProgram, _args: string[]): Promise<BrilProgram> => {
        return optimization(program, ["5"])
    }, strategy: "loose" },
])
