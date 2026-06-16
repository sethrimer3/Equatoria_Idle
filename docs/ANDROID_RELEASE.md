# Equatoria Idle — Android Release Guide

Last updated: 2026-06-16

This document covers everything needed to build and publish an Android App Bundle (.aab) for Google Play.

## Overview

The Android wrapper uses [Capacitor 8](https://capacitorjs.com/) to package the existing Vite/TypeScript web build into a Google Play-compatible native shell.

| Field | Value |
|---|---|
| App name | Equatoria Idle |
| Package ID | com.sethrimer.equatoriaidle |
| Capacitor version | 8.4.0 |
| Min SDK | 24 (Android 7.0) |
| Target / Compile SDK | 36 (Android 16) |
| Build tool | Gradle via `gradlew.bat` |

## One-time local setup

These tools must be installed before any Android build commands will work. The Capacitor npm scripts and the scaffolded `android/` directory are already in the repo — only the external tooling needs installing.

### 1. Java Development Kit (JDK)

Google Play requires a modern JDK. Install **JDK 17** (LTS, widely compatible with Gradle 8):

- [Eclipse Temurin 17](https://adoptium.net/temurin/releases/?version=17) (recommended)
- Accept defaults; let the installer set `JAVA_HOME` and add `java` to PATH.

Verify:
```
java -version
```
Expected output: `openjdk version "17.x.x" ...`

### 2. Android Studio

Install [Android Studio](https://developer.android.com/studio) (latest stable).

During setup, let it install:
- Android SDK (API 36)
- Android SDK Build-Tools (latest)
- Android SDK Command-line Tools

After installation, note your SDK path (usually `C:\Users\<you>\AppData\Local\Android\Sdk`).

### 3. Set ANDROID_HOME

Add the SDK path as an environment variable. In PowerShell (permanent, user scope):
```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[System.Environment]::SetEnvironmentVariable("Path", "$env:Path;$env:LOCALAPPDATA\Android\Sdk\platform-tools", "User")
```
Then restart your terminal.

Verify:
```
adb --version
```

### 4. Accept SDK licences

```
sdkmanager --licenses
```
Press `y` to accept each.

## npm scripts

All Android scripts are in `package.json`:

| Script | What it does |
|---|---|
| `npm run android:sync` | Runs `npm run build` then `npx cap sync android` — copies the latest web assets into the Android project |
| `npm run android:open` | Opens the `android/` project in Android Studio |
| `npm run android:build` | Full pipeline: build → sync → `gradlew bundleRelease` (requires JDK + SDK) |

## Day-to-day workflow

```
# 1. Build the web app and sync it into the Android project
npm run android:sync

# 2. Open Android Studio (first run or when Android-side code needs editing)
npm run android:open

# 3. Build a signed release bundle from the command line (see signing section)
npm run android:build
```

## Signing the release bundle

The `android:build` script runs `gradlew.bat bundleRelease`. For Play Store submission the bundle must be signed.

### Create a keystore (one time)

```
keytool -genkey -v -keystore android\release.keystore \
  -alias equatoria -keyalg RSA -keysize 2048 -validity 10000
```

Store `release.keystore` and the passwords **outside the repo** (or use Play App Signing to let Google manage the key).

`android/release.keystore` and `android/app/release.keystore` are in `.gitignore`.

### Configure signing in Gradle

Edit `android/app/build.gradle` to add a `signingConfigs` block pointing to your keystore, or use a `keystore.properties` file loaded at build time. See [Android signing docs](https://developer.android.com/studio/publish/app-signing) for details.

### Play App Signing (recommended)

Upload an unsigned `.aab` the first time; let Google Play manage the signing key. This is the simplest and most secure path for a new Play release.

## Targeting API 36 (Android 16)

`android/variables.gradle` already sets:
```
compileSdkVersion = 36
targetSdkVersion  = 36
minSdkVersion     = 24
```

This meets and exceeds the current Google Play requirement of `targetSdkVersion >= 35` (Android 15).

## Permissions

`android/app/src/main/AndroidManifest.xml` contains only the permissions added by Capacitor's WebView shell:

- `android.permission.INTERNET` — required for the web view to load localhost assets and any network requests.

No camera, location, contacts, push notifications, advertising IDs, or analytics SDKs have been added.

## Web assets and the base path

`npm run build` (without `GITHUB_ACTIONS` set) produces `dist/` with base path `/`. Capacitor serves these assets via `capacitor://localhost/` inside the WebView, so the `/` base is correct. Do **not** use the `build:desktop` script (`./` base) for Android.

## Verifying the build output

After `npm run android:build`:

```
android\app\build\outputs\bundle\release\app-release.aab
```

Upload this file to Google Play Console → Create new release.

## Limitations and known gaps before first Play submission

- **No app icon set** beyond the Capacitor default. Add launcher icons via Android Studio's Image Asset wizard or replace `android/app/src/main/res/mipmap-*/ic_launcher*.png`.
- **No splash screen** configured. Add `@capacitor/splash-screen` if desired.
- **No privacy policy URL** configured in the Play Console. Required for any app that collects or shares data.
- **Data Safety disclosure**: the game uses `localStorage` for save data (device-local only). This should be declared in the Play Console Data Safety section as local storage with no external sharing.
- **External font dependency**: the web build may reference fonts loaded from the `dist/` bundle; verify no external CDN calls occur at runtime before publishing.
- **Bundle size**: the current JS bundle is ~1.2 MB minified. No action needed for Play; but enabling code splitting in Vite could reduce initial load time.
