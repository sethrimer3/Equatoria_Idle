param(
    [string] $Task = 'AI coding work',
    [string] $Agent = 'Codex'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'autosync-common.ps1')

try {
    $repo = Get-EquatoriaRepository
    if (-not (Test-Path -LiteralPath $repo.PauseMarker)) {
        New-Item -ItemType File -Path $repo.PauseMarker -ErrorAction Stop | Out-Null
    }
    if (-not (Test-Path -LiteralPath $repo.AgentMarker)) {
        @(
            "task=$Task"
            "agent=$Agent"
            "started=$(Get-Date -Format o)"
            "pid=$PID"
            "hostname=$([Environment]::MachineName)"
        ) | Set-Content -LiteralPath $repo.AgentMarker -Encoding utf8
    }

    Write-Host 'Equatoria Idle auto-sync is paused'
    $lock = Get-AutosyncLockState -Path $repo.RunningLock
    if ($lock.Exists) {
        Write-Host "Running lock: $($repo.RunningLock)"
        foreach ($entry in $lock.Metadata.GetEnumerator()) {
            Write-Host "  $($entry.Key): $($entry.Value)"
        }
        Write-Host "Process appears active: $($lock.Active)"
    } else {
        Write-Host 'No auto-sync process appears to be running.'
    }
    exit 0
} catch {
    Write-Error $_
    exit 1
}
