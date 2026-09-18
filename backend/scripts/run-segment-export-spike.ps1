param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $true)]
    [ValidateRange(0, [double]::MaxValue)]
    [double]$StartSeconds,

    [Parameter(Mandatory = $true)]
    [ValidateRange(0.001, 30)]
    [double]$DurationSeconds,

    [string]$OutputDirectory = (Join-Path $env:TEMP "DanceVault-segment-export-spike")
)

$ErrorActionPreference = "Stop"
$ffmpegImage = "jrottenberg/ffmpeg:7.1-ubuntu"
$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$inputDirectory = Split-Path -Parent $resolvedInput
$inputFileName = Split-Path -Leaf $resolvedInput
$resolvedOutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$outputFileName = "segment-export-$([DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))-$([guid]::NewGuid().ToString('N').Substring(0, 8)).mp4"
$outputPath = Join-Path $resolvedOutputDirectory $outputFileName
$probePath = "$outputPath.probe.json"

New-Item -ItemType Directory -Force -Path $resolvedOutputDirectory | Out-Null

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"

docker run --rm `
    --volume "${inputDirectory}:/input:ro" `
    --volume "${resolvedOutputDirectory}:/output" `
    $ffmpegImage `
    -hide_banner -loglevel warning -y `
    -ss $StartSeconds `
    -i "/input/$inputFileName" `
    -t $DurationSeconds `
    -map "0:v:0" -map "0:a:0?" `
    -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p `
    -vf "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2" `
    -c:a aac -b:a 128k `
    -map_metadata -1 `
    -movflags +faststart `
    "/output/$outputFileName"

$ffmpegExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference

if ($ffmpegExitCode -ne 0) {
    throw "FFmpeg export failed with exit code $ffmpegExitCode."
}

$stopwatch.Stop()

$ErrorActionPreference = "Continue"
$probeJson = docker run --rm `
    --entrypoint ffprobe `
    --volume "${resolvedOutputDirectory}:/output:ro" `
    $ffmpegImage `
    -v error -show_format -show_streams -of json "/output/$outputFileName"

$ffprobeExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference

if ($ffprobeExitCode -ne 0) {
    throw "FFprobe validation failed with exit code $ffprobeExitCode."
}

$probeJson | Set-Content -LiteralPath $probePath -Encoding utf8
$outputFile = Get-Item -LiteralPath $outputPath
$probe = $probeJson | ConvertFrom-Json
$videoStream = $probe.streams | Where-Object codec_type -eq "video" | Select-Object -First 1
$audioStream = $probe.streams | Where-Object codec_type -eq "audio" | Select-Object -First 1

[pscustomobject]@{
    OutputPath = $outputPath
    ProbePath = $probePath
    ProcessingSeconds = [math]::Round($stopwatch.Elapsed.TotalSeconds, 3)
    OutputBytes = $outputFile.Length
    DurationSeconds = [double]$probe.format.duration
    VideoCodec = $videoStream.codec_name
    Width = $videoStream.width
    Height = $videoStream.height
    AudioCodec = $audioStream.codec_name
}
