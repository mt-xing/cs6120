import { runOnAllInFolder } from "./brilTest.ts";
import { deadCodeEliminationProgram } from "./dce.ts";

await runOnAllInFolder("./dce_strict_tests", "DCE", deadCodeEliminationProgram, true);
await runOnAllInFolder("./dce_harder_tests", "DCE", deadCodeEliminationProgram, false);
await runOnAllInFolder("../bril_benchmarks", "DCE", deadCodeEliminationProgram, false);
