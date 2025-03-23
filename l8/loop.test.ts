import { brilTest } from "../bril_shared/brilTest.ts";
import { licmProgram } from "./loop.ts";

brilTest("LICM", [
    { folder: "./tests", optimization: licmProgram, strategy: "loose" },
    { folder: "../bril_tests/tests", optimization: licmProgram, strategy: "loose" },
    { folder: "../bril_tests/benchmarks/core", optimization: licmProgram, strategy: "loose" },
    { folder: "../bril_tests/benchmarks/float", optimization: licmProgram, strategy: "loose" },
    { folder: "../bril_tests/benchmarks/mem", optimization: licmProgram, strategy: "loose" },
]);
