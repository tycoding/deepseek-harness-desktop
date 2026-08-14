# DeepSeek Harness Desktop

English | [中文](README.zh.md)

This directory builds the official DeepSeek Harness Web application as an Electron desktop application. The installer includes the runtime required by the application, so end users do not need to install Node.js or npm.

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

`npm run dist` requires a clean `main` branch. It fetches the official repository's `master` branch before every build, applies all changes after the commit recorded in `desktop/upstream.json`, records the new official commit on `main`, installs and builds the official project, prepares the bundled runtime, verifies that the start page is available, and writes the installer to `desktop/dist/`.

If the official update conflicts with desktop changes, the script rolls back the attempted update and stops without packaging stale or partially updated source. A rewritten official history also stops the build instead of silently replacing the recorded source line.

## Development commands

```sh
npm run sync:official
npm run prepare:runtime
npm run smoke
npm start
```

`npm run sync:official` updates from official `master`. `npm run prepare:runtime` builds and stages the bundled runtime. `npm run smoke` starts that runtime with Electron's embedded Node.js and checks the real Web start page. `npm start` opens the desktop application after the runtime has been prepared.

## Repository setup

The desktop repository uses `main` for its own history and an `upstream` remote for `https://github.com/deepseek-ai/deepseek-harness.git`. The sync script creates `upstream` when it is absent and rejects it when it points to another repository.

The application stores its startup log in the Electron user-data directory under `logs/desktop.log`. DeepSeek Harness keeps its normal user settings and workspace behavior.
