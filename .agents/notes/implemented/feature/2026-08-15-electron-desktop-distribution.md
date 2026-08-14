# Agent Note: Electron desktop distribution with official-source synchronization

Status: implemented

English | [中文](2026-08-15-electron-desktop-distribution.zh.md)

## Problem

DeepSeek Harness is a Web application backed by a local Node.js service. A desktop distribution must run on an end user's machine without requiring a separate Node.js installation while continuing to consume official development from `deepseek-ai/deepseek-harness`.

Desktop-only code also needs an independent home so routine official updates do not mix packaging policy into upstream-owned packages.

## Decision

The `desktop/` directory owns an Electron application and all desktop packaging scripts. Electron starts the built DeepSeek Harness Web service with its embedded Node.js runtime, loads the loopback-only address in a sandboxed window, and stops the service when the application quits. Installers include the prepared application runtime and production dependencies.

The desktop repository uses `main`; the official repository uses `master` through the `upstream` remote. `desktop/upstream.json` records the official commit represented by the desktop source. Every installer build requires a clean desktop branch, fetches official `master`, applies the changes after that recorded commit, and commits the new official position before installing dependencies or building. A conflicting update or rewritten official history stops and rolls back the update before packaging begins.

The runtime preparation uses the official build and deploy paths, copies any required workspace packages omitted from the deployed dependency closure, replaces package-manager links with files, and rebuilds native terminal support for Electron. A smoke check launches the prepared service with Electron's embedded Node.js and requires a valid start page before installer creation.

Each operating system builds its own native artifact: DMG on macOS, an NSIS installer on Windows, and AppImage on Linux. The project does not claim cross-platform installers from one host.

## Alternatives considered

**Tauri.** Tauri reduces the shell size, but the existing local service still requires a bundled JavaScript runtime and native dependencies. That produces two runtime integration paths and more platform-specific packaging work without removing the service.

**A browser launcher plus a separately installed Node.js runtime.** This keeps packaging small but fails the requirement that the installed application run without Node.js on the end user's machine.

**Rewrite or compile the local service into a single native executable.** This would move substantial upstream code into a desktop-specific implementation and make official updates expensive to absorb. It also changes runtime behavior beyond the packaging requirement.

**Import the complete official Git history.** This makes ordinary merges available, but also copies every historical object into the desktop repository and couples repository transfer to upstream's full history. Recording one verified official commit and applying later changes keeps the desktop repository independent without weakening source traceability.

**Copy desktop changes across upstream packages.** This would spread ownership across files that official updates also modify. Keeping desktop ownership under `desktop/` gives merge conflicts a narrow and visible location.

## Consequences

- The installed application runs without a system Node.js or npm installation, at the cost of a larger download because Electron and the service runtime are bundled.
- Installer builds require Git, Node.js, pnpm, npm dependencies under `desktop/`, and native build tools; these are build-machine requirements, not end-user requirements.
- Every installer build consumes official `master` before packaging, so a conflicting upstream change blocks the build instead of producing an ambiguous artifact.
- Native dependencies and installers are prepared per operating system, so release automation needs one build host for every supported platform.
- The smoke check verifies service startup and the real start page; platform release jobs remain responsible for installer installation and signing checks.
