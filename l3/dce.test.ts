import { brilTest } from "./brilTest.ts";
import { deadCodeEliminationProgram } from "./dce.ts";

brilTest("DCE", [
    { folder: "./dce_strict_tests", optimization: deadCodeEliminationProgram, strict: true },
    { folder: "./dce_harder_tests", optimization: deadCodeEliminationProgram, strict: false },
    { folder: "../bril_tests", optimization: deadCodeEliminationProgram, strict: false },
]);
