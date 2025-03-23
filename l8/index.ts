import { getCfgsFromCmdLine } from "../bril_shared/cfg.ts";
import { licm } from "./loop.ts";

const cfgs = await getCfgsFromCmdLine();
Object.entries(cfgs).forEach(([_name, cfg]) => {
    licm(cfg);
});
