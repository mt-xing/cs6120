import { getProgramFromCmdLine } from "../bril_shared/cfg.ts";
import { jsonStringify } from "../bril_shared/io.ts";
import { ssaProgram } from "./ssa.ts";

const program = await getProgramFromCmdLine();
const finalProgram = ssaProgram(program);

console.log(jsonStringify(finalProgram));
