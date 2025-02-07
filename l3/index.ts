import { getProgramFromCmdLine } from "../bril_shared/cfg.ts";
import { jsonStringify } from "../bril_shared/io.ts";
import { lvn } from "./lvn.ts";

const p = await getProgramFromCmdLine();
console.log(jsonStringify(lvn(p)));
