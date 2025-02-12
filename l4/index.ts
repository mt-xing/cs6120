import { getCfgsFromCmdLine } from "../bril_shared/cfg.ts";
import { reachingDefs } from "./reaching.ts";

const cfgs = await getCfgsFromCmdLine();
Object.entries(cfgs).forEach(([name, cfg]) => {
    console.log(name);
    console.log(reachingDefs(cfg));
});
