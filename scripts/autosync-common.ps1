Set-StrictMode -Version Latest

function Get-EquatoriaRepository {
    $repository = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $gitDirectory = (& git -C $repository rev-parse --absolute-git-dir 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $gitDirectory) {
        throw "Equatoria Idle repository was not found at $repository."
    }

    $gitDirectory = $gitDirectory.Trim()
    $topLevel = (& git -C $repository rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or (Split-Path $topLevel.Trim() -Leaf) -ne 'Equatoria_Idle') {
        throw "Refusing to operate outside the Equatoria_Idle repository."
    }

    $origin = (& git -C $repository remote get-url origin 2>$null)
    if ($LASTEXITCODE -ne 0 -or $origin -notmatch '(?i)(^|[/\\:])Equatoria_Idle(?:\.git)?$') {
        throw "Refusing to operate because origin is not the Equatoria_Idle repository."
    }

    [pscustomobject]@{
        Root = $repository
        GitDirectory = $gitDirectory
        PauseMarker = Join-Path $gitDirectory 'AUTOSYNC_PAUSED'
        RunningLock = Join-Path $gitDirectory 'AUTOSYNC_RUNNING'
        AgentMarker = Join-Path $gitDirectory 'AGENT_WORK_ACTIVE'
    }
}

function Get-GitOperationState {
    param([Parameter(Mandatory)] [string] $GitDirectory)
    [pscustomobject]@{
        Merge = Test-Path -LiteralPath (Join-Path $GitDirectory 'MERGE_HEAD')
        Rebase = (Test-Path -LiteralPath (Join-Path $GitDirectory 'rebase-merge')) -or
            (Test-Path -LiteralPath (Join-Path $GitDirectory 'rebase-apply'))
        CherryPick = Test-Path -LiteralPath (Join-Path $GitDirectory 'CHERRY_PICK_HEAD')
        Revert = Test-Path -LiteralPath (Join-Path $GitDirectory 'REVERT_HEAD')
    }
}

function Read-KeyValueMarker {
    param([Parameter(Mandatory)] [string] $Path)
    $metadata = [ordered]@{}
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in (Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue)) {
            if ($line -match '^([^=]+)=(.*)$') {
                $metadata[$Matches[1]] = $Matches[2]
            }
        }
    }
    $metadata
}

function Get-AutosyncLockState {
    param([Parameter(Mandatory)] [string] $Path)
    $metadata = Read-KeyValueMarker -Path $Path
    $active = $false
    $confirmedStale = $false
    if ($metadata.Count -gt 0 -and $metadata['pid'] -match '^\d+$') {
        if ($metadata['hostname'] -eq [Environment]::MachineName) {
            $process = Get-Process -Id ([int]$metadata['pid']) -ErrorAction SilentlyContinue
            $active = $null -ne $process
            $confirmedStale = -not $active
        }
    }
    [pscustomobject]@{
        Exists = Test-Path -LiteralPath $Path
        Active = $active
        ConfirmedStale = $confirmedStale
        Metadata = $metadata
    }
}

function Assert-MainBranch {
    param([Parameter(Mandatory)] [string] $Repository)
    $branch = (& git -C $Repository branch --show-current 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') {
        throw "Refusing to operate: current branch is '$branch', not 'main'."
    }
    $branch
}

function Test-AutosyncPaused {
    param([Parameter(Mandatory)] $RepositoryInfo)
    if (Test-Path -LiteralPath $RepositoryInfo.PauseMarker) {
        Write-Host 'Equatoria Idle auto-sync is paused'
        return $true
    }
    return $false
}
