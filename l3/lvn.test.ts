import { runOnAllInFolder } from "./brilTest.ts";
// import { runOnAllInFolder, testFileForCorrectnessAndReduction } from "./brilTest.ts";
import { lvn, lvnLite } from "./lvn.ts";

await runOnAllInFolder("./dce_strict_tests", "LVN Lite", lvnLite, false);
await runOnAllInFolder("./dce_harder_tests", "LVN Lite", lvnLite, false);
await runOnAllInFolder("./lvn_nonstrict_tests", "LVN Lite", lvnLite, false);
await runOnAllInFolder("../bril_benchmarks", "LVN Lite", lvnLite, false);

await runOnAllInFolder("./lvn_strict_tests", "LVN", lvn, true);
await runOnAllInFolder("./dce_strict_tests", "LVN", lvn, false);
await runOnAllInFolder("./dce_harder_tests", "LVN", lvn, false);
await runOnAllInFolder("./lvn_nonstrict_tests", "LVN Lite", lvn, false);
await runOnAllInFolder("../bril_benchmarks", "LVN", lvn, false);

// Deno.test(`LVN`, async () => {
//     await testFileForCorrectnessAndReduction(lvnLite, "../bril_benchmarks/mem/dot-product.bril", false);
// });