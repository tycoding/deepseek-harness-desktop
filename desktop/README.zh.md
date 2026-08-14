# DeepSeek Harness 桌面版

[English](README.md) | 中文

本目录把官方 DeepSeek Harness Web 应用打包为 Electron 桌面软件。安装包包含软件运行所需的环境，最终用户无需安装 Node.js 或 npm。

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

`npm run dist` 要求当前位于干净的 `main` 分支。它会在每次打包前拉取官方仓库的 `master` 分支，应用 `desktop/upstream.json` 所记录版本之后的全部变化，在 `main` 中记录新的官方版本，然后安装并构建官方项目、整理安装包内置的运行环境、确认真实启动页面可访问，最后把安装包写入 `desktop/dist/`。

如果官方更新与桌面版改动发生冲突，脚本会撤销本次更新并停止，不会使用陈旧或只更新了一部分的代码继续打包。如果官方历史被改写，脚本也会直接停止，不会悄悄替换已经记录的代码来源。

## 开发命令

```sh
npm run sync:official
npm run prepare:runtime
npm run smoke
npm start
```

`npm run sync:official` 从官方 `master` 更新代码。`npm run prepare:runtime` 构建并整理内置运行环境。`npm run smoke` 使用 Electron 内置的 Node.js 启动该环境，并检查真实 Web 起始页。运行环境准备完成后，`npm start` 会打开桌面软件。

## 仓库设置

桌面仓库使用 `main` 保存自身历史，并使用名为 `upstream` 的远程地址连接 `https://github.com/deepseek-ai/deepseek-harness.git`。缺少 `upstream` 时，同步脚本会自动创建；如果它指向其他仓库，脚本会拒绝继续。

软件把启动日志保存在 Electron 用户数据目录下的 `logs/desktop.log`。DeepSeek Harness 继续使用自身原有的用户设置和工作目录规则。
