
export async function pipeStringIntoCmdAndGetOutput(
    cmd: string,
    input: string,
    args?: string[],
) {
    async function streamToString(stream: ReadableStream<Uint8Array>) {
        const reader = stream.getReader();
        let result = "";
        const decoder = new TextDecoder();
      
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += decoder.decode(value);
        }
      
        return result;
    }

    const command = new Deno.Command(cmd, {
        args,
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
    });
    const textEncoder = new TextEncoder();
    const child = command.spawn();
    const writer = child.stdin.getWriter();
    await writer.write(textEncoder.encode(input));
    writer.releaseLock();
    child.stdin.close();

    const outputText = await streamToString(child.stdout);
    const errText = await streamToString(child.stderr);

    return {stdout: outputText, stderr: errText};

}
