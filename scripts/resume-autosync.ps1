$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'autosync-common.ps1')

try {
    $repo = Get-EquatoriaRepository
    Assert-MainBranch -Repository $repo.Root | Out-Null
    $operation = Get-GitOperationState -GitDirectory $repo.GitDirectory
    if ($operation.Merge -or $operation.Rebase -or $operation.CherryPick -or $operation.Revert) {
        throw 'Refusing to resume while a merge, rebase, cherry-pick, or revert is active.'
    }

    $lock = Get-AutosyncLockState -Path $repo.RunningLock
    if ($lock.Exists -and $lock.Active) {
        throw 'Refusing to resume while an auto-sync process is active.'
    }
    if ($lock.Exists -and -not $lock.ConfirmedStale) {
        throw 'Refusing to resume because the running lock cannot be proven stale.'
    }

    $dirty = & git -C $repo.Root status --porcelain
    if ($dirty) {
        Write-Warning 'The working tree is dirty. Resume is allowed, but the next auto-sync run may commit these changes.'
    }
    Remove-Item -LiteralPath $repo.PauseMarker -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $repo.AgentMarker -Force -ErrorAction SilentlyContinue
    Write-Host 'Equatoria Idle auto-sync is active; normal auto-sync will resume on its next scheduled run.'
    exit 0
} catch {
    Write-Error $_
    exit 1
}
