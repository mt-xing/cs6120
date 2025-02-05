import { runOnAllInFolder } from "./brilTest.ts";
import { renameOverwrittenVariablesForProgram } from "./lvn.ts";

await runOnAllInFolder("./dce_strict_tests", "Var Rename", renameOverwrittenVariablesForProgram, false);
await runOnAllInFolder("./dce_harder_tests", "Var Rename", renameOverwrittenVariablesForProgram, false);
await runOnAllInFolder("../bril_benchmarks", "Var Rename", renameOverwrittenVariablesForProgram, false);
