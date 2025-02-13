import { BasicBlock, BrilInstruction, CFG } from "../bril_shared/cfg.ts";
import { dataflow } from "./dataflow.ts";

function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
    return a.size == b.size && Array.from(a).every(x => b.has(x));
}

export function reachingDefs(cfg: CFG): Map<BasicBlock, Map<string, Set<BrilInstruction>>> {
    return dataflow<Map<string, Set<BrilInstruction>>>(cfg, true, () => new Map(),
        (b, ins) => {
            const set = new Map(ins);
            b.forEach((instr) => {
                if (!("op" in instr)) { return; }
                if (instr.dest) {
                    set.set(instr.dest, new Set([instr]));
                }
            });
            return set;
        }, (vals) => {
            const r = new Map<string, Set<BrilInstruction>>();
            vals.forEach(m => {
                m.forEach((entry, key) => {
                    const candidate = r.get(key);
                    if (candidate === undefined) {
                        r.set(key, entry);
                    } else {
                        entry.forEach(x => candidate.add(x));
                    }
                });
            });
            return r;
        }, (a, b) => a.size === b.size && Array.from(a).every(x => setEquals(x[1], b.get(x[0]) ?? new Set()))
    );
}
