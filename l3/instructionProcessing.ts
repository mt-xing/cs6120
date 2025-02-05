import { BrilInstruction } from "../bril_shared/cfg.ts";

export function hasSideEffect(instr: BrilInstruction) {
    return !("label" in instr) && !("dest" in instr);
}

/**
 * Higher order function which takes in a function that transforms some value of type `T` and
 * returns both the new value and a boolean flag indicating whether the value has changed, and
 * repeatedly runs that function until the value has reached a fixed point.
 */
export function iterateUntilConvergence<T>(fn: (val: T) => {val: T, changed: boolean}): (val: T) => T {
    return (val: T) => {
        let result = {val, changed: true};
        while (result.changed) {
            result = fn(result.val);
        }
        return result.val;
    };
}