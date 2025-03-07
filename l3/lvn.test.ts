import { brilTest } from "./brilTest.ts";
// import { brilTest, testFileForCorrectnessAndReduction } from "./brilTest.ts";
import { lvn, lvnLite } from "./lvn.ts";

brilTest("LVN", [
    { folder: "./dce_strict_tests", prefix: "LVN Lite", optimization: lvnLite, strict: false },
    { folder: "./dce_harder_tests", prefix: "LVN Lite", optimization: lvnLite, strict: false },
    { folder: "./lvn_nonstrict_tests", prefix: "LVN Lite", optimization: lvnLite, strict: false },
    { folder: "../bril_tests", prefix: "LVN Lite", optimization: lvnLite, strict: false },
    
    { folder: "./lvn_strict_tests", optimization: lvn, strict: true },
    { folder: "./lvn_nonstrict_tests", optimization: lvn, strict: false },
    { folder: "./dce_strict_tests", optimization: lvn, strict: false },
    { folder: "./dce_harder_tests", optimization: lvn, strict: false },
    { folder: "../bril_tests", optimization: lvn, strict: false },
]);

// Deno.test(`LVN`, async () => {
//     console.log(await testFileForCorrectnessAndReduction(lvn, "../bril_tests/float/leibniz.bril", false));
//     console.log(await testFileForCorrectnessAndReduction(lvn, "./lvn_nonstrict_tests/swap.bril", false));
//     console.log(await testFileForCorrectnessAndReduction(lvn, "./lvn_strict_tests/comm_float.bril", true));
// });
