import { BrilProgram, getBlocks, Type } from "../bril_shared/cfg.ts";
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

type ExpressionRepresentation = {
    t: "id",
    op: "id",
    args: [number],
    type?: Type,
} | {
    t: "commOp",
    op: string,
    args: [number, number],
    type?: Type,
} | {
    t: "op",
    op: string,
    args: number[],
    type?: Type,
} | {
    t: "unknown",
    op: "",
    args: [],
    type?: Type,
} | {
    t: "const",
    op: "const",
    args: [],
    value: number | boolean,
    type?: Type,
};

function getCanonicalExprRep(exprRep: ExpressionRepresentation): ExpressionRepresentation {
    switch (exprRep.t) {
        case "id":
            return exprRep;
        case "commOp":
            return {
                ...exprRep,
                args: exprRep.args.slice().sort((a, b) => a - b) as [number, number],
            };
        case "op":
        case "unknown":
        case "const":
            return exprRep;
    }
}

type ExprRepString = `${string}:${string}:${string}:${string}`

function getExprRepString(exprRep: ExpressionRepresentation): ExprRepString {
    const r = getCanonicalExprRep(exprRep);
    return `${r.t}:${r.op}:${r.type}:${r.args.reduce((a, x) => `${a}:${x}`, '')}${r.t === "const" ? r.value : ''}`;
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

    function getExpr(expr: ExpressionRepresentation) {
        // Constant Propagation Check
        if (
            expr.t === "id" &&
            lookupTable[expr.args[0]].expression.t !== "unknown" &&
            lookupTable[expr.args[0]].expression.type === expr.type
        ) {
            return expr.args[0];
        }
        if (expr.t === "unknown") {
            return undefined;
        }
        return exprInTable.get(getExprRepString(expr));
    }

    function lookupEnvOrAdd(varName: string, type?: Type) {
        const candidate = env.get(varName);

        if (candidate === undefined) {
            return addExpr({t: "unknown", op: "", args: [], type}, varName);
        }

        return candidate;
    }

    function instructionToExpr(instr: Exclude<BrilInstruction, {label: string}>): ExpressionRepresentation {
        switch(instr.op) {
            case "id":
                return {
                    t: "id",
                    op: "id",
                    args: [lookupEnvOrAdd(instr.args![0], instr.type)],
                    type: instr.type,
                };
            case "add":
            case "mul":
                return {
                    t: "commOp",
                    op: instr.op,
                    args: [lookupEnvOrAdd(instr.args![0], instr.type), lookupEnvOrAdd(instr.args![1], instr.type)],
                    type: instr.type,
                };
            case "const":
                return {
                    t: "const",
                    op: "const",
                    args: [],
                    value: instr.value!,
                    type: instr.type,
                }
            default:
                return {
                    t: "op",
                    op: instr.op,
                    args: instr.args?.map(x => lookupEnvOrAdd(x, instr.type)) ?? [],
                    type: instr.type,
                };
        }
    }

    renameOverwrittenVariables(block).forEach((instr) => {
        if ("label" in instr) {
            newBlock.push(instr);
            return;
        }

        if (!instr.args && instr.op !== "const") {
            newBlock.push(instr);
            return;
        }

        const rhs = instructionToExpr(instr);

        switch (rhs.op) {
            case "add": {
                const arg1 = lookupTable[rhs.args[0]];
                const arg2 = lookupTable[rhs.args[1]];
                if (arg1.expression.t === "const" && arg2.expression.t === "const") {
                    const value = (arg1.expression.value as number) + (arg2.expression.value as number);
                    newBlock.push({
                        op: "const",
                        type: instr.type,
                        dest: instr.dest,
                        value,
                    });
                    if (instr.dest) {
                        addExpr({ t: "const", value, args: [], op: "const" }, instr.dest);
                    }
                    return;
                }
                break;
            }
            default: break;
        }

        const existingExpressionIndex = getExpr(rhs);
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
                newBlock.push({
                    ...instr,
                    args: instr.args?.map(varName => lookupTable[lookupEnvOrAdd(varName)].varName),
                });
            } else {
                addExpr(rhs, instr.dest);
                newBlock.push({
                    ...instr,
                    args: instr.args?.map(varName => lookupTable[lookupEnvOrAdd(varName)].varName),
                });
            }
        }
    });
    // console.log(lookupTable);
    // console.log(env);
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
    // const r = deadCodeEliminationProgram(lvnLite(program));
    // console.log(JSON.stringify(r));
    // console.log(r);
    // return r;
    return deadCodeEliminationProgram(lvnLite(program));
}
