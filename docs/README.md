# docs/

项目内部文档目录。

## 目录结构

| 目录 | 用途 |
|---|---|
| [`plans/`](./plans/) | 项目计划、路线图、里程碑（当前主计划见 [plan-batches-v1.md](./plans/plan-batches-v1.md)） |
| [`conventions/`](./conventions/) | 项目规范、编码约定、架构、HTTP 安全、测试与 Git/PR 规范 |
| [`updates/`](./updates/) | 更新日志、变更记录、会议纪要 |
| [`specs/`](./specs/) | 技术规格说明（路径约定、CLI 命令、HTTP/JSON 契约、AI SDK 与 Agent 规格） |
| [`audits/`](./audits/) | 审计报告（扫描实测、链接语义、性能审计、分享推送调研） |
| [`ops/`](./ops/) | 运维与操作指南（本地运行、环境配置、执行档案） |
| [`issues/`](./issues/) | 问题追踪与记录（后置清单、路径分析、技术债务） |
| [`designs/`](./designs/) | 设计文档（架构约束、技术选型、信息架构、桌面壳与备份设计） |

## 当前决策入口

按以下顺序阅读核心设计与规范文档：

1. [updates/meeting-2026-08-15-first-sync.md](./updates/meeting-2026-08-15-first-sync.md) — 第一次同步会：转写原文（一字未改）+ Step 1–6 全景路线图
2. [designs/architecture-initial-spec.md](./designs/architecture-initial-spec.md) — **架构初始规范（宏观最高约束）**：决策方法论、系统分块 DAG、资产模型、六操作语义、接口抽象点
3. [designs/tech-stack-decision.md](./designs/tech-stack-decision.md) — 技术选型决策记录（core + CLI + Vite 壳，而不是 Next.js）
4. [designs/desktop-shell-v0.md](./designs/desktop-shell-v0.md) — 桌面端外壳设计（Electron 进程内集成、PATH 共存与无签名分发）
5. [designs/app-shell-v2.md](./designs/app-shell-v2.md) — 人用壳信息架构（四板块 + 设置 Dialog）
6. [plans/plan-batches-v1.md](./plans/plan-batches-v1.md) — 现行分批执行计划（批 0–18 与系统性治理）
7. [issues/backlog-from-first-sync.md](./issues/backlog-from-first-sync.md) — 后置项清单
8. [conventions/http-and-routing.md](./conventions/http-and-routing.md) · [conventions/testing-and-security.md](./conventions/testing-and-security.md) · [conventions/pr-and-git-workflow.md](./conventions/pr-and-git-workflow.md) — HTTP 安全、测试红线与协作流程

## `promo/` 资产与构建隔离政策

仓库根目录下的 [`promo/`](../promo/) 存放 57 秒卡点宣传片源码、节拍配置、成片视频（`promo/film/skills-hub-promo.mp4`）与新前端浅色视觉底稿：

- **独立于 pnpm workspace**：`promo/` 未纳入 `pnpm-workspace.yaml`，不参与根级 `pnpm install`、`pnpm build`、`pnpm typecheck` 与 `pnpm test`；`eslint.config.mjs` 仅对其舞台脚本提供轻量 globals 声明，不影响核心包质检。
- **二进制资产约定**：视频成片（`*.mp4`）与图片/字体在根 `.gitattributes` 中统一标记为 `binary`，避免 Git 做文本换行转换。
- **视觉迁回纪律**：`promo/` 内的浅色视觉语言（如品牌信号色）若计划迁回 `apps/web`，必须按「先修文档后施工」原则先升级 `ui-design` 规范，不得在未修订规范前直接混入 `apps/web`。

## 文档规范

- 文档使用 Markdown 格式
- 文件名使用 kebab-case（如 `http-and-routing.md`）
- 每个文档开头注明创建日期和最后更新日期
- 技术规格文档（`specs/`）应包含背景、目标、方案、风险或完整契约口径
- 设计文档（`designs/`）应包含问题陈述、方案对比、最终决策、决策理由
