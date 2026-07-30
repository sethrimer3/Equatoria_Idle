param(
    [switch] $SkipNetwork,
    [switch] $SimulatePullFailure,
    [int] $HoldLockSeconds = 0
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'autosync-common.ps1')

function Invoke-GitChecked {
    param([Parameter(Mandatory)] [string[]] $Arguments)
    & git -C $repo.Root @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

$repo = $null
$lockOwned = $false
$stagedByThisRun = $false
try {
    $repo = Get-EquatoriaRepository
    if (Test-AutosyncPaused -RepositoryInfo $repo) { exit 0 }
    Assert-MainBranch -Repository $repo.Root | Out-Null

    $existingLock = Get-AutosyncLockState -Path $repo.RunningLock
    if ($existingLock.Exists) {
        if (-not $existingLock.ConfirmedStale) {
            Write-Host 'Another Equatoria Idle auto-sync instance may be running; exiting safely.'
            exit 0
        }
        Remove-Item -LiteralPath $repo.RunningLock -Force
    }
    try {
        New-Item -ItemType File -Path $repo.RunningLock -ErrorAction Stop | Out-Null
        $lockOwned = $true
        @(
            "pid=$PID"
            "started=$(Get-Date -Format o)"
            "hostname=$([Environment]::MachineName)"
            "script=$PSCommandPath"
        ) | Set-Content -LiteralPath $repo.RunningLock -Encoding utf8
    } catch [System.IO.IOException] {
        Write-Host 'Another Equatoria Idle auto-sync instance acquired the lock; exiting safely.'
        exit 0
    }

    if (Test-AutosyncPaused -RepositoryInfo $repo) { exit 0 }
    Assert-MainBranch -Repository $repo.Root | Out-Null
    if ($HoldLockSeconds -gt 0) {
        Start-Sleep -Seconds $HoldLockSeconds
    }

    $operation = Get-GitOperationState -GitDirectory $repo.GitDirectory
    if ($operation.Merge -or $operation.Rebase -or $operation.CherryPick -or $operation.Revert) {
        throw 'Refusing to sync while a Git operation is active.'
    }
    $preexistingStaged = @(& git -C $repo.Root diff --cached --name-only)
    if ($preexistingStaged.Count -gt 0) {
        throw 'Refusing to auto-sync because staged changes already exist.'
    }

    $changes = @(& git -C $repo.Root status --porcelain)
    if ($changes.Count -gt 0) {
        if (Test-AutosyncPaused -RepositoryInfo $repo) { exit 0 }
        Invoke-GitChecked -Arguments @('add', '-A')
        $stagedByThisRun = $true
        if (Test-AutosyncPaused -RepositoryInfo $repo) {
            & git -C $repo.Root restore --staged -- .
            $stagedByThisRun = $false
            exit 0
        }
        Invoke-GitChecked -Arguments @('commit', '-m', "Auto-sync: local changes $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
        $stagedByThisRun = $false
    }

    if ($SkipNetwork) {
        Write-Host 'Network synchronization skipped for controlled validation.'
        exit 0
    }
    if (Test-AutosyncPaused -RepositoryInfo $repo) { exit 0 }
    if ($SimulatePullFailure) {
        throw 'Simulated pull failure for controlled validation.'
    }
    Invoke-GitChecked -Arguments @('pull', '--ff-only', 'origin', 'main')
    if (Test-AutosyncPaused -RepositoryInfo $repo) { exit 0 }
    Invoke-GitChecked -Arguments @('push', 'origin', 'main')
    Write-Host 'Equatoria Idle auto-sync completed successfully.'
    exit 0
} catch {
    if ($stagedByThisRun -and $repo) {
        & git -C $repo.Root restore --staged -- .
    }
    Write-Error $_
    exit 1
} finally {
    if ($lockOwned -and $repo -and (Test-Path -LiteralPath $repo.RunningLock)) {
        Remove-Item -LiteralPath $repo.RunningLock -Force
    }
}
