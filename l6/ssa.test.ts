import { brilTest } from "../bril_shared/brilTest.ts";
import { ssaProgram } from "./ssa.ts";

brilTest("SSA", [
    // { folder: "./tests", optimization: ssaProgram, strategy: "loose" },
    { folder: "../bril_tests/benchmarks/core", optimization: ssaProgram, strategy: "loose" },
]);
