# Equatoria Idle — Android Release Guide

Last updated: 2026-06-16

This document covers everything needed to build and publish a signed Android App Bundle (.aab) for Google Play internal testing and beyond.

## Overview

The Android wrapper uses [Capacitor 8](https://capacitorjs.com/) to package the Vite/TypeScript web build into a Google Play-compatible native shell.

| Field | Value |
|---|---|
| App name | Equatoria Idle |
| Package ID | com.sethrimer.equatoriaidle |
| Capacitor version | 8.4.0 |
| Min SDK | 24 (Android 7.0) |
| Target / Compile SDK | 36 (Android 16) |
| Build tool | Gradle via `gradlew.bat` |

---

## Prerequisites

These tools must be installed **once** before any Android build commands will work.

### 1. Java Development Kit — JDK 17

Install **JDK 17** (LTS):

- [Eclipse Temurin 17](https://adoptium.net/temurin/releases/?version=17) — accept defaults; installer sets `JAVA_HOME` and adds `java` to PATH.

Verify:
```
java -version
# Expected: openjdk version "17.x.x" ...
```

### 2. Android Studio + SDK 36

Install [Android Studio](https://developer.android.com/studio) (latest stable). During setup, install:
- Android SDK — API 36
- Android SDK Build-Tools (latest)
- Android SDK Command-line Tools

Note the SDK path (usually `C:\Users\<you>\AppData\Local\Android\Sdk`).

### 3. Environment variables

```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[System.Environment]::SetEnvironmentVariable(
    "Path",
    "$env:Path;$env:LOCALAPPDATA\Android\Sdk\platform-tools",
    "User"
)
```

Restart your terminal, then verify:
```
adb --version
```

### 4. Accept SDK licences

```
sdkmanager --licenses
# Press y to accept each one
```

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run android:sync` | Builds the web app then runs `npx cap sync android` to copy assets into the Android project |
| `npm run android:open` | Opens `android/` in Android Studio |
| `npm run android:build` | Full pipeline: build → sync → `gradlew bundleRelease` (requires JDK + SDK + keystore) |

---

## Generating the upload keystore (one-time)

Google Play requires every AAB to be signed with a consistent upload key. Generate it once and store it safely — **losing it means you cannot update the app**.

```powershell
keytool -genkey -v `
  -keystore android\release.keystore `
  -alias equatoria `
  -keyalg RSA -keysize 2048 -validity 10000
```

You will be prompted for:
- Distinguished name fields (name, org, country — can be anything)
- A **store password** (remember this)
- A **key password** (can match the store password)

Store `android\release.keystore` and both passwords in a password manager. Do **not** put them in the repo.

### Configure signing in Gradle

Copy the example properties file and fill in your values:

```powershell
Copy-Item android\keystore.properties.example android\keystore.properties
notepad android\keystore.properties
```

`android/keystore.properties` (fields):
```
storeFile=../release.keystore   # path relative to android/app/
keyAlias=equatoria
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
```

`android/app/build.gradle` reads this file at build time and applies signing automatically when the file is present. If the file is absent (e.g. on a CI machine without secrets), the build still succeeds but produces an unsigned bundle.

### What NOT to commit

`.gitignore` excludes:
```
android/keystore.properties
android/release.keystore
*.jks
*.keystore
*.p12
upload-key*
```

Before every push, verify none of these are staged:
```
git status
```

### Key rotation

If you need to rotate the upload key, contact Google Play support — they can reset it if you have your original keystore. This is the only safe path; the key embedded in published APKs cannot be changed unilaterally.

---

## Day-to-day release workflow

```powershell
# 1. Build web assets and copy them into the Android project
npm run android:sync

# 2. Build a signed release bundle (requires keystore.properties)
npm run android:build

# 3. Upload to Play Console
#    android\app\build\outputs\bundle\release\app-release.aab
```

Or open Android Studio manually:
```powershell
npm run android:open
# Build → Generate Signed Bundle / APK → Android App Bundle → select release keystore
```

---

## Offline assets

`capacitor.config.json` sets `webDir: "dist"`. Capacitor copies everything from `dist/` into the APK during `cap sync` and serves it via `capacitor://localhost/` inside the WebView — **no network connection is required at runtime**.

To verify the bundle is self-contained before syncing:

```powershell
npm run build
# Inspect dist/ — all JS, CSS, images, and audio must be present
```

The game makes no external network requests at runtime. `INTERNET` permission is declared in `AndroidManifest.xml` because Android's WebView stack requires it to load the `capacitor://localhost/` origin (a technical quirk of the WebView implementation, not an actual network call).

---

## localStorage persistence

Capacitor's `BridgeActivity` enables WebView DOM storage by default (`setDomStorageEnabled(true)`). `localStorage` data persists across app sessions automatically — no additional configuration is needed.

Do NOT clear WebView data via Android Settings if you need to preserve save files.

---

## Audio

The game gates all audio behind the first user interaction (tap). This matches Android WebView's autoplay policy: audio context can only be resumed in response to a touch event. No additional configuration is needed in Capacitor.

---

## Screen orientation

`AndroidManifest.xml` sets `android:screenOrientation="fullSensor"` on the main activity. The game supports both portrait and landscape; the sensor determines orientation freely. `configChanges` is also declared so orientation changes do not restart the activity.

---

## Android back button

`MainActivity.java` overrides `onBackPressed()` and calls `window.__equatoriaBack()` in the WebView via `evaluateJavascript`. The handler (registered by `src/capacitor-android.ts`) implements:

1. **Secondary tab active** — switches back to the equation (main gameplay) tab; stays in app.
2. **Equation tab** — shows `window.confirm('Leave Equatoria Idle?')`; exits if confirmed.

`src/capacitor-android.ts` is dynamically imported in `src/main.ts` only when `window.Capacitor.isNativePlatform()` is true, so the code is absent from the browser and Electron builds.

---

## Targeting API 36 (Android 16)

`android/variables.gradle` sets:
```groovy
compileSdkVersion = 36
targetSdkVersion  = 36
minSdkVersion     = 24
```

This exceeds Google Play's current requirement of `targetSdkVersion >= 35`.

---

## Permissions

`android/app/src/main/AndroidManifest.xml` declares only one permission:

- `INTERNET` — required by Android's WebView internals to load `capacitor://localhost/` assets.

No camera, location, contacts, push notifications, advertising IDs, or analytics SDKs are present.

---

## Play Console setup

1. Create app in [Google Play Console](https://play.google.com/console).
2. Complete **Data Safety** section: declare `localStorage` as on-device storage, no data shared externally.
3. Add a privacy policy URL (required even for apps that store no personal data).
4. Under **Release → Internal testing**, upload `app-release.aab`.
5. Add testers by email and share the opt-in link.

---

## Known gaps before wider release

- **App icon** — Capacitor default launcher icon. Replace `android/app/src/main/res/mipmap-*/ic_launcher*.png` via Android Studio's Image Asset wizard.
- **Splash screen** — not configured. Add `@capacitor/splash-screen` if desired.
- **Privacy policy URL** — required in Play Console.
- **Bundle size** — current JS bundle is ~1.2 MB minified. Acceptable for Play; consider Vite code splitting if load time becomes a concern.
