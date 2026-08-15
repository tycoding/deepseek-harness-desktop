# DeepSeek Harness 桌面版

[English](README.md) | 中文

本目录把官方 DeepSeek Harness Web 应用打包为 Electron 桌面软件。安装包包含软件运行所需的环境，最终用户无需安装 Node.js 或 npm。打包使用 `website/public/favicon.svg` 中的 DeepSeek 官方图标。

## 准备条件

- Git
- Node.js 22.19 或更高版本
- pnpm
- Electron 和 `node-pty` 在当前系统要求的构建工具

请在目标系统上执行桌面打包：macOS 生成 DMG，Windows 生成安装程序，Linux 生成 AppImage。

## 生成安装包

```sh
cd desktop
npm install
npm run dist
```

`npm run dist` 要求当前位于干净的 `main` 分支。它会在每次打包前拉取官方仓库的 `master` 分支，应用 `desktop/upstream.json` 所记录版本之后的全部变化，使桌面版版本号与官方根目录保持一致，在 `main` 中记录新的官方版本，然后安装并构建官方项目、整理安装包内置的运行环境、确认真实启动页面可访问，最后把安装包写入 `desktop/dist/`。

`desktop/protected-paths.json` 中的路径由本仓库独立维护，不接受官方补丁改写，其中包括整个 `desktop/` 目录、仓库双语首页、桌面版 Agent Note 和发布流程。如果其他官方更新发生冲突，脚本会撤销本次更新并停止，不会使用陈旧或只更新了一部分的代码继续打包。如果官方历史被改写，脚本也会直接停止，不会悄悄替换已经记录的代码来源。

`npm run dist:current` 只打包已经完成同步的版本，专供发布流程使用。它会检查版本号，但不会拉取源码。

## 开发命令

```sh
npm run sync:official
npm run check:version
npm run prepare:runtime
npm run smoke
npm start
```

`npm run sync:official` 从官方 `master` 更新代码并对齐桌面版版本号。`npm run check:version` 只检查版本号，不修改文件。`npm run prepare:runtime` 构建并整理内置运行环境。`npm run smoke` 使用 Electron 内置的 Node.js 启动该环境，并检查真实 Web 起始页。运行环境准备完成后，`npm start` 会打开桌面软件。

## 自动发布

`.github/workflows/desktop-release.yml` 每天检查官方源码，也支持手动运行。官方更新成功后，流程先把变化提交到 `main`；当官方版本号还没有对应的发布标签时，再生成 macOS 和 Windows 安装包。已经发布的版本保持不变；同一版本号下的后续官方提交只更新 `main`，不会替换发布文件。

## 仓库设置

桌面仓库使用 `main` 保存自身历史，并使用名为 `upstream` 的远程地址连接 `https://github.com/deepseek-ai/deepseek-harness.git`。缺少 `upstream` 时，同步脚本会自动创建；如果它指向其他仓库，脚本会拒绝继续。发布标签使用 `v<官方版本号>`。

软件把启动日志保存在 Electron 用户数据目录下的 `logs/desktop.log`。DeepSeek Harness 继续使用自身原有的用户设置和工作目录规则。
