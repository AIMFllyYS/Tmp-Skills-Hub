# docs/conventions/

项目规范、编码约定、架构规范。

## 用途

存放项目内部的规范文档，包括：
- 编码规范（TypeScript、React、命名等）
- 架构规范（monorepo 分层、依赖方向、确定性内核约束）
- Git 规范（分支策略、Commit 消息格式）
- 文档编写规范

## 现有文档

- [project-structure.md](./project-structure.md) — monorepo 目录结构、分层与依赖方向、文件放置决策树
- [core-patterns.md](./core-patterns.md) — 确定性内核关键模式（不可变 store、原子切换、哈希确定性、Windows symlink、智能层写成 Skill）
- [code-style.md](./code-style.md) — 代码风格规范（TypeScript、core 纯净性、CLI、React/Tailwind、中英文口径）
- [code-size-and-organization.md](./code-size-and-organization.md) — 代码长度与文件组织规范（长度阈值、colocation 原则、拆分判断方法）
- [code-review.md](./code-review.md) — Code review 检查清单
- [ui-design-v1.md](./ui-design-v1.md) — UI 设计规范（克制灰阶、统一组件、UX 铁律）；[ui-design-v0.md](./ui-design-v0.md) 已取代

## 与 AGENTS.md 的关系

`AGENTS.md` 是面向 AI 编码代理的操作策略文件，而本目录存放的是面向人类开发者的完整规范文档。AGENTS.md 中的规则应与本目录下的规范保持一致，但本目录可以包含更详细的解释和背景说明。
