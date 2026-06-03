# Equatoria Idle Agent Entry Point

This is the short, high-signal entry point for AI coding agents. The longer legacy guideline file is `agents.md`; keep it as the detailed policy reference.

## Required read order before editing

1. `AGENTS.md` — this file.
2. `docs/AI_REPO_MAP.md` — fast orientation and subsystem-to-file map.
3. `docs/CURRENT_STATUS.md` — current build, recent work, known incomplete areas.
4. `docs/TODO.md` — condensed task list and deferred work.
5. `file_index.md` — detailed per-file reference when a subsystem needs deeper inspection.
6. `ARCHITECTURE.md` and `DECISIONS.md` — read when changing runtime flow, coordinate systems, save data, rendering architecture, or long-lived technical decisions.
7. `agents.md` — full standing rules for architecture, TypeScript discipline, naming, performance, docs, and build workflow.

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

## Documentation update rule

When a change affects repo orientation:

- Update `docs/AI_REPO_MAP.md` when files are added, removed, split, or their responsibility changes.
- Update `docs/CURRENT_STATUS.md` when a major feature is completed or a current limitation changes.
- Update `docs/TODO.md` when work is deferred, discovered, completed, or superseded.
- Update root `ARCHITECTURE.md` or `DECISIONS.md` only for durable architecture or technical decision changes.
- Update `file_index.md` when detailed file-level summaries change.
