import { BrilFunction, BrilInstruction, BrilProgram } from "../bril_shared/cfg.ts";
import { jsonStringify, pipeStringIntoCmdAndGetOutput } from "../bril_shared/io.ts";

type TraceInfo = {
    op: "trace-info",
} & (
    {
        msg: "br-path",
        cond: boolean,
        arg: string,
        labels: [string, string]
    } | {
        msg: "abort",
        instrIndex: number,
    }
)

type Trace = (Exclude<BrilInstruction, { label: string }> | TraceInfo)[];

function generateNewLabel(baseName: string) {
    return `${baseName}:${`${Math.random()}`.substring(2)}`;
}

function assertIsTraceInfo(_x: unknown): _x is TraceInfo {
    return true;
}

export async function getTraceFromMain(program: BrilProgram): Promise<Trace> {
    const programOutput = await pipeStringIntoCmdAndGetOutput("deno", jsonStringify(program), ["brili.ts"].concat(Deno.args.slice(1)));
    const outputLines = programOutput.stderr.split("\n").filter(x => !!x);
    const trace = JSON.parse("[" + outputLines.join(",") + "]");
    return trace;
}

export function rewriteMainFn(fn: BrilFunction, trace: Trace) {
    const newArr: BrilInstruction[] = [{op: "speculate"}];
    const abortLabelName = generateNewLabel("abort");
    let originalFn = fn.instrs;
    let committed = false;

    trace.forEach((traceInstr) => {
        switch(traceInstr.op) {
            case "trace-info":
                if (!assertIsTraceInfo(traceInstr)) {
                    throw new Error();
                }
                if (traceInstr.msg === "abort") {
                    const currentIndex = traceInstr.instrIndex;
                    const resumeLabel = generateNewLabel("resume");
                    originalFn = fn.instrs.slice(0, currentIndex).concat([{
                        label: resumeLabel,
                    }]).concat(fn.instrs.slice(currentIndex));
                    committed = true;
                    newArr.push({op: "commit"});
                    newArr.push({op: "jmp", labels: [resumeLabel]});
                } else if (traceInstr.msg === "br-path") {
                    if (traceInstr.cond) {
                        newArr.push({
                            op: "guard",
                            args: [traceInstr.arg],
                            labels: [abortLabelName],
                        });
                    } else {
                        const newVar = generateNewLabel(`inverse:${traceInstr.arg}`);
                        newArr.push({
                            op: "not",
                            type: "bool",
                            args: [traceInstr.arg],
                            dest: newVar,
                        })
                        newArr.push({
                            op: "guard",
                            args: [newVar],
                            labels: [abortLabelName],
                        });
                    }
                }
                break;
            case "br":
            case "jmp":
                break;
            default:
                newArr.push(traceInstr);
                break;
        }
    });
    
    const extra = committed ? [{label: abortLabelName}] : [{op: "commit"}, {label: abortLabelName}];
    return newArr.concat(extra).concat(originalFn);
}