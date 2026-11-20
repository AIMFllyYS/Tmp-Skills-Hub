# AGENTS.md — skill-hub

> 社团内部的 Agent Skill 共享与统一管理中心
> 本文件是 AI 编码代理的**操作索引**——只放最高频引用的命令和不可省略的硬规则。
> 详细规范在 `docs/` 下按需查阅，见末尾 [Documentation Index](#documentation-index)。

## Tech Stack

- **形态**: pnpm monorepo —— 核心库 + CLI 是确定性本体与 Agent 入口；**Web（及 Electron 桌面壳）是人用主界面**
- **语言**: TypeScript strict mode（全仓统一） | **Node**: ≥22 | **包管理**: pnpm workspace
- **packages/core**: 纯 TS 库，零框架依赖（确定性内核：库存、哈希、symlink/junction、类型登记）
- **packages/cli**: citty 命令行 + Hono 本地服务（`skills-hub scan` / `skills-hub ui`）+ 编程接口导出（供桌面端进程内复用）+ 七牛云 AI 推理封装（Vercel AI SDK v7）
- **apps/web**: Vite + React 19 + Tailwind CSS 4（人用壳：总览 / 统计 / Skills 管理 / Agent + 设置 Dialog；只消费 CLI 的 `/api`）
- **apps/desktop**: Electron 桌面封装壳（进程内启动 `packages/cli` 服务 + 静态 `apps/web/dist` + `extraResources` `self-skill/`；`esbuild` + `electron-builder` 打包，社团内部默认无签名分发）
- **promo/**: 57 秒宣传片与浅色视觉底稿工作区（**不属于 pnpm workspace**，不影响全仓质检；见 `promo/README.md`）
- 技术选型的完整论证见 [docs/designs/tech-stack-decision.md](docs/designs/tech-stack-decision.md) 与 [docs/designs/desktop-shell-v0.md](docs/designs/desktop-shell-v0.md)

## Key Commands

- Install: `pnpm install` | Build all: `pnpm build` | Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`（覆盖全仓 4 包源码与各自的 `tsconfig.test.json`）
- Test: `pnpm test`（全仓 Vitest 单元测试、契约测试与 AI 替身测试）
- Web dev: `pnpm dev:web`（Vite，`/api` 代理到本地 4321）
- CLI dev: `pnpm dev:cli scan` / `pnpm dev:cli ui`（tsx 直跑源码）
- 构建后的 CLI: `node packages/cli/dist/index.js <command>`
- 单包操作: `pnpm --filter @skills-hub/core <script>` / `@skills-hub/cli` / `@skills-hub/web` / `@skills-hub/desktop`
- 面板冒烟: `pnpm smoke`（需先 `pnpm build`；本地无 Chrome 时跳过退出 0；CI 使用 `node scripts/smoke-panel.mjs --require-chrome` 强制门禁）
- 桌面壳打包（`apps/desktop`）：先 `pnpm build`，再运行 `pnpm build:desktop`（`electron-builder --dir` 生成免签名目录包；或 `--filter @skills-hub/desktop package:win` 生成安装包，详见 [docs/designs/desktop-shell-v0.md](docs/designs/desktop-shell-v0.md)）

## Shell Environment

> 本地开发环境是 **Windows + PowerShell**，不是 bash/zsh。

- **不要用 `&&` 串联命令** — 用 `;` 分隔，或 `cmd1; if ($?) { cmd2 }` 做条件执行（package.json scripts 里例外，那由 npm 用 cmd 执行）
- **不要用 bash heredoc (`<<'EOF'`)** 写多行 commit message — 用 `git commit -F <file>` 配合临时文件
- **不要用 `&&`、`||`、`!` 做 shell 条件判断** — PowerShell 用 `-and`、`-or`、`-not`、`if ($?)`
- 含空格的路径必须用双引号包裹

## Definition of Done

1. `pnpm lint` exits 0 | 2. `pnpm typecheck` exits 0 | 3. `pnpm build` exits 0 | 4. `pnpm test` exits 0
5. Changed files staged | 6. Commit follows Conventional Commits: `type(scope): description`

## When Blocked

- `pnpm build` fails after 3 attempts → stop and report full error output
- Dependency missing → check 对应包的 `package.json` first, then ask
- Merge conflicts → stop and show conflicting files
- **Never**: delete lock files, force push, skip tests, or bypass lint

## 目标模式（无人值守执行）

> 当前项目会以「目标模式」长时间无人值守推进。用户已明确授权，本节优先于 Boundaries 里的「⚠️ Ask first」。

- **权限**：读取任意路径、装/删依赖、改根配置、建分支、推送、创建 issue 与 PR、CI 绿后自行 squash merge 进 `dev`，全部已授权，不必逐次询问。
- **自主解决障碍**：遇到问题先自己想办法解决——查文档、联网搜索、换实现路径。只有真正的阻塞（鉴权失败、必需信息缺失且无法合理推断）才停下来报告。
- **唯一禁区**：高破坏性操作。不动 `main`、不 force push、不真删用户的 skill、不向真实客户端目录（`~/.claude` 等）写入任何内容——所有写操作走沙箱，见 [store-and-paths-v0.md](docs/specs/store-and-paths-v0.md) §5。
- **遇到架构矛盾先修文档**：文档冲突通常意味着当初没规范清楚。先把规范改对（写明修订理由），再按新规范施工，不要绕过矛盾硬写代码。
- **规范是「大体硬、细节软」**：分层与依赖方向、产品红线、软删除铁律是硬的，违反即打回；文件怎么切、组件怎么组织是软的，按可读性判断。需要引入新依赖时——尽量不引入，必须引入则允许，在 PR 里说明理由。

## Project Structure

```
packages/core/    确定性内核（纯 TS 库）：类型、函数内核（库存/哈希/链接/归档/备份/草稿）、SKILL.md 解析、客户端发现
packages/cli/     终端入口（citty）+ Hono 本地服务 + 编程接口导出 + 七牛云 AI 集成（AI SDK v7）
apps/web/         人用 Web 壳（Vite + React SPA）：总览 / 统计 / Skills 管理 / Agent + 设置 Dialog；只消费 CLI 的 /api
apps/desktop/     Electron 桌面封装壳（进程内起 CLI 服务 + 静态 apps/web/dist + self-skill/；esbuild + electron-builder）
promo/            57s 宣传片与视觉底稿（独立于 pnpm workspace，不参与构建/质检）
docs/             项目内部文档（规范/设计/计划/会议/问题/审计/运维）
scripts/          辅助脚本（setup/build/dev/smoke-panel.mjs）
```

> 分层依赖方向、文件放置决策树见 [docs/conventions/project-structure.md](docs/conventions/project-structure.md) 和 [docs/conventions/code-size-and-organization.md](docs/conventions/code-size-and-organization.md)。

## Critical Rules（省略了就会犯错）

> 以下是硬性规则，违反会导致构建失败或架构腐化。详细解释见对应规范文档。

- **依赖方向单向**: `apps/desktop → packages/cli → packages/core`；`apps/web → (HTTP /api) → packages/cli → packages/core`。`core` 不依赖任何包、不 import 框架/网络/子进程、禁用 `console.*`；`web` 不直接 import `core` / `cli` / Electron。
- **确定性内核铁律**（详见 [core-patterns.md](docs/conventions/core-patterns.md)）:
  - 库存 `skills/<name>/` 是可写活跃副本——编辑写回前先落版本快照到 `archive/versions/`，写回后重算哈希并同步更新 `index.json` / `groups.json` / `stats.json` / `links.json`
  - symlink 集合变更必须使用 `tmp/` journal 先行 + 逐条原子切换 + 失败逆序回滚；严禁整目录重命名或删除未在 `links.json` 登记的用户真实目录（受管 `kind: "copy"` 条目除外）
  - 哈希必须确定——排序后的 POSIX 相对路径 + 原始字节，换行统一由 `.gitattributes` 保证
  - Windows 目录链接优先用 junction，避免要求用户提权
- **HTTP 安全与凭据红线**（详见 [http-and-routing.md](docs/conventions/http-and-routing.md) 和 [testing-and-security.md](docs/conventions/testing-and-security.md)）:
  - 本地服务只绑 `127.0.0.1`，强校验 `Host`（含 `skills-hub`）、写请求 `Origin`、写请求 `Content-Type: application/json` 与请求体大小上限（`413`）；Markdown 经 `DOMPurify.sanitize()` 净化后才渲染
  - `QINIU_API_KEY` / `GITHUB_TOKEN` 只从环境变量或 `.env` 读取，异常经 `scrub()` 脱敏，绝不进源码、日志或前端响应
  - 零静默写入、零真删除（所有移除走 `archive` / `archive/drafts/` / `.pre-reinit` 旁路）
- **TypeScript strict，禁止 `any`** — 用 `unknown` + 类型收窄（ESLint 已设为 error；测试文件经 `tsconfig.test.json` 强制检查）
- **收录前必须明确告知并获得授权**——绝不静默搬走用户已有技能（产品红线，架构规范 §4）
- **智能层写成 Skill 不写成代码**——文本判断类功能（审查/分类建议等）交给 Agent，core/cli 只做确定性操作

## Git Workflow

> **试验阶段（当前）**：规划里的正式远程仍是社团仓库 [KinomotoMio/skill-hub](https://github.com/KinomotoMio/skill-hub)，但现在先做试验版本。代码、issue、PR 一律落在当前 `origin`：[AIMFllyYS/Tmp-Skills-Hub](https://github.com/AIMFllyYS/Tmp-Skills-Hub)。不要改回、也不要推到规划里的那个仓库，除非用户明确说试验结束、要迁回正式仓。

- 干线：`main`（可演示）+ `dev`（日常集成）。主题分支从 `dev` 切出，只合回 `dev`
- 前缀：`feat/`、`fix/`、`refactor/`、`chore/`、`docs/`、`test/`、`perf/`、`ci/`
- Commit: Conventional Commits，scope 允许 `core`、`cli`、`web`、`desktop`、`docs`、`ops`、`promo`（详见 [pr-and-git-workflow.md](docs/conventions/pr-and-git-workflow.md)）
- Squash merge PRs，PR 需通过 CI 和至少一次审查

### Issue 与 PR 协作（强制 skill）

> 创建 issue、处理 issue 驱动开发、创建 PR 时，**必须先调用对应 skill**，不要自行发挥流程。

- **创建 issue / 拆 issue / 创建子 issue** → 调用 `/agents:issue-to-pr` 或 `/claude:issue-creator` skill
- **根据 issue 做 PR / issue 驱动开发** → 调用 `/agents:issue-to-pr` skill
- 每个 issue 必须写清：属于哪个块（A/B/C/D）、`depends-on`、`blocked-by`（架构规范 §7）

## Boundaries

### ✅ Allowed without asking

- 读取文件、列出目录
- 运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、单包构建与测试
- 修改 `packages/`、`apps/` 下的业务代码

### ⚠️ Ask first

- 安装或删除依赖（`pnpm add` / `pnpm remove`）
- 删除文件
- 修改根配置（`tsconfig*.json`、`eslint.config.mjs`、`pnpm-workspace.yaml`）
- Push 到 Git 或创建 PR

### 🚫 Never

- 提交 `.env*` 文件或任何密钥/凭据
- Force push 到 `main` 或受保护分支
- 修改 `pnpm-lock.yaml`（只通过 `pnpm install` 间接修改）
- 在 `core` 里引入框架依赖、`console.*` 或 I/O 之外的副作用（网络、进程管理放 `cli`）
- 未告知用户就移动/修改其本地 skill 目录（哪怕是测试）

## Key Files

- `pnpm-workspace.yaml` — workspace 定义
- `tsconfig.base.json` — 全仓共享编译选项（strict 全开）
- `eslint.config.mjs` — 全仓统一 flat config
- `packages/core/src/interfaces.ts` — 换介质时的类型登记（架构规范 §5；当前无 `implements`，运行时是函数内核）
- `packages/cli/src/index.ts` — CLI 入口；`packages/cli/src/exports.ts` — Electron 编程导出入口
- `apps/web/vite.config.ts` — Web 壳构建、分包与 `/api` 代理配置

## Documentation Index

> 详细规范在 `docs/` 下，按需查阅。不要一次性全部读取——只在相关任务时读对应文档。

### docs/designs/ — 产品与架构决策

- [architecture-initial-spec.md](docs/designs/architecture-initial-spec.md) — **架构初始规范（宏观最高约束）**：新模块/需求立项前必须按其第 1 章方法论走；issue 拆解须引用其 DAG 与 block 规则
- [tech-stack-decision.md](docs/designs/tech-stack-decision.md) — 技术选型决策记录（为什么是 core+CLI+Vite 壳而不是 Next.js）
- [app-shell-v2.md](docs/designs/app-shell-v2.md) — **人用壳信息架构**：左侧四板块（总览 / 统计 / Skills 管理 / Agent）+ 左下角设置 Dialog
- [desktop-shell-v0.md](docs/designs/desktop-shell-v0.md) — **桌面端外壳设计**：Electron vs Tauri 论证、进程内 CLI 服务、PATH 共存与无签名分发权衡
- [panel-ia-v1.md](docs/designs/panel-ia-v1.md) — 数据层约束：行级关系、批量一次原子提交、动作注册表（三栏不再是人用 IA）
- [backup-mechanism-analysis.md](docs/designs/backup-mechanism-analysis.md) — 备份机制分析稿（批 10 / #83 施工依据）

### docs/specs/ — 实现口径（分批施工前必读）

- [store-and-paths-v0.md](docs/specs/store-and-paths-v0.md) — **库存位置、目录布局、客户端发现规则、沙箱边界**：所有涉及路径的代码必须按它解析
- [cli-commands-v0.md](docs/specs/cli-commands-v0.md) — **CLI 命令面与渐进式披露机制**：命令名的唯一口径，不得自行发明
- [http-api-v0.md](docs/specs/http-api-v0.md) — **HTTP 契约**：本地服务全部读/写端点、安全中间件状态码与信封规则
- [json-contract-v0.md](docs/specs/json-contract-v0.md) — **JSON 输出契约**：CLI `--json` 信封、字段约定、错误枚举与退出码 `0|1|2`
- [ai-integration-v1.md](docs/specs/ai-integration-v1.md) — **七牛云 AI 推理服务集成口径**：Vercel AI SDK v7 + `createOpenAICompatible`、密钥铁律、`enable_thinking: false`、错误映射
- [agent-v0.md](docs/specs/agent-v0.md) — **Agent 模块唯一口径**（v1）：一等工具、`writePolicy`、AI SDK UI message stream、模型白名单、输出契约

### docs/plans/ — 计划

- [plan-batches-v1.md](docs/plans/plan-batches-v1.md) — **分批执行计划（现行执行依据）**：批 0–18 交付轨迹与系统性治理（AI SDK v7 迁移、Electron 桌面壳、CI/文档治理）
- [plan-first-shippable.md](docs/plans/plan-first-shippable.md) — 第一版工程计划（决策甬道 1–6 落地，里程碑划分已被上文取代，保留作背景）

### docs/updates/ — 会议与变更

- [meeting-2026-08-15-first-sync.md](docs/updates/meeting-2026-08-15-first-sync.md) — 第一次同步会：转写原文（一字未改）+ Step 1–6 全景路线图

### docs/issues/ — 内部问题与后置项

- [backlog-from-first-sync.md](docs/issues/backlog-from-first-sync.md) — 会上明确后置、但第一天就要躺在列表里的项
- [skill-creation-path/](docs/issues/skill-creation-path/) — **「创建」操作未定义**：用户在客户端里新建 skill 的路径分析（#169 的决策依据；#162 与 #168 的上游根因）

### docs/conventions/ — 项目规范

- [project-structure.md](docs/conventions/project-structure.md) — monorepo 目录结构、分层与依赖方向
- [core-patterns.md](docs/conventions/core-patterns.md) — 确定性内核关键模式（可写活跃副本与版本快照、journal 原子切换、哈希确定性、Windows symlink）
- [code-style.md](docs/conventions/code-style.md) — 代码风格（TypeScript、core 纯净性、CLI、React/Tailwind、测试）
- [code-size-and-organization.md](docs/conventions/code-size-and-organization.md) — 代码长度与文件组织（colocation 原则、拆分判断方法）
- [code-review.md](docs/conventions/code-review.md) — Code review 检查清单
- [pr-and-git-workflow.md](docs/conventions/pr-and-git-workflow.md) — Git 分支模型、Conventional Commits scope、PR 清单与 Issue DAG 规范
- [http-and-routing.md](docs/conventions/http-and-routing.md) — Hono API 规范、本机安全防线、流协议分离与 Web SPA 懒加载/渐进水合规则
- [testing-and-security.md](docs/conventions/testing-and-security.md) — 测试布局、`tsconfig.test.json`、Chrome 冒烟门禁、沙箱与凭据脱敏红线
- [ui-design-v1.md](docs/conventions/ui-design-v1.md) — UI 设计规范：克制灰阶、统一组件、UX 铁律、`motion-*` 动效类别、主区 `motion-enter` 缓动刷新、侧栏纵向栏+宽度淡出、Skeleton、统计图/文件树系列色例外、禁用清单（v0 已并入；批 18 修订）
