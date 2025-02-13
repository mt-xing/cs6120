import { BasicBlock, BrilInstruction, CFG } from "../bril_shared/cfg.ts";
import { dataflow } from "./dataflow.ts";

function arrayEquals<T>(a: T[], b: T[]): boolean {
    return a.length == b.length && a.every((x, i) => b[i] === x);
}

export function reachingDefs(cfg: CFG): Map<BasicBlock, Map<string, BrilInstruction[]>> {
    return dataflow<Map<string, BrilInstruction[]>>(cfg, true, () => new Map(),
        (b, ins) => {
            const set = new Map(ins);
            b.forEach((instr) => {
                if (!("op" in instr)) { return; }
                if (instr.dest) {
                    set.set(instr.dest, [instr]);
                }
            });
            return set;
        }, (vals) => {
            const r = new Map<string, BrilInstruction[]>();
            vals.forEach(m => {
                m.forEach((entry, key) => {
                    const candidate = r.get(key);
                    if (candidate === undefined) {
                        r.set(key, entry);
                    } else {
                        const set = new Set<BrilInstruction>(candidate);
                        entry.forEach(x => set.add(x));
                        r.set(key, Array.from(set));
                    }
                });
            });
            return r;
        }, (a, b) => a.size === b.size && Array.from(a).every(x => arrayEquals(x[1], b.get(x[0]) ?? []))
    );
}
