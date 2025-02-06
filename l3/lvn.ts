import { BrilProgram, getBlocks } from "../bril_shared/cfg.ts";
import { BrilInstruction } from "../bril_shared/cfg.ts";
import { deadCodeEliminationProgram } from "./dce.ts";

function renameOverwrittenVariables(block: BrilInstruction[]) {
    const lastAssignIndex = new Map<string, number>();
    block.forEach((instr, i) => {
        if ("dest" in instr && instr.dest) {
            lastAssignIndex.set(instr.dest, i);
        }
    });

    let varCounter = 0;
    const currentVarNames = new Map<string, string>();

    const newBlock: BrilInstruction[] = [];
    block.forEach((instr, i) => {
        if ("label" in instr) { newBlock.push(instr); return; }
        const newInstr = { ...instr };
        if (instr.args) {
            newInstr.args = instr.args.map(n => currentVarNames.get(n) ?? n);
        }
        if (instr.dest && lastAssignIndex.get(instr.dest) !== i) {
            const newDest = `${instr.dest}:${varCounter}`;
            varCounter++;
            newInstr.dest = newDest;
            currentVarNames.set(instr.dest, newDest);
        } else if (instr.dest && lastAssignIndex.get(instr.dest) === i) {
            currentVarNames.delete(instr.dest);
        }
        newBlock.push(newInstr);
    });
    return newBlock;
}

export function renameOverwrittenVariablesForProgram(program: BrilProgram) {
    return {
        functions: program.functions.map((fn) => {
            return {
                ...fn,
                instrs: getBlocks(fn.instrs).blocks.map(renameOverwrittenVariables).flat(),
            }
        })
    };
}

// const p = await getProgramFromCmdLine();
// console.log(JSON.stringify(renameOverwrittenVariablesForProgram(p)));

type ExpressionRepresentation = {
    type: "id",
    op: "id",
    args: [number],
} | {
    type: "commOp",
    op: string,
    args: [number, number],
} | {
    type: "op",
    op: string,
    args: number[],
} | {
    type: "unknown",
    op: "",
    args: [],
};

function getCanonicalExprRep(exprRep: ExpressionRepresentation): ExpressionRepresentation {
    switch (exprRep.type) {
        case "id":
            return exprRep;
        case "commOp":
            return {
                ...exprRep,
                args: exprRep.args.slice().sort((a, b) => a - b) as [number, number],
            };
        case "op":
        case "unknown":
            return exprRep;
    }
}

type ExprRepString = `${string}:${string}:${string}`

function getExprRepString(exprRep: ExpressionRepresentation): ExprRepString {
    const r = getCanonicalExprRep(exprRep);
    return `${r.type}:${r.op}:${r.args.reduce((a, x) => `${a}:${x}`, '')}`;
}

const SIDE_EFFECT_OPS = new Set(["alloc", "call"]);

function lvnBlock(block: BrilInstruction[]) {
    const lookupTable: { expression: ExpressionRepresentation, varName: string }[] = [];
    const exprInTable = new Map<ExprRepString, number>();
    const env = new Map<string, number>();
    const newBlock: BrilInstruction[] = [];

    function addExpr(expr: ExpressionRepresentation, varName: string) {
        const expression = getCanonicalExprRep(expr);
        lookupTable.push({expression, varName});
        const i = lookupTable.length - 1;
        exprInTable.set(getExprRepString(expression), i);
        env.set(varName, i);
        return i;
    }

    function lookupEnvOrAdd(varName: string) {
        const candidate = env.get(varName);

        if (candidate === undefined) {
            return addExpr({type: "unknown", op: "", args: []}, varName);
        }

        return candidate;
    }

    function instructionToExpr(instr: Exclude<BrilInstruction, {label: string}>): ExpressionRepresentation {
        switch(instr.op) {
            case "id":
                return {
                    type: "id",
                    op: "id",
                    args: [lookupEnvOrAdd(instr.args![0])]
                };
            case "add":
            case "mul":
                return {
                    type: "commOp",
                    op: instr.op,
                    args: [lookupEnvOrAdd(instr.args![0]), lookupEnvOrAdd(instr.args![1])]
                };
            default:
                return {
                    type: "op",
                    op: instr.op,
                    args: instr.args?.map(lookupEnvOrAdd) ?? [],
                };
        }
    }

    renameOverwrittenVariables(block).forEach((instr) => {
        if ("label" in instr) {
            newBlock.push(instr);
            return;
        }

        if (!instr.args) {
            newBlock.push(instr);
            return;
        }

        const rhs = instructionToExpr(instr);

        const existingExpressionIndex = exprInTable.get(getExprRepString(rhs));
        if (existingExpressionIndex !== undefined) {
            // Previously computed expression
            if (instr.dest && !SIDE_EFFECT_OPS.has(instr.op)) {
                newBlock.push({
                    ...instr,
                    op: "id",
                    args: [lookupTable[existingExpressionIndex].varName],
                });
                env.set(instr.dest, existingExpressionIndex);
            } else {
                // Assuming that non-assignment can only have one rhs arg
                newBlock.push({
                    ...instr,
                    args: [lookupTable[existingExpressionIndex].varName],
                });
            }
        } else {
            // New expression
            if (!instr.dest || SIDE_EFFECT_OPS.has(instr.op)) {
                newBlock.push(instr);
            } else {
                addExpr(rhs, instr.dest);
                newBlock.push({
                    ...instr,
                    args: instr.args.map(varName => lookupTable[lookupEnvOrAdd(varName)].varName),
                });
            }
        }
    });
    return newBlock;
}

export function lvnLite(program: BrilProgram) {
    return {
        functions: program.functions.map((fn) => {
            return {
                ...fn,
                instrs: getBlocks(fn.instrs).blocks.map(lvnBlock).flat(),
            };
        })
    };
}

export function lvn(program: BrilProgram) {
    return deadCodeEliminationProgram(lvnLite(program));
}