import { getProgramFromCmdLine } from "../bril_shared/cfg.ts";
import { jsonStringify } from "../bril_shared/io.ts";
import { licmProgram } from "./loop.ts";

const program = await getProgramFromCmdLine();
const newProgram = licmProgram(program);
console.log(jsonStringify(newProgram));
