$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'autosync-common.ps1')

try {
    $repo = Get-EquatoriaRepository
    $branch = (& git -C $repo.Root branch --show-current).Trim()
    $porcelain = @(& git -C $repo.Root status --porcelain)
    $staged = @(& git -C $repo.Root diff --cached --name-only)
    $unstaged = @(& git -C $repo.Root diff --name-only)
    $untracked = @(& git -C $repo.Root ls-files --others --exclude-standard)
    $operation = Get-GitOperationState -GitDirectory $repo.GitDirectory
    $lock = Get-AutosyncLockState -Path $repo.RunningLock
    $counts = (& git -C $repo.Root rev-list --left-right --count origin/main...main 2>$null)
    $lastSync = (& git -C $repo.Root log --all -1 --format='%h %ad %s' --date=iso --grep='Auto-sync' -i 2>$null)

    $scheduled = 'unknown'
    try {
        $task = Get-ScheduledTask -TaskName 'SyncGithubRepos' -ErrorAction Stop
        $scheduled = if ($task.Settings.Enabled) { 'enabled' } else { 'disabled' }
    } catch {}

    Write-Host "State: $(if (Test-Path -LiteralPath $repo.PauseMarker) { 'paused' } else { 'active' })"
    Write-Host "Repository: $($repo.Root)"
    Write-Host "Branch: $branch"
    Write-Host "Working tree: $(if ($porcelain.Count) { 'dirty' } else { 'clean' })"
    Write-Host "Staged changes: $($staged.Count)"
    Write-Host "Unstaged changes: $($unstaged.Count)"
    Write-Host "Untracked files: $($untracked.Count)"
    Write-Host "Merge active: $($operation.Merge)"
    Write-Host "Rebase active: $($operation.Rebase)"
    Write-Host "Cherry-pick active: $($operation.CherryPick)"
    Write-Host "Revert active: $($operation.Revert)"
    Write-Host "Running lock exists: $($lock.Exists)"
    Write-Host "Lock process active: $($lock.Active)"
    if ($lock.Exists) {
        foreach ($entry in $lock.Metadata.GetEnumerator()) {
            Write-Host "  $($entry.Key): $($entry.Value)"
        }
    }
    Write-Host "Scheduled task: $scheduled"
    Write-Host "Last auto-sync commit: $(if ($lastSync) { $lastSync } else { 'none found' })"
    if ($counts -match '^\s*(\d+)\s+(\d+)\s*$') {
        Write-Host "Local main: ahead $($Matches[2]), behind $($Matches[1]) relative to origin/main"
    } else {
        Write-Host 'Local main divergence: unavailable without changing repository state'
    }
    exit 0
} catch {
    Write-Error $_
    exit 1
}
