# docs/

项目内部文档目录。

## 目录结构

| 目录 | 用途 |
|---|---|
| [`plans/`](./plans/) | 项目计划、路线图、里程碑 |
| [`conventions/`](./conventions/) | 项目规范、编码约定、架构规范 |
| [`updates/`](./updates/) | 更新日志、变更记录、会议纪要 |
| [`specs/`](./specs/) | 技术规格说明（功能规格、API 规格、AI harness 规格） |
| [`audits/`](./audits/) | 审计报告（性能审计、安全审计、代码审计） |
| [`ops/`](./ops/) | 运维与操作指南（本地运行教程、环境配置） |
| [`issues/`](./issues/) | 问题追踪与记录（已知问题、bug 记录、技术债务） |
| [`designs/`](./designs/) | 设计文档（架构设计、UI/UX 设计、技术方案） |

## 当前决策入口

第一次同步会之后，按这个顺序读：

1. [updates/meeting-2026-08-15-first-sync.md](./updates/meeting-2026-08-15-first-sync.md) — 第一次同步会：转写原文（一字未改）+ Step 1–6 全景路线图
2. [designs/architecture-initial-spec.md](./designs/architecture-initial-spec.md) — **架构初始规范（宏观最高约束）**：决策方法论、系统分块 DAG、资产模型、接口抽象点
3. [designs/tech-stack-decision.md](./designs/tech-stack-decision.md) — 技术选型决策记录（core + CLI + Vite 壳，而不是 Next.js）
4. [plans/plan-first-shippable.md](./plans/plan-first-shippable.md) — 第一版工程计划
5. [issues/backlog-from-first-sync.md](./issues/backlog-from-first-sync.md) — 后置项，第一天就躺在列表里

## 文档规范

- 文档使用 Markdown 格式
- 文件名使用 kebab-case（如 `harness-design-spec.md`）
- 每个文档开头注明创建日期和最后更新日期
- 技术规格文档（specs/）应包含背景、目标、方案、风险四个部分
- 设计文档（designs/）应包含问题陈述、方案对比、最终决策、决策理由
