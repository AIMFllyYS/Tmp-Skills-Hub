# skill-hub

> 社团内部的 Agent Skill 共享与统一管理中心

## 项目简介

skill-hub 服务社团自己的成员，而不是公开市场上的所有人。要管的资产是 Skill：先把散落在 Claude / Codex / Cursor 等目录里的技能收到统一位置，用内容哈希去重，再用符号链接让各 Agent 继续发现和改用。第一件能用起来的事，是在本机跑一个统一查看的页面，并按授信成员写入共享仓库的方式完成分享。

### 核心能力

- **统一查看技能目录**（本地页面：列表、搜索、来源分类、tag）
- **收录本地与 GitHub 上的技能**
- **按文件夹内容哈希去重**
- **符号链接回各 Agent 技能目录**（改 = 全局改，不漂移）

### 研究方向（登记在册，不第一天做）

- 账号系统与统一登录（社区玩法的前置）
- 使用量统计、个人主页与全站精选
- 浏览器插件（十秒内收录）
- 技能数量到千级后的存储介质

## 技术栈

产品本体是一个本地 CLI 工具，Web 只是它的查看壳。完整论证见 [docs/designs/tech-stack-decision.md](./docs/designs/tech-stack-decision.md)。

| 部分 | 技术 | 说明 |
|---|---|---|
| `packages/core` | 纯 TypeScript 库 | 确定性内核：库存、哈希、symlink、接口抽象 |
| `packages/cli` | citty + Hono | 终端入口 + 本地查看服务 |
| `apps/web` | Vite + React 19 + Tailwind CSS 4 | 统一查看的 App 壳（纯静态 SPA） |
| 共享层 | Git 仓库 | 授信成员直接写，链接分发，零服务器 |
| 工程 | pnpm workspace + TypeScript strict | Node ≥22 |

## 快速开始

### 环境要求

- Node.js ≥22
- pnpm

### 安装与构建

```bash
pnpm install
pnpm build
```

### 使用

```bash
# 扫描本机各 Agent 目录，列出发现的 skill（只读）
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
```

## 项目结构

```
.
├── packages/
│   ├── core/                   # 确定性内核（纯 TS 库，零框架依赖）
│   │   └── src/                # types / interfaces / hash / skill-md / clients
│   └── cli/                    # 命令行 + 本地查看服务
│       └── src/                # index(citty 入口) / scan / ui-server(Hono)
├── apps/
│   └── web/                    # App 壳（Vite + React SPA）
├── docs/                       # 项目内部文档
│   ├── designs/                # 架构规范、技术选型决策
│   ├── plans/                  # 工程计划
│   ├── conventions/            # 编码与架构规范
│   ├── updates/                # 会议与变更
│   └── issues/                 # 后置项登记
├── scripts/                    # 辅助脚本
└── AGENTS.md                   # AI 编码代理操作策略
```

详细结构与分层规则见 [docs/conventions/project-structure.md](./docs/conventions/project-structure.md)。

## 文档

- [AGENTS.md](./AGENTS.md) — AI 编码代理操作策略
- [docs/designs/architecture-initial-spec.md](./docs/designs/architecture-initial-spec.md) — 架构初始规范（宏观最高约束）
- [docs/designs/tech-stack-decision.md](./docs/designs/tech-stack-decision.md) — 技术选型决策记录
- [docs/updates/meeting-2026-08-15-first-sync.md](./docs/updates/meeting-2026-08-15-first-sync.md) — 第一次同步会：原文与全景路线图

## License

MIT
