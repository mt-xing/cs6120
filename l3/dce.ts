import { BrilFunction, BrilInstruction, BrilProgram, getBlocks } from "../bril_shared/cfg.ts";
import { iterateUntilConvergence } from "./instructionProcessing.ts";

function hasSideEffect(instr: BrilInstruction) {
    return !("label" in instr) && !("dest" in instr);
}

function superSimpleDeadCodeElimination(val: BrilFunction) {
    const seen = new Set<string>();
    for (const instr of val.instrs) {
        if ("op" in instr && instr.args) {
            instr.args.forEach(x => seen.add(x));
        }
    }
    const newInstrs = val.instrs.filter(
        (instr) => hasSideEffect(instr) || !("op" in instr) || !instr.dest || seen.has(instr.dest)
    );
    return {
        val: {...val, instrs: newInstrs},
        changed: newInstrs.length !== val.instrs.length
    };
}

function blockDeadCodeElimination(blocks: BrilInstruction[][]) {
    const val: BrilInstruction[][] = [];
    for (const block of blocks) {
        const unusedAssignments = new Map<string, number>();
        const toDelete = new Set<number>();
        block.forEach((instr, i) => {
            if ("op" in instr) {
                instr.args?.forEach((rhsVar) => {
                    unusedAssignments.delete(rhsVar);
                });
                if (instr.dest) {
                    const lhsToDelete = unusedAssignments.get(instr.dest);
                    if (lhsToDelete !== undefined) {
                        toDelete.add(lhsToDelete);
                    }
                    if (hasSideEffect(instr)) {
                        unusedAssignments.delete(instr.dest);
                    } else {
                        unusedAssignments.set(instr.dest, i);
                    }
                }
            }
        });
        const newBlock = block.filter((_, i) => !toDelete.has(i));
        val.push(newBlock);
    }
    return {val, changed: val.length !== blocks.length || val.some((v, i) => v.length !== blocks[i].length)};
}

export const deadCodeElimination = iterateUntilConvergence((fn: BrilFunction) => {
    const r1 = superSimpleDeadCodeElimination(fn);
    const r2 = blockDeadCodeElimination(getBlocks(r1.val.instrs).blocks);
    const newInstrs = r2.val.flat(1);
    const newFn = {
        ...fn,
        instrs: newInstrs,
    };
    return {
        val: newFn,
        changed: r1.changed || r2.changed,
    }
});

export function deadCodeEliminationProgram(prog: BrilProgram): BrilProgram {
    return {
        functions: prog.functions.map(deadCodeElimination)
    };
}
