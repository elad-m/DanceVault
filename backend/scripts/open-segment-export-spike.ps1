Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$exportScriptPath = Join-Path $PSScriptRoot "run-segment-export-spike.ps1"
$script:exportJob = $null
$script:outputPath = $null

$form = New-Object System.Windows.Forms.Form
$form.Text = "DanceVault segment export spike"
$form.StartPosition = "CenterScreen"
$form.ClientSize = New-Object System.Drawing.Size(640, 330)
$form.MinimumSize = New-Object System.Drawing.Size(656, 369)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Export a video segment"
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 16)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(24, 20)
$form.Controls.Add($title)

$fileLabel = New-Object System.Windows.Forms.Label
$fileLabel.Text = "Source video"
$fileLabel.AutoSize = $true
$fileLabel.Location = New-Object System.Drawing.Point(24, 68)
$form.Controls.Add($fileLabel)

$filePath = New-Object System.Windows.Forms.TextBox
$filePath.Location = New-Object System.Drawing.Point(24, 92)
$filePath.Size = New-Object System.Drawing.Size(480, 28)
$filePath.ReadOnly = $true
$form.Controls.Add($filePath)

$browseButton = New-Object System.Windows.Forms.Button
$browseButton.Text = "Browse..."
$browseButton.Location = New-Object System.Drawing.Point(516, 90)
$browseButton.Size = New-Object System.Drawing.Size(96, 32)
$form.Controls.Add($browseButton)

$startLabel = New-Object System.Windows.Forms.Label
$startLabel.Text = "Start time (seconds)"
$startLabel.AutoSize = $true
$startLabel.Location = New-Object System.Drawing.Point(24, 140)
$form.Controls.Add($startLabel)

$startInput = New-Object System.Windows.Forms.NumericUpDown
$startInput.Location = New-Object System.Drawing.Point(24, 164)
$startInput.Size = New-Object System.Drawing.Size(180, 28)
$startInput.DecimalPlaces = 3
$startInput.Maximum = 86400
$startInput.Increment = 0.1
$form.Controls.Add($startInput)

$durationLabel = New-Object System.Windows.Forms.Label
$durationLabel.Text = "Duration (maximum 30 seconds)"
$durationLabel.AutoSize = $true
$durationLabel.Location = New-Object System.Drawing.Point(232, 140)
$form.Controls.Add($durationLabel)

$durationInput = New-Object System.Windows.Forms.NumericUpDown
$durationInput.Location = New-Object System.Drawing.Point(232, 164)
$durationInput.Size = New-Object System.Drawing.Size(180, 28)
$durationInput.DecimalPlaces = 3
$durationInput.Minimum = 0.001
$durationInput.Maximum = 30
$durationInput.Value = 10
$durationInput.Increment = 0.1
$form.Controls.Add($durationInput)

$exportButton = New-Object System.Windows.Forms.Button
$exportButton.Text = "Export segment"
$exportButton.Location = New-Object System.Drawing.Point(24, 218)
$exportButton.Size = New-Object System.Drawing.Size(150, 38)
$form.Controls.Add($exportButton)

$showButton = New-Object System.Windows.Forms.Button
$showButton.Text = "Show output file"
$showButton.Location = New-Object System.Drawing.Point(186, 218)
$showButton.Size = New-Object System.Drawing.Size(150, 38)
$showButton.Enabled = $false
$form.Controls.Add($showButton)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Location = New-Object System.Drawing.Point(352, 220)
$progress.Size = New-Object System.Drawing.Size(260, 32)
$progress.Style = "Marquee"
$progress.Visible = $false
$form.Controls.Add($progress)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "Choose an MP4 or MOV file to begin."
$statusLabel.AutoEllipsis = $true
$statusLabel.Location = New-Object System.Drawing.Point(24, 278)
$statusLabel.Size = New-Object System.Drawing.Size(588, 28)
$form.Controls.Add($statusLabel)

