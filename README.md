# skill-hub

> 社团内部的 Agent Skill 共享与统一管理中心

## 项目简介

skill-hub 服务社团自己的成员，而不是公开市场上的所有人。要管的资产是 Skill：先把散落在 Claude / Codex / Cursor / Antigravity 等目录里的技能收到统一位置，用内容哈希去重，再用符号链接让各 Agent 继续发现和改用。人通过本机面板或桌面应用统一管理，AI Agent 则通过 CLI 与自带 Skill 按需启用或创建技能。

### 核心能力

- **本机面板与桌面应用**：左侧四板块（总览 / 统计 / Skills 管理 / Agent）+ 左下角设置 Dialog，支持 Web 面板与 Electron 桌面壳（`apps/desktop`）
- **收录本地、GitHub 与 skills.sh 技能**：内容哈希去重，同名冲突不覆盖
- **符号链接回各 Agent 技能目录**：修改即改原件，全局同步不漂移，支持受管 `copy` 降级与软删除归档
- **面板内管家 Agent 与翻译/分析**：可连接 DeepSeek、OpenRouter、OpenAI、七牛云及自定义兼容端点，支持工具审批与译文按哈希缓存
- **备份快照、重置与授信分享**：只读备份各客户端基线，可一键 `reset` 回溯，并推送技能至社团授信 Git 仓库

### 研究方向（登记在册，不第一天做）

- 账号系统与统一登录（社区玩法的前置）
- 使用量统计、个人主页与全站精选
- 浏览器插件（十秒内收录）
- 技能数量到千级后的存储介质

## 技术栈

人用 Web / Electron 面板（`bootstrap` / `ui` / 桌面安装包）；CLI 给 Agent 与脚本。完整论证见 [docs/designs/tech-stack-decision.md](./docs/designs/tech-stack-decision.md) 与 [docs/designs/desktop-shell-v0.md](./docs/designs/desktop-shell-v0.md)。

| 部分 | 技术 | 说明 |
|---|---|---|
| `packages/core` | 纯 TypeScript 库 | 确定性内核：库存、内容哈希、symlink/junction、备份、草稿、类型登记 |
| `packages/cli` | citty + Hono + AI SDK v7 | 终端入口、本机安全 HTTP 服务、编程接口导出、多服务商 AI 推理集成 |
| `apps/web` | Vite + React 19 + Tailwind CSS 4 | 人用壳 SPA（总览 / 统计 / Skills 管理 / Agent + 设置弹窗） |
| `apps/desktop` | Electron + `esbuild` + `electron-builder` | 桌面封装壳（进程内起 CLI HTTP 服务 + 内嵌 `web/dist` + `self-skill/`） |
| 共享层 | Git 仓库 | 授信成员直接写，链接分发，零服务器 |
| 工程 | pnpm workspace + TypeScript strict + Vitest | Node ≥22 |

## 快速开始

### 环境要求

- Node.js ≥22
- pnpm

### 安装与构建

```bash
pnpm install
pnpm build
```

### 环境变量配置（可选，AI 与分享功能使用）

桌面端打开「设置 → AI 连接」，选择服务商、填写密钥，可加载服务商当前模型并测试连接。也可以使用环境变量或 `.env`（仓库根目录或 `~/.skills-hub/.env`）。

```bash
# 翻译、技能分析和 Agent 对话共用。例如使用 DeepSeek：
DEEPSEEK_API_KEY=
# 可改用 OPENROUTER_API_KEY、OPENAI_API_KEY 或 QINIU_API_KEY。
# 同时配置多家时，可用 SKILLS_HUB_AI_PROVIDER 指定 deepseek / openrouter / openai / qiniu。
# 推送授信仓库与提升 GitHub API 额度
GITHUB_TOKEN=
```

### 使用

```bash
# 首次一键引导（交互确认位置、备份、收录并启动面板）
node packages/cli/dist/index.js bootstrap

# 扫描本机各 Agent 目录，列出发现的 skill（只读，不入库）
node packages/cli/dist/index.js scan

# 启动本地查看服务（App 壳的数据源，默认 127.0.0.1:4321）
node packages/cli/dist/index.js ui
```

### 开发

```bash
pnpm dev:cli scan     # tsx 直跑 CLI 源码
pnpm dev:cli ui       # 起本地数据服务
pnpm dev:web          # 另开终端:Vite 开发服务器（/api 代理到 4321）
```

### 质量检查

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm smoke            # 需先 pnpm build；本地无 Chrome 时自动跳过
```

## 项目结构

```
.
├── packages/
│   ├── core/                   # 确定性内核（纯 TS 库，零框架依赖）
│   │   └── src/                # types / interfaces / hash / clients / store / links / backup / archive / create
│   └── cli/                    # 命令行 + 本地服务 + AI SDK 封装
│       ├── self-skill/         # skills-hub 自带 SKILL.md
│       └── src/                # index / exports / ui-server / llm / agent / 各命令模块
├── apps/
│   ├── web/                    # Web 人用壳（Vite + React SPA）
│   └── desktop/                # Electron 桌面封装壳（esbuild + electron-builder）
├── promo/                      # 57s 宣传片与视觉底稿（独立目录，非 pnpm workspace）
├── docs/                       # 项目内部文档（designs / specs / conventions / plans / updates / issues / audits / ops）
├── scripts/                    # 辅助脚本（setup / build / dev / smoke-panel.mjs）
└── AGENTS.md                   # AI 编码代理操作策略
```

详细结构与分层规则见 [docs/conventions/project-structure.md](./docs/conventions/project-structure.md)。

## 文档

- [AGENTS.md](./AGENTS.md) — AI 编码代理操作策略与规范索引
- [docs/README.md](./docs/README.md) — 内部文档导航与目录规范
- [docs/designs/architecture-initial-spec.md](./docs/designs/architecture-initial-spec.md) — 架构初始规范（宏观最高约束）
- [docs/designs/tech-stack-decision.md](./docs/designs/tech-stack-decision.md) — 技术选型决策记录
- [docs/designs/desktop-shell-v0.md](./docs/designs/desktop-shell-v0.md) — 桌面端 Electron 外壳设计
- [docs/updates/meeting-2026-08-15-first-sync.md](./docs/updates/meeting-2026-08-15-first-sync.md) — 第一次同步会：原文与全景路线图

## License

MIT
