import { brilTest } from "./brilTest.ts";
import { renameOverwrittenVariablesForProgram } from "./lvn.ts";

brilTest("Var Rename", [
    { folder: "./dce_strict_tests", optimization: renameOverwrittenVariablesForProgram, strict: false },
    { folder: "./dce_harder_tests", optimization: renameOverwrittenVariablesForProgram, strict: false },
    { folder: "../bril_tests", optimization: renameOverwrittenVariablesForProgram, strict: false },
]);
