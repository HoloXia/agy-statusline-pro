# agy-statusline-pro

零依赖的 Antigravity CLI (`agy`) 增强状态栏插件。

## 功能特性

- **具体上下文 Token 数**：直接展示 `上下文 14.2% (149K/1M)`，超过 `200K` 或达到 `>=75%` 时自动高亮提醒 `>200K` / `建议/compact`。
- **实时模型与实际子模型追踪**：同时显示设置模型与当前实际调用的底层模型（例如 `模型 Orchestrator (Neon) → 实际 Hydrogen (High)`），并展示近期切换轨迹 `轨迹 Neon×7→Hydrogen×4` 及本轮 `入 / 出` Token。
- **缓存健康度与重建提示**：兼容最新 CLI 1.5.x+ 统计，缓存冷启动或重建时提示 `缓存重建` / `+写入`。
- **按需友好提示（不触发时零干扰）**：
  - `[! 待确认]`：等待工具授权时高亮提醒
  - `[PLAN]` / `[AUTO]` / `[ACCEPT-EDITS]`：当前交互模式标签
  - `子代理 N · 后台 M · 排队 K`：运行中子代理、后台任务和排队消息数
  - `[沙箱]`：终端沙箱开启标记
  - `[NORMAL]` / `[INSERT]`：Vim 模式状态
  - `$0.42`：会话预估费用（CLI 上报时显示）
- **逐条消息明细查看 (`--history`)**：随时查看当前或指定会话每一步实际调用的模型、输入、缓存命中率、输出和工具列表。

## 本地预览与常用命令

```bash
# 预览 Orchestrator 模式 + 完整告警效果
node ~/.gemini/antigravity-cli/agy-statusline-pro/statusline.mjs --preview-orchestrator

# 查看最近一次会话逐条消息的模型与 Token 明细
node ~/.gemini/antigravity-cli/agy-statusline-pro/statusline.mjs --history

# 查看指定 transcript.jsonl 的明细
node ~/.gemini/antigravity-cli/agy-statusline-pro/statusline.mjs --history /path/to/transcript.jsonl
```

## 安装与分享给其他人

要求：**Node.js >= 20**，无需 `npm install`。

### 方式 1：直接发文件夹 / 压缩包

把整个 `agy-statusline-pro` 目录打包发给同事，对方解压后运行：

```bash
node install.mjs --language zh-CN
```

如需同时显示累计 Token 明细第 4 行：

```bash
node install.mjs --language zh-CN --details
```

### 方式 2：上传 GitHub 一键安装

将本目录推到 GitHub 仓库（`HoloXia/agy-statusline-pro`）后，其他人只需一行命令就能安装：

```bash
npx github:HoloXia/agy-statusline-pro
```

### 卸载并恢复原状态栏

```bash
node ~/.gemini/antigravity-cli/agy-statusline-pro/install.mjs --uninstall
```
