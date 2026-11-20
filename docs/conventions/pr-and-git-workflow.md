# Git 工作流、PR 与发布规范

> Created: 2026-11-20
> Updated: 2026-11-20
> Status: accepted
> 上游约束：[AGENTS.md](../../AGENTS.md) · [architecture-initial-spec.md](../designs/architecture-initial-spec.md) §7

## 一、远程仓库与分支模型

### 1.1 远程仓库策略（试验期）

- 当前代码、Issue 与 PR 一律落在 `origin`：`AIMFllyYS/Tmp-Skills-Hub`。
- 社团正式目标仓库为 `KinomotoMio/skill-hub`；在明确宣布试验阶段结束并迁回之前，**不得私自更改远程或向正式仓推送**。

### 1.2 双干线 + 主题分支

| 分支 | 角色 | 规则 |
|---|---|---|
| `main` | 可演示稳定干线 | 禁止直接开发提交、禁止 force push |
| `dev` | 日常集成分支 | 所有主题分支必须从最新 `dev` 切出，并只合回 `dev` |
| 主题分支 | 单一 Issue / 任务分支 | 命名 `<type>/<issue编号>-<slug>` 或 `<type>/<slug>`（如 `feat/216-ai-sdk`、`fix/159-backup-aside`）；禁止在上一个未合入分支上叠开新分支 |

允许的分支前缀：`feat/`、`fix/`、`refactor/`、`chore/`、`docs/`、`test/`、`perf/`、`ci/`。

## 二、Conventional Commits 与允许的 Scope

提交信息必须符合 Conventional Commits：

```text
<type>(<scope>): <subject>
# 或跨包全局治理：
<type>: <subject>
```

- **常用 `type`**：`feat`、`fix`、`refactor`、`docs`、`test`、`chore`、`perf`、`ci`
- **允许的 `scope`**：
  - `core` — `packages/core`
  - `cli` — `packages/cli`
  - `web` — `apps/web`
  - `desktop` — `apps/desktop`（Electron 桌面壳）
  - `docs` — `docs/`、`AGENTS.md`、`README.md`、`SKILL.md`
  - `ops` — `.github/`、根目录工程治理文件、`scripts/`
  - `promo` — `promo/` 宣传片舞台与素材
- 多包联动可使用逗号分隔（如 `feat(cli,web): ...`），保持主题简明。

### Windows + PowerShell 提交纪律

本地主力环境为 **Windows + PowerShell**：

- 禁止使用 `&&`、`||` 或 `!`（改用 `;` 或 `if ($?)`）。
- 禁止使用 bash heredoc（`<<'EOF'`）编写多行 commit/PR 文案；使用临时文件配合 `git commit -F <tempfile>`。

## 三、Issue DAG 与协作流程

遵循 [architecture-initial-spec.md](../designs/architecture-initial-spec.md) §7 的硬要求：**先 DAG 后 issue，先 issue 后代码**。

1. 新建 Issue 必须使用仓库模板（[bug_report.yml](../../.github/ISSUE_TEMPLATE/bug_report.yml) 或 [feature_task.yml](../../.github/ISSUE_TEMPLATE/feature_task.yml)）。
2. 每个 Issue 必须显式写清：
   - **所属分块**：`A`（库存与镜像层）/ `B`（App 壳与桌面壳）/ `C`（分享层）/ `D`（社区与统计层）或 `Ops / Docs / CI`；
   - **`depends-on`**：前置依赖的 Issue；
   - **`blocked-by`**：当前阻断项（如 D 块受账号系统与使用数据阻断）。
3. 协作流程强制调用仓库对应 Skill（`/agents:issue-to-pr`、`/claude:issue-creator`），不自行跳过流程。

## 四、Pull Request 检查清单

所有 PR 必须按 [pull_request_template.md](../../.github/pull_request_template.md) 填写，目标分支指向 `dev`：

1. **关联 Issue**：正文末尾写清唯一主关闭标记 `Closes #N`。
2. **依赖方向不变**：`apps/desktop` → `packages/cli` → `packages/core`；`apps/web` →（HTTP `/api`）→ `packages/cli` → `packages/core`。`core` 零框架/网络/子进程依赖；`web` 禁止 import `core` 或 `cli`。
3. **契约与文档同步**：CLI `--json`、HTTP `/api`、工具面、路径约定发生变更时，必须在同一个 PR 内同步更新 `docs/specs/`、`docs/conventions/`、测试与 `SKILL.md`。
4. **本地与 CI 四检全绿**：
   - `pnpm lint`
   - `pnpm typecheck`（含各包 `tsconfig.test.json`）
   - `pnpm build`
   - `pnpm test`
   - 涉及前端/服务时加跑 `pnpm smoke`（[ci.yml](../../.github/workflows/ci.yml) 的 `smoke` job 以 `--require-chrome` 强制门禁）
5. **合并策略**：采用 **Squash merge** 合入 `dev`，需 CI 全绿且经过至少一次代码审查（见 [code-review.md](./code-review.md)）。

## 五、版本管理与发布约定

- **Workspace 内部包**：`@skills-hub/core`、`@skills-hub/cli`、`@skills-hub/web`、`@skills-hub/desktop` 在试验阶段保持 `private: true`，版本号（当前 `0.2.0`）随里程碑同步演进，不向公共 npm registry 发布。
- **桌面端分发版本**：`apps/desktop/package.json` 的 `version` 字段即 `electron-builder` 产物版本；当前面向社团内部默认采用**无签名（unsigned）分发**（详见 [desktop-shell-v0.md](../designs/desktop-shell-v0.md)），发布前须确认全仓构建与桌面端打包产物在沙箱下可启动并连通本地服务。
- **干线发布（`dev` → `main`）**：仅当阶段性验收通过且用户明确要求更新演示干线时，将 `dev` 合并至 `main` 并打版本 tag，不在日常开发中直接提交 `main`。
