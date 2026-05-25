# Equatoria Idle Desktop Launch

`run-desktop.bat` is the easiest Windows entry point. Double-click it from the repository folder to install missing dependencies, build the desktop-safe files, and launch Electron.

## Install Dependencies

```bash
npm install
```

If `package-lock.json` is present, the batch launchers use `npm ci` when they need to install dependencies from scratch.

## Run Electron

```bash
npm run desktop
```

This runs `npm run build:desktop` first, then opens the built app in Electron. The Electron shell lives in `electron/main.cjs`, disables Chromium GPU and sandbox startup paths for broader Windows compatibility, stores Electron profile/cache data in `.electron-user-data`, writes startup/crash diagnostics to `electron-runtime.log`, uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`. No preload API is exposed.

Production Electron loads the built `dist/index.html` through the Electron-only `equatoria://app/` protocol so the desktop shell can attach a Content Security Policy header without modifying the shared web `index.html`. The production policy does not include `'unsafe-eval'`. If `EQUATORIA_ELECTRON_DEV_SERVER` is set, Electron loads that Vite dev-server URL instead and uses a development CSP that permits localhost, websocket connections, and `'unsafe-eval'` for development tooling.

Electron uses Chromium localStorage for saves. Desktop saves are separate from browser saves because Electron runs under its own app profile in `.electron-user-data`. No save migration is performed.

## Run Browser Development

```bash
npm run dev
```

The Vite development server runs at `http://localhost:3000`.

## Build For Browser Or GitHub Pages

```bash
npm run build
```

The normal production build keeps the existing GitHub Pages behavior. In GitHub Actions, Vite derives the hosted base path from `GITHUB_REPOSITORY`. Local browser builds keep `/` as the base.

Desktop builds use:

```bash
npm run build:desktop
```

That build mode uses `./` as the Vite base so Electron can load bundled scripts, CSS, fonts, and copied `ASSETS` files from `dist` without hosted paths.

## Windows Batch Files

- `run-desktop.bat` installs dependencies if needed, builds the desktop output, and launches Electron.
- `run-browser-dev.bat` installs dependencies if needed and starts the Vite dev server.
- `build-game.bat` installs dependencies if needed and runs the normal browser/static production build.

## Black Screen Checks

If Electron opens to a black screen:

1. Run `npm run build:desktop` and confirm `dist/index.html` exists.
2. Confirm `dist/ASSETS` exists. The `postbuild` script copies root assets after Vite builds.
3. Launch with `npm run electron` from the repository root so Electron can find `dist/index.html`.
4. Open Electron dev tools from the application menu and check for missing module, CSS, font, image, audio, or JSON paths.

## Missing Asset Checks

Asset references should be relative inside desktop builds. If an asset is missing, check whether the source path starts with a hosted-only root path such as `/ASSETS/...` and whether the file is copied by `scripts/copy-assets.mjs`.
