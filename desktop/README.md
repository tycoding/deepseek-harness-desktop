# DeepSeek Harness Desktop

English | [中文](README.zh.md)

This directory builds the official DeepSeek Harness Web application as an Electron desktop application. The installer includes the runtime required by the application, so end users do not need to install Node.js or npm. Packaging uses the official DeepSeek icon from `website/public/favicon.svg`.

## Prerequisites

- Git
- Node.js 22.19 or later
- pnpm
- The platform build tools required by Electron and `node-pty`

Run desktop packaging on the target operating system: macOS produces a DMG, Windows produces an installer, and Linux produces an AppImage.

## Build an installer

```sh
cd desktop
npm install
npm run dist
```

`npm run dist` requires a clean `main` branch. It fetches the official repository's `master` branch before every build, applies all changes after the commit recorded in `desktop/upstream.json`, aligns the desktop version with the official root package, records the new official commit on `main`, installs and builds the official project, prepares the bundled runtime, verifies that the start page is available, and writes the installer to `desktop/dist/`.

Paths in `desktop/protected-paths.json` belong to this repository and are excluded from official patches. This includes the whole `desktop/` directory, the bilingual repository home page, the desktop Agent Note, and the release workflow. If any other official update conflicts, the script rolls back the attempted update and stops without packaging stale or partially updated source. A rewritten official history also stops the build instead of silently replacing the recorded source line.

`npm run dist:current` packages an already synchronized revision and is reserved for the release workflow. It verifies version alignment but does not fetch source.

## Development commands

```sh
npm run sync:official
npm run check:version
npm run prepare:runtime
npm run smoke
npm start
```

`npm run sync:official` updates from official `master` and aligns the desktop version. `npm run check:version` checks version alignment without changing files. `npm run prepare:runtime` builds and stages the bundled runtime. `npm run smoke` starts that runtime with Electron's embedded Node.js and checks the real Web start page. `npm start` opens the desktop application after the runtime has been prepared.

## Automated releases

`.github/workflows/desktop-release.yml` checks official source daily and can also run manually. It commits a successful official update to `main`, then creates macOS and Windows installers when the official version has no existing release tag. Published versions are immutable; later official commits with the same version update `main` without replacing release files.

## Repository setup

The desktop repository uses `main` for its own history and an `upstream` remote for `https://github.com/deepseek-ai/deepseek-harness.git`. The sync script creates `upstream` when it is absent and rejects it when it points to another repository. Release tags use `v<official-version>`.

The application stores its startup log in the Electron user-data directory under `logs/desktop.log`. DeepSeek Harness keeps its normal user settings and workspace behavior.
