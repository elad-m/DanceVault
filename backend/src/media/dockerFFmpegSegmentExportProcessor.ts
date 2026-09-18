import { spawn } from "node:child_process";
import { dirname, basename } from "node:path";
import type {
    ProcessSegmentExportInput,
    SegmentExportProcessor,
} from "./segmentExportProcessor";
import { createFFmpegSegmentExportArguments } from "./ffmpegSegmentExportArguments";

const ffmpegImage = "jrottenberg/ffmpeg:7.1-ubuntu";
const maximumDiagnosticLength = 8_000;

function toDockerPath(filePath: string): string {
    return filePath.replaceAll("\\", "/");
}

async function runDockerFFmpeg(
    input: ProcessSegmentExportInput
): Promise<void> {
    const workingDirectory = dirname(input.sourcePath);
    const argumentsList = [
        "run",
        "--rm",
        "--volume",
        `${workingDirectory}:/work`,
        ffmpegImage,
        ...createFFmpegSegmentExportArguments({
            ...input,
            sourcePath: `/work/${toDockerPath(basename(input.sourcePath))}`,
            outputPath: `/work/${toDockerPath(basename(input.outputPath))}`,
        }),
    ];

    await new Promise<void>((resolve, reject) => {
        const process = spawn("docker", argumentsList, {
            cwd: workingDirectory,
            windowsHide: true,
        });
        let diagnostics = "";

        process.stderr.on("data", (chunk: Buffer) => {
            diagnostics = (diagnostics + chunk.toString()).slice(
                -maximumDiagnosticLength
            );
        });
        process.on("error", reject);
        process.on("close", (exitCode) => {
            if (exitCode === 0) {
                resolve();
                return;
            }

            reject(
                new Error(
                    diagnostics.trim() ||
                        `FFmpeg exited with code ${String(exitCode)}`
                )
            );
        });
    });
}

export function createDockerFFmpegSegmentExportProcessor(): SegmentExportProcessor {
    return {
        process: runDockerFFmpeg,
    };
}
