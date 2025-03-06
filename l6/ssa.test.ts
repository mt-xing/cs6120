import { brilTest } from "../bril_shared/brilTest.ts";
import { ssaProgram } from "./ssa.ts";

brilTest("SSA", [
    // { folder: "./tests", optimization: ssaProgram, strategy: "loose" },
    { folder: "../bril_tests", optimization: ssaProgram, strategy: "loose" },
]);
