import { assertEquals, assertLess, assertLessOrEqual, assertNotEquals } from "jsr:@std/assert";
import { walk, WalkEntry } from "jsr:@std/fs/walk";
import { BrilProgram } from "../bril_shared/cfg.ts";
import { jsonStringify, pipeStringIntoCmdAndGetOutput } from "../bril_shared/io.ts";

type OptimizationTestStrategy = "strict reduce" | "loose";

/**
 * Runs a bril program twice, once with and once without an optimization, and
 * compares outputs.
 * 
 * Passes test if outputs are identical, and the optimization did not introduce
 * more dynamic instructions than the original.
 * 
 * @param optimization Some optimization that transforms a bril program
 * @param filePath File path to a .bril program file
 * @param strictReduction By default, tests fail if the optimization causes
 * more instructions to be run. Switching to "strict reduce" will fail tests
 * even if the same number of instructions are run, and "loose" will ignore
 * the check outright.
 */
export async function testFileForCorrectnessAndReduction(
    optimization: (program: BrilProgram) => BrilProgram,
    filePath: string,
    strategy?: OptimizationTestStrategy
) {
    const extractDynInstrs = (txt: string) => parseInt(/^total_dyn_inst: ([0-9]+)\n$/.exec(txt)?.[1] ?? "-1", 10);

    const brilText = await Deno.readTextFile(filePath);
    const programText = await pipeStringIntoCmdAndGetOutput("bril2json", brilText);

    const argsParse = /^# ?ARGS: (.+)$/gm.exec(brilText);
    const programArgs = ['-p'].concat(argsParse ? (argsParse[1].trim()).split(" ") : []);

    const ogInterpOutput = await pipeStringIntoCmdAndGetOutput("brili", programText.stdout, programArgs);

    const program = JSON.parse(programText.stdout) as BrilProgram;

    const ogOutput = ogInterpOutput.stdout;
    const ogInstrs = extractDynInstrs(ogInterpOutput.stderr);

    const newProgram = optimization(program);
    const newProgramText = jsonStringify(newProgram);

    const newInterpOutput = await pipeStringIntoCmdAndGetOutput("brili", newProgramText, programArgs);

    const newOutput = newInterpOutput.stdout;
    const newInstrs = extractDynInstrs(newInterpOutput.stderr);

    assertEquals(newOutput, ogOutput);
    if (ogInstrs !== -1) {
        assertNotEquals(newInstrs, -1, newInterpOutput.stderr);
    } else {
        assertEquals(newInstrs, -1);
    }
    if (strategy === "strict reduce") {
        assertLess(newInstrs, ogInstrs);
    } else if (strategy === undefined) {
        assertLessOrEqual(newInstrs, ogInstrs);
    }

    return ogInstrs - newInstrs;
}

export async function runOnAllInFolder(t: Deno.TestContext, folder: string, prefix: string, optimization: (program: BrilProgram) => BrilProgram, strategy?: OptimizationTestStrategy) {
    const files: WalkEntry[] = [];
    for await (const file of walk(folder)) {
        if (file.isFile) {
            files.push(file);
        }
    }
    const res: number[] = [];
    await Promise.all(files.map(file => {
        return t.step(`${prefix}${strategy === "strict reduce" ? " strict:" : ":"} ${file.name}`, async () => {
            const r = await testFileForCorrectnessAndReduction(optimization, file.path, strategy);
            res.push(r);
        });
    }));
    return res;
}

export function brilTest(name: string, config: {
    folder: string,
    strategy?: OptimizationTestStrategy,
    optimization: (program: BrilProgram) => BrilProgram,
    prefix?: string,
}[]) {
    Deno.test({
        name,
        async fn(t) {
            const resultRaw = await Promise.all(config.map(c => runOnAllInFolder(t, c.folder, c.prefix ?? name, c.optimization, c.strategy)));
            const result = resultRaw.flat();
            const avgReduction = result.reduce((a, x) => a + x, 0) / result.length;
            result.sort((a, b) => a - b);
            console.log("=========================================");
            console.log(`Optimization Report for ${name}:`);
            console.log(`Average Reduction: ${avgReduction}`);
            console.log(`Minimum Reduction: ${result[0]}`);
            console.log(`1st Quartile Reduction: ${result[Math.floor(result.length / 4)]}`);
            console.log(`Median Reduction: ${result[Math.floor(result.length / 2)]}`);
            console.log(`3rd Quartile Reduction: ${result[Math.floor(result.length * 3 / 4)]}`);
            console.log(`Maximum Reduction: ${result[result.length - 1]}`);
            console.log("=========================================");
        },
        sanitizeExit: false,
        sanitizeOps: false,
        sanitizeResources: false,
    });
}