$fileDialog = New-Object System.Windows.Forms.OpenFileDialog
$fileDialog.Title = "Choose a source video"
$fileDialog.Filter = "Supported videos (*.mp4;*.mov)|*.mp4;*.mov|All files (*.*)|*.*"

$browseButton.Add_Click({
    if ($fileDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $filePath.Text = $fileDialog.FileName
        $statusLabel.Text = "Ready to export."
    }
})

$showButton.Add_Click({
    if ($script:outputPath -and (Test-Path -LiteralPath $script:outputPath)) {
        $explorer = New-Object System.Diagnostics.ProcessStartInfo
        $explorer.FileName = "explorer.exe"
        $explorer.Arguments = "/select,`"$script:outputPath`""
        $explorer.UseShellExecute = $true
        [System.Diagnostics.Process]::Start($explorer) | Out-Null
        return
    }

    [System.Windows.Forms.MessageBox]::Show(
        "The exported file no longer exists. Run the export again.",
        "Output file not found",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    ) | Out-Null
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 300
$timer.Add_Tick({
    if (-not $script:exportJob -or $script:exportJob.State -notin @("Completed", "Failed", "Stopped")) {
        return
    }

    $timer.Stop()
    $progress.Visible = $false
    $exportButton.Enabled = $true
    $browseButton.Enabled = $true

    $jobResults = @(Receive-Job -Job $script:exportJob -ErrorAction SilentlyContinue)
    $result = $jobResults |
        Where-Object { $_.PSObject.Properties.Name -contains "OutputPath" } |
        Select-Object -Last 1
    $jobOutput = $jobResults | Out-String
    $jobErrors = $script:exportJob.ChildJobs[0].JobStateInfo.Reason
    $jobErrorOutput = $script:exportJob.ChildJobs[0].Error | Out-String
    Remove-Job -Job $script:exportJob -Force
    $script:exportJob = $null

    if ($result -and (Test-Path -LiteralPath $result.OutputPath)) {
        $script:outputPath = $result.OutputPath
        $showButton.Enabled = $true
        $statusLabel.Text = "Export complete. Open Explorer to play the output."
        [System.Media.SystemSounds]::Asterisk.Play()
        return
    }

    $message = if ($jobErrors) {
        $jobErrors.Message
    } elseif ($jobErrorOutput.Trim()) {
        $jobErrorOutput.Trim()
    } elseif ($jobOutput.Trim()) {
        $jobOutput.Trim()
    } else {
        "The export failed without an error message."
    }
    $statusLabel.Text = "Export failed."
    [System.Windows.Forms.MessageBox]::Show(
        $message,
        "Segment export failed",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
})

$exportButton.Add_Click({
    if (-not $filePath.Text -or -not (Test-Path -LiteralPath $filePath.Text)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Choose an existing MP4 or MOV file first.",
            "Source video required",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
        return
    }

    $script:outputPath = $null
    $showButton.Enabled = $false
    $exportButton.Enabled = $false
    $browseButton.Enabled = $false
    $progress.Visible = $true
    $statusLabel.Text = "FFmpeg is creating the segment..."

    $script:exportJob = Start-Job -ScriptBlock {
        param($scriptPath, $inputPath, $startSeconds, $durationSeconds)
        & $scriptPath `
            -InputPath $inputPath `
            -StartSeconds $startSeconds `
            -DurationSeconds $durationSeconds
    } -ArgumentList @(
        $exportScriptPath,
        $filePath.Text,
        [double]$startInput.Value,
        [double]$durationInput.Value
    )

    $timer.Start()
})

$form.Add_FormClosing({
    if ($script:exportJob) {
        Stop-Job -Job $script:exportJob -ErrorAction SilentlyContinue
        Remove-Job -Job $script:exportJob -Force -ErrorAction SilentlyContinue
    }
})

[void]$form.ShowDialog()
