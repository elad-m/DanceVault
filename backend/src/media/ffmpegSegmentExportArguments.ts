import type { ProcessSegmentExportInput } from "./segmentExportProcessor";

export function createFFmpegSegmentExportArguments(
    input: ProcessSegmentExportInput
): string[] {
    const durationMilliseconds =
        input.endMilliseconds - input.startMilliseconds;

    return [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-y",
        "-ss",
        (input.startMilliseconds / 1_000).toString(),
        "-i",
        input.sourcePath,
        "-t",
        (durationMilliseconds / 1_000).toString(),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-map_metadata",
        "-1",
        "-movflags",
        "+faststart",
        input.outputPath,
    ];
}
