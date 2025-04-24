import { BrilFunction, BrilInstruction } from "../bril_shared/cfg.ts";

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

function generateNewLabel(baseName: string) {
    return `${baseName}:${`${Math.random()}`.substring(2)}`;
}

function assertIsTraceInfo(_x: unknown): _x is TraceInfo {
    return true;
}

export function traceMainFn(fn: BrilFunction, trace: (Exclude<BrilInstruction, { label: string }> | TraceInfo)[]) {
    const newArr: BrilInstruction[] = [{op: "speculate"}];
    const abortLabelName = generateNewLabel("abort");
    let originalFn = fn.instrs;
    let committed = false;

    trace.forEach((traceInstr) => {
        switch(traceInstr.op) {
            case "trace-msg":
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
                break;
            default:
                newArr.push(traceInstr);
                break;
        }
    });
    
    const extra = committed ? [{label: abortLabelName}] : [{op: "commit"}, {label: abortLabelName}];
    return newArr.concat(extra).concat(originalFn);
}