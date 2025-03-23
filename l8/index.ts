import { getCfgsFromCmdLine } from "../bril_shared/cfg.ts";
import { cfgToFn } from "../bril_shared/niceCfg.ts";
import { licm } from "./loop.ts";

const cfgs = await getCfgsFromCmdLine();
Object.entries(cfgs).forEach(([_name, cfg]) => {
    const newCfg = licm(cfg);
    const newProgram = cfgToFn(newCfg);
    console.log(newProgram);
});
