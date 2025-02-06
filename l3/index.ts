import { getProgramFromCmdLine } from "../bril_shared/cfg.ts";
import { lvn } from "./lvn.ts";

const p = await getProgramFromCmdLine();
console.log(JSON.stringify(lvn(p)));
