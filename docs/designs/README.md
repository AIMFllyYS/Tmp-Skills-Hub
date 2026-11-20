# docs/designs/

设计文档。

## 用途

存放架构设计和技术方案文档，包括：
- 系统架构设计（整体架构、模块划分、数据流）
- UI/UX 设计（页面布局、交互设计、组件设计）
- 技术方案（技术选型对比、方案决策记录）

## 现有文档

- [architecture-initial-spec.md](./architecture-initial-spec.md) — 项目架构初始规范（宏观最高约束：方法论、系统分块 DAG、资产模型、六操作语义、接口抽象点）
- [tech-stack-decision.md](./tech-stack-decision.md) — 技术选型决策记录（core + CLI + Vite 壳，而不是 Next.js）
- [app-shell-v2.md](./app-shell-v2.md) — 人用壳信息架构 v2（左侧四板块：总览 / 统计 / Skills 管理 / Agent + 左下角设置 Dialog）
- [desktop-shell-v0.md](./desktop-shell-v0.md) — 桌面端外壳设计 v0（Electron vs Tauri、进程内 CLI 服务、PATH 共存与无签名分发权衡）
- [panel-ia-v1.md](./panel-ia-v1.md) — 面板数据层约束（行级关系、批量一次原子提交、动作注册表；三栏骨架已由 `app-shell-v2.md` 取代）
- [backup-mechanism-analysis.md](./backup-mechanism-analysis.md) — 客户端 skills 备份机制分析稿（共享 blob 池与还原口径）

## 文档结构模板

```markdown
# [Design Title]

> Created: YYYY-MM-DD
> Updated: YYYY-MM-DD
> Status: draft | review | accepted | deprecated

## 问题陈述
[要解决什么问题]

## 方案对比
[列出多个候选方案及其优劣]

## 最终决策
[选择了哪个方案]

## 决策理由
[为什么选择这个方案]
```
