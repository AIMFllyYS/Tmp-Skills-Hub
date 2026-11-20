# Code Review 检查清单

> 本文档是 `AGENTS.md` 中 review 条款的完整版。
> AI 编码代理在进行 code review 或自我审查时按本清单逐项检查。
> Git、PR 与测试红线分别见 [pr-and-git-workflow.md](./pr-and-git-workflow.md) 与 [testing-and-security.md](./testing-and-security.md)。

## 分层与依赖方向

- `core` 是否引入了框架依赖、网络请求、子进程或 `console.*`？（只允许 Node 标准库 + 文件 I/O）
- `web` 是否直接 import 了 `core`、`cli` 或 Electron？（必须走 HTTP `/api`）
- `apps/desktop` 是否绕过 `packages/cli` 编程入口直接读写库存内部结构或自建业务状态？
- 是否有对 `@skills-hub/core/dist/...` 一类深路径的导入？（只允许包入口导出）

## 确定性内核（改到 core 时必查）

- 编辑写回（`saveSkillFile`）是否在写回前先落版本快照到 `archive/versions/`，并在哈希变化后同步更新 `index.json`、`groups.json`、`stats.json` 与 `links.json`？
- symlink 集合变更是否先写 `tmp/` journal，再逐条原子切换并支持失败逆序回滚？是否严格仅操作 `links.json` 台账里登记的条目（`kind: "copy"` 仅限台账显式登记为 `copy` 的受管条目，绝不整目录 rename 或删除未登记的用户真实目录）？
- 哈希逻辑的三条不变量是否被破坏？（排序、路径参与、原始字节——见 [core-patterns.md](./core-patterns.md)）
- 哈希忽略清单是否被改动？（改了 = 全库哈希迁移，必须有对应 issue）
- 确定性逻辑与文件锁（含 `tmp/` 目录预先建好）是否带了单元测试？

## HTTP 安全、XSS 与凭据脱敏

- 本地服务是否只绑 `127.0.0.1`，且强制校验证件白名单 `Host`（含 `skills-hub`）、写请求 `Origin`、写请求 `Content-Type: application/json` 与请求体大小上限（`413`）？
- 全局 `onError`、`/api/*` `404` JSON 兜底与缺失 `/assets/*` `404` 是否生效？
- 前端 Markdown 渲染（skill 内容、Agent 回复）是否经 `DOMPurify.sanitize()` 净化？
- 错误映射与日志是否对 `sk-*`、`QINIU_API_KEY`、`GITHUB_TOKEN` 做脱敏？是否杜绝 `.env` 入库与密钥进响应？
- 翻译流式失败/中止或空译文是否严格禁止写入 `translations/` 缓存？

## 产品红线

- 是否存在未告知用户就移动/修改其本地 skill 目录的代码路径？（包括测试代码；写操作只能打在沙箱 `--home`）
- 是否引入了任何真删除路径？（所有移除必须走 `archive`、`archive/drafts/` 或 `.pre-reinit` 旁路）
- 是否存在未经用户显式发起或未经工具审批的静默写入？

## 职责边界

- 新增的功能是不是文本判断类？（审查/分类建议/"有用"判定应写成 Skill 交给 Agent，不写成代码）
- 文件/函数是否过长且未按职责拆分？（关注职责混杂与自然接缝，而非行数本身）
- 单处使用的代码是否被过早提升到共享位置？

## 通用

- 是否出现 `any`？（用 `unknown` + 类型收窄；含测试文件）
- `pnpm lint`、`pnpm typecheck`（含 `tsconfig.test.json`）、`pnpm build`、`pnpm test`（及涉面板的 `pnpm smoke`）是否全部通过？
- Commit 是否符合 Conventional Commits，scope 是否使用允许值（`core`/`cli`/`web`/`desktop`/`docs`/`ops`/`promo`）？
