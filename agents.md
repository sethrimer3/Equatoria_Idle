# Equatoria Idle Agent Entry Point

This is the short, high-signal entry point for AI coding agents. The longer legacy guideline file is `agents.md`; keep it as the detailed policy reference.

## Required read order before editing

1. `AGENTS.md` — this file.
2. `docs/REPO_MAP.md` — compact folder map with HIGH VALUE / CAUTION / IGNORE labels.
3. `docs/AI_REPO_MAP.md` — extended orientation: per-subsystem risks and routing table.
4. `docs/CURRENT_STATUS.md` — current build, recent work, known incomplete areas.
5. `docs/TODO.md` — condensed task list and deferred work.
6. `docs/AI_TASK_ROUTING.md` — task-type routing: first files, keywords, pitfalls, verify commands.
7. `file_index.md` — detailed per-file reference when a subsystem needs deeper inspection.
8. `docs/FILE_GUIDE.md` — per-file responsibilities grouped by system with risk labels.
9. `docs/CONVENTIONS.md` — naming, folder, state, rendering, and testing conventions.
10. `docs/DEPENDENCY_MAP.md` — module dependency hierarchy and shared-module risk table.
11. `ARCHITECTURE.md` and `DECISIONS.md` — read when changing runtime flow, coordinate systems, save data, rendering architecture, or long-lived technical decisions.
12. `agents.md` — full standing rules for architecture, TypeScript discipline, naming, performance, docs, and build workflow.

### Short-circuit by task type
- **UI/panel change** → skip to step 6 (`AI_TASK_ROUTING.md`)
- **Rendering/visual** → step 6
- **Save/persistence** → step 6
- **Economy/gameplay** → step 6
- **RPG content** → step 6
- **New file** → steps 2–4, then step 8 to find the right system

## Minimal-context workflow

To reduce token usage and avoid repo-wide wandering:

1. Read the repo map and current status first.
2. Identify the smallest subsystem likely to contain the requested change.
3. Read only the relevant source files plus their immediate dependencies.
4. Do not scan unrelated systems unless the first pass shows a concrete dependency.
5. Prefer targeted edits over broad rewrites.
6. Update docs when the architecture, file responsibilities, task status, or known issues change.

## Validation commands

Use the scripts declared in `package.json`:

```bash
npm run typecheck
npm run build
npm run test
npm run lint
```

`npm run build` already runs TypeScript checking before the Vite production build. `npm run build:desktop` and `npm run desktop` are used for Electron-specific validation.

## Build number rule

`src/buildInfo.ts` is the single source of truth for the displayed build number.

- Increment `BUILD_NUMBER` by 1 for code changes or implementation PRs.
- Documentation-only changes do not need a build bump unless the user explicitly requests one.
- If a code change is incomplete because validation fails, do not claim it is complete. Record the exact failure and next step in `docs/TODO.md` or `nextSteps.md`.

## Repository-specific constraints

- Preserve the separation between `sim/`, `render/`, `ui/`, `input/`, `data/`, `settings/`, and `app/`.
- Treat simulation state as authoritative. Rendering should not own economy or progression state.
- Preserve the mobile-first, low-resolution pixel-art canvas identity while keeping DOM math/UI crisp.
- Avoid per-frame allocations in particle, RPG combat, background, and fluid hot paths.
- Keep coordinate spaces explicit. Use suffixes such as `World`, `Px`, `Ms`, `Rad`, `Screen`, `Canvas`, and `Ui` where helpful.
- Keep docs concise and factual. Mark uncertain summaries as uncertain instead of guessing.

## Before editing checklist

- [ ] Read `docs/CURRENT_STATUS.md` — is the feature already in-progress or known broken?
- [ ] Identify the smallest subsystem likely to contain the change (use `docs/AI_TASK_ROUTING.md`)
- [ ] Read only the relevant source files, not the whole repo
- [ ] Check `src/settings/save-types.ts` if the change touches any persisted state
- [ ] Confirm no `sim/` → `render/` or `sim/` → `ui/` import is being introduced
- [ ] Check `src/data/tiers/tier-definitions.ts` if the change touches tier identifiers

## Before final response checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (if sim/data/settings files were changed)
- [ ] `npm run lint` passes
- [ ] If save format changed: `SAVE_VERSION` was incremented in `save-types.ts`
- [ ] If build number should change: `src/buildInfo.ts::BUILD_NUMBER` was incremented
- [ ] Docs updated where architecture, file responsibilities, or known issues changed

## Documentation update rule

When a change affects repo orientation:

- Update `docs/AI_REPO_MAP.md` when files are added, removed, split, or their responsibility changes.
- Update `docs/FILE_GUIDE.md` when file-level responsibilities change.
- Update `docs/CURRENT_STATUS.md` when a major feature is completed or a current limitation changes.
- Update `docs/TODO.md` when work is deferred, discovered, completed, or superseded.
- Update `docs/CHANGELOG_FOR_AGENTS.md` for significant architectural changes.
- Update root `ARCHITECTURE.md` or `DECISIONS.md` only for durable architecture or technical decision changes.
- Update `file_index.md` when detailed file-level summaries change.
