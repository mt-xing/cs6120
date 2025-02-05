import { runOnAllInFolder, testFileForCorrectnessAndReduction } from "./brilTest.ts";
import { lvnLite } from "./lvn.ts";

await runOnAllInFolder("./dce_strict_tests", "LVN Lite", lvnLite, false);
await runOnAllInFolder("./dce_harder_tests", "LVN Lite", lvnLite, false);
await runOnAllInFolder("../bril_benchmarks", "LVN Lite", lvnLite, false);

// Deno.test(`LVN`, async () => {
//     await testFileForCorrectnessAndReduction(lvnLite, "../bril_benchmarks/mem/dot-product.bril", false);
// });