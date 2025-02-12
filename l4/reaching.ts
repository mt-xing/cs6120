import { BasicBlock, CFG } from "../bril_shared/cfg.ts";
import { dataflow } from "./dataflow.ts";

export function reachingDefs(cfg: CFG): Map<BasicBlock, Set<string>> {
    return dataflow<Set<string>>(cfg, true, () => new Set(),
        (b, ins) => {
            const set = new Set(ins);
            b.forEach((instr) => {
                if (!("op" in instr)) { return; }
                if (instr.dest) {
                    set.add(instr.dest);
                }
            });
            return set;
        }, (vals) => {
            const r = new Set<string>();
            vals.forEach(s => {
                s.forEach(x => r.add(x));
            });
            return r;
        }, (a, b) => a.size === b.size && Array.from(a).every(x => b.has(x))
    );
}
