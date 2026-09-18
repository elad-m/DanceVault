import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { createFFmpegSegmentExportArguments } from "./ffmpegSegmentExportArguments";
import type {
    ProcessSegmentExportInput,
    SegmentExportProcessor,
} from "./segmentExportProcessor";

const maximumDiagnosticLength = 8_000;

async function processWithStaticFFmpeg(
    input: ProcessSegmentExportInput
): Promise<void> {
    if (!ffmpegPath) throw new Error("Static FFmpeg binary is unavailable");
    const executablePath = ffmpegPath;

    await new Promise<void>((resolve, reject) => {
        const process = spawn(
            executablePath,
            createFFmpegSegmentExportArguments(input),
            { windowsHide: true }
        );
        let diagnostics = "";

        process.stderr.on("data", (chunk: Buffer) => {
            diagnostics = (diagnostics + chunk.toString()).slice(
                -maximumDiagnosticLength
            );
        });
        process.on("error", reject);
        process.on("close", (exitCode) => {
            if (exitCode === 0) resolve();
            else {
                reject(
                    new Error(
                        diagnostics.trim() ||
                            `FFmpeg exited with code ${String(exitCode)}`
                    )
                );
            }
        });
    });
}

export function createStaticFFmpegSegmentExportProcessor(): SegmentExportProcessor {
    return { process: processWithStaticFFmpeg };
}
