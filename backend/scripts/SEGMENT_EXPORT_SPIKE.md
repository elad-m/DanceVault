# Segment Export FFmpeg Spike

This disposable spike verifies that representative DanceVault videos can be
trimmed and re-encoded into a broadly compatible MP4 before export persistence,
queues, workers, APIs, or UI are implemented.

It reads one local file and writes only to
`%TEMP%\DanceVault-segment-export-spike`. It does not connect to DynamoDB,
MinIO, S3, or any AWS service.

## Run

Docker Desktop must be running. Double-click
`open-segment-export-spike.cmd`, or run:

```powershell
.\backend\scripts\open-segment-export-spike.ps1
```

Choose a video, enter the start time and duration, and select **Export
segment**. When processing finishes, **Show output file** opens Explorer with
the generated MP4 selected.

The command-line version remains available from the repository root:

```powershell
.\backend\scripts\run-segment-export-spike.ps1 `
    -InputPath "C:\path\to\video.mov" `
    -StartSeconds 5.25 `
    -DurationSeconds 10
```

The duration is restricted to the proposed production maximum of 30 seconds.
The script prints the output and probe-report paths, processing time, output
size, codecs, and dimensions.

## Acceptance Checks

Repeat the spike with a normal MP4, both accepted iPhone MOV variants, and at
least one portrait video. For each output:

1. Confirm playback and audio on Windows, iPad, and Galaxy S24.
2. Confirm the visible clip begins and ends at the requested moments.
3. Confirm portrait and landscape orientation is correct.
4. Record processing time and output size, especially for a 30-second clip.

The spike succeeds if all representative files produce correctly oriented
H.264/AAC MP4 files within a processing time that leaves substantial headroom
under Lambda's 15-minute execution limit.
