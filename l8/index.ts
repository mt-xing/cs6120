import { getNiceCfgsFromCommandLine } from "../bril_shared/niceCfg.ts";
import { findLoops } from "./loop.ts";

const cfgs = await getNiceCfgsFromCommandLine();
Object.entries(cfgs).forEach(([_name, cfg]) => {
    findLoops(cfg);
});
