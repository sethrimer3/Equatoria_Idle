# Equatoria Idle

A mobile-first idle game where you upgrade a mathematical equation, generate coloured motes, and progress through rainbow-tiered resources.

## Quick Start

```bash
npm install
npm run dev      # Development server on http://localhost:3000
npm run build    # Production build to dist/
npm run typecheck # TypeScript type checking
```


## GitHub Pages Deployment

This repository is configured to deploy automatically to **GitHub Pages** with GitHub Actions.

- Workflow file: `.github/workflows/deploy-pages.yml`
- Trigger: pushes to `main` (or manual run from Actions tab)
- Build output: `dist/`

The Vite `base` path is resolved automatically in GitHub Actions from `GITHUB_REPOSITORY`, so assets load correctly from the repository pages URL (`https://<user>.github.io/<repo>/`).

## How to Play

1. **Tap the equation** on the canvas to earn motes
2. **Purchase upgrades** to increase motes per tap for each colour tier
3. **Unlock new tiers** as you accumulate enough resources
4. **Auto-tap** and **multiplier** upgrades accelerate your progress

## Project Structure

```
src/
  app/         — game bootstrap and main loop
  sim/         — simulation (equation, resources, progression)
  render/      — canvas rendering (equation, particles)
  ui/          — DOM-based menus, tabs, panels
  input/       — input event translation
  data/        — tier definitions, upgrades, balance constants
  settings/    — user settings and save/load
  util/        — formatting helpers
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system documentation.
See [DECISIONS.md](./DECISIONS.md) for technical decision rationale.
See [file_index.md](./file_index.md) for per-file documentation.