import { BrilInstruction } from "./cfg.ts";

export function mayHaveSideEffect(instr: BrilInstruction) {
    if ("op" in instr) {
        switch (instr.op) {
            case "phi":
            case "guard":
            case "commit":
            case "speculate":
            case "call":
            case "alloc":
            case "div":
                return true;
            default: break;
        }
    }
    return !("label" in instr) && !("dest" in instr);
}