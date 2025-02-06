import { assertEquals, assertLess, assertLessOrEqual, assertNotEquals } from "jsr:@std/assert";
import { walk, WalkEntry } from "jsr:@std/fs/walk";
import { BrilProgram } from "../bril_shared/cfg.ts";
import { pipeStringIntoCmdAndGetOutput } from "../bril_shared/io.ts";

/**
 * Runs a bril program twice, once with and once without an optimization, and
 * compares outputs.
 * 
 * Passes test if outputs are identical, and the optimization did not introduce
 * more dynamic instructions than the original.
 * 
 * @param optimization Some optimization that transforms a bril program
 * @param filePath File path to a .bril program file
 * @param strictReduction Whether to fail the test if the number of dynamic
 * instructions in the optimized version is equal to the original, instead
 * of being strictly less than.
 */
export async function testFileForCorrectnessAndReduction(
    optimization: (program: BrilProgram) => BrilProgram,
    filePath: string,
    strictReduction?: boolean
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
    const newProgramText = JSON.stringify(newProgram);

    const newInterpOutput = await pipeStringIntoCmdAndGetOutput("brili", newProgramText, programArgs);

    const newOutput = newInterpOutput.stdout;
    const newInstrs = extractDynInstrs(newInterpOutput.stderr);

    assertEquals(newOutput, ogOutput);
    if (ogInstrs !== -1) {
        assertNotEquals(newInstrs, -1, newInterpOutput.stderr);
    } else {
        assertEquals(newInstrs, -1);
    }
    if (strictReduction) {
        assertLess(newInstrs, ogInstrs);
    } else {
        assertLessOrEqual(newInstrs, ogInstrs);
    }
}

export async function runOnAllInFolder(t: Deno.TestContext, folder: string, prefix: string, optimization: (program: BrilProgram) => BrilProgram, strictReduction: boolean) {
    const files: WalkEntry[] = [];
    for await (const file of walk(folder)) {
        if (file.isFile) {
            files.push(file);
        }
    }
    await Promise.all(files.map(file => {
        return t.step(`${prefix}${strictReduction ? " strict:" : ":"} ${file.name}`, async () => {
            await testFileForCorrectnessAndReduction(optimization, file.path, strictReduction);
        });
    }));
}

export function brilTest(name: string, config: {
    folder: string,
    strict: boolean,
    optimization: (program: BrilProgram) => BrilProgram,
    prefix?: string,
}[]) {
    Deno.test({
        name,
        async fn(t) {
            await Promise.all(config.map(c => runOnAllInFolder(t, c.folder, c.prefix ?? name, c.optimization, c.strict)));
        },
        sanitizeExit: false,
        sanitizeOps: false,
        sanitizeResources: false,
    });
}
