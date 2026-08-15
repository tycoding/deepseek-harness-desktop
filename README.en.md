<div align="center">
  <img src="website/public/favicon.svg" width="112" height="112" alt="DeepSeek">
  <h1>DeepSeek Harness Desktop</h1>
  <p><strong>Run the official DeepSeek Harness on your desktop, ready out of the box.</strong></p>
  <p>Tracks official source, bundles the complete runtime, and provides macOS and Windows applications that need no separate Node.js installation.</p>
</div>

[中文](README.md) | English

## About

DeepSeek Harness Desktop is an unofficial desktop distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It preserves the official Web application and local capabilities while taking responsibility only for source synchronization, runtime preparation, and installable desktop packages.

The project remains a developer preview. The desktop distribution follows rapid official development, so features and data formats may change incompatibly.

Download the latest installers from [Releases](https://github.com/tycoding/deepseek-harness-desktop/releases/latest). End users do not need Node.js, npm, or pnpm.

## Product Features

- Packages the official frontend, local service, and runtime together instead of wrapping an online page.
- Runs locally after installation without requiring end users to install Node.js, npm, or pnpm.
- Checks official `master` every 30 minutes and synchronizes new commits to this repository's `main`.
- Builds and publishes macOS and Windows installers when the official version changes.
- Stops publication when synchronization, building, or startup checks fail, preventing unusable releases.
- Preserves desktop code, release automation, application assets, and repository-owned documentation during official synchronization.

## Preview

![DeepSeek Harness Desktop preview](desktop/assets/screenshots/deepseek-harness-desktop.png)

## What Harness Means

A harness is the runtime and composition framework around an agent. It brings models, tools, sessions, permissions, workflows, and extensions together so an agent can continue completing tasks under explicit rules instead of only answering questions.

DeepSeek Harness follows an "everything is a plugin" principle. Model providers, tools, storage, terminals, and workflows can be independently composed or replaced. The desktop distribution adds installation, startup, and shutdown management without changing how the official product works.

<a id="run"></a><a id="run-from-source"></a>

## Packaging Rules

- The desktop version always comes from the official root `package.json`, and release tags use `v<official-version>`.
- macOS builds a DMG and Windows builds an installer. Each GitHub Release also provides source downloads for that version.
- Every new version becomes this repository's latest usable release, including official versions with prerelease identifiers such as `rc`.
- Every release build must first synchronize official source, build the official project, and pass a real startup check. Any failure stops publication.
- Installers contain the runtime and dependencies needed by the application. Build machines still require Git, Node.js, pnpm, and platform-native build tools.
- The application icon comes directly from the official repository's DeepSeek icon.

Build an installer for the current operating system:

```sh
cd desktop
npm install
npm run dist
```

The installer is written to `desktop/dist/`. The [desktop release workflow](.github/workflows/desktop-release.yml) handles automated publication.

## Synchronization Rules

- The source is fixed to the `master` branch of `deepseek-ai/deepseek-harness`; this repository uses `main`.
- `desktop/upstream.json` records the synchronized official commit. Every `npm run dist` checks and fetches official source first.
- `desktop/protected-paths.json` lists content owned by this repository. Synchronization never rewrites desktop code, bilingual home pages, the desktop design record, or the release workflow.
- Rewritten official history or an update conflict rolls the attempt back and stops the build instead of packaging partial source.
- Automated release checks inspect official `master` every 30 minutes and synchronize new commits to this repository's `main`. Published versions remain immutable, and an official version change creates the next release.

## Desktop Code

| Location | Purpose |
|---|---|
| `desktop/src/` | Desktop window and official service lifecycle |
| `desktop/scripts/` | Official synchronization, version alignment, runtime preparation, startup checks, and packaging |
| `desktop/electron-builder.yml` | macOS, Windows, and Linux package rules |
| `desktop/upstream.json` | Current official source revision |
| `desktop/protected-paths.json` | Repository-owned files preserved during synchronization |
| `.github/workflows/desktop-release.yml` | Cross-platform builds and release publication |

See the [desktop documentation](desktop/README.md) for detailed build instructions.

## Roadmap

- Keep pace with official capabilities and desktop compatibility while reducing the delay between official updates and desktop releases.
- Add formal macOS and Windows signing to reduce operating-system warnings on first install.
- Add in-application updates so users do not need to download every release manually.
- Improve first launch, configuration migration, failure messages, and cross-platform installation.
- Add Linux installers and more system architectures after the official release cadence stabilizes.

## License and Official Links

- License: [MIT](LICENSE)
- Third-party licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- Official DeepSeek Harness repository: [https://github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- DeepSeek website: [https://deepseek.com](https://deepseek.com)
