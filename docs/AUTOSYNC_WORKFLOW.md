# Auto-sync and main-only AI workflow

Equatoria Idle is included in the Windows Scheduled Task `\SyncGithubRepos`. The task runs
`wscript.exe "C:\Users\srime\Documents\GitHub\sync-repos-hidden.vbs"` daily, repeating every
10 minutes for one day. The wrapper calls `C:\Users\srime\Documents\GitHub\sync-repos.ps1`,
which delegates this repository to `scripts/autosync.ps1`. The Scheduled Task has no working
directory and runs as user `srime` with interactive-token logon and least privilege.

## Markers

All markers live under `.git` and cannot be committed:

- `AUTOSYNC_PAUSED`: auto-sync exits successfully before touching Git.
- `AUTOSYNC_RUNNING`: single-instance lock with PID, start time, host, and script.
- `AGENT_WORK_ACTIVE`: identifies the active coding task. Do not remove another task's marker.

Only remove a running lock when its recorded host is this computer and its recorded PID is
confirmed absent. A lock from another host, with missing metadata, or with an active PID is
not proven stale and must be left for manual review.

## Commands

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\pause-autosync.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\autosync-status.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\resume-autosync.ps1
```

Pause before investigation that may lead to edits. The pause helper is idempotent and also
creates the agent-work marker when none exists. Status reports Git operation state, change
counts, lock metadata, scheduler state when queryable, the last auto-sync commit, and local
main divergence without fetching.

Resume refuses outside `main`, during merge/rebase/cherry-pick/revert, or while a running
lock is active or cannot be proven stale. A dirty tree produces a warning rather than a
block because deliberate non-agent local edits may legitimately await the scheduled sync;
review them carefully before resuming. Resume never performs Git synchronization itself.

## Main-only coding sequence

Only one coding agent may modify this repository at a time. Inspect `AGENT_WORK_ACTIVE`;
if it belongs to another active task, stop and report it. Work directly on `main`. Do not
create or push branches or open pull requests unless the user explicitly requests one.

1. Pause auto-sync and keep it paused through investigation, edits, tests, commits, pulls,
   conflict resolution, and pushes.
2. When the tree permits, update with `git pull --ff-only origin main`.
3. Make and validate one coherent change; increment the build only when repository policy
   requires it.
4. Commit directly to `main`, safely synchronize, and push without force.
5. Verify the exact commit exists on `origin/main`.
6. Only after verification, resume auto-sync. Resume removes this task's agent marker.

If work is interrupted, validation fails, Git conflicts, or push/verification fails, leave
both pause and agent markers in place and keep unfinished work uncommitted. Never rely on
auto-sync to commit agent work.

The scheduled entrypoint validates the repository and `main`, checks pause state before
staging, committing, pulling, and pushing, uses a conservative single-instance lock, refuses
pre-existing staged changes and active Git operations, pulls fast-forward-only, never
force-pushes, and stops on any failure without resolving conflicts.

## Existing branches

Old AI branches are preserved for manual review; the main-only policy applies to new work.
The latest refreshed audit is recorded in
[`LEGACY_AI_BRANCH_REVIEW.md`](LEGACY_AI_BRANCH_REVIEW.md).
Inspect without deleting by fetching/pruning and comparing:

```powershell
git fetch --all --prune
git log --oneline main..origin/codex/example
git diff --stat main...origin/codex/example
```

Do not merge, delete, close, or rewrite an old branch or pull request without explicit review.
