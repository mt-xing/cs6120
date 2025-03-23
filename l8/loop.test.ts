import { brilTest } from "../bril_shared/brilTest.ts";
import { licmProgram } from "./loop.ts";

brilTest("LICM", [
    { folder: "./tests", optimization: licmProgram, strategy: "loose" },
    { folder: "../bril_tests", optimization: licmProgram, strategy: "loose" },
]);
