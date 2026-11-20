# Codex Goal Mode（GPT 6.2 Sol 整夜自治执行）启动提示词

> 用途：直接复制下方代码块中的完整提示词，粘贴到 **Codex Goal Mode（`/goal` · GPT 6.2 Sol）** 启动整夜无人值守推进 `v0.3` 全部 5 个 Epic / 15 个 Sub-Issues（`#239`–`#253`）。
> 配合本地进度监控面板 `http://127.0.0.1:4399`（运行 `node docs/specs/single-source-sync-and-versioning/monitor/server.mjs`），次日清晨可直接逐个 Sub-Issue 查看执行报告并按手动端测步骤验收关单。

```markdown
/goal 自底向上按 DAG 顺序自动完成 Skills Hub v0.3 单一真源、纯软链接收敛、冲突解决中心、托盘巡检与 Git 云端备份专项的全部 15 个 Sub-Issues（#239–#253），每个子任务独立分支、深度测试、沙箱端测、提 PR 合入 dev 并在对应 Sub-Issue 下追加完整执行报告与手动端测指南，遇不可解阻塞则清晰标记并跳过受阻塞分支继续推进其余可执行任务，直至所有可推进任务全部完成。

## 一、核心上下文与单一真源（每次切入新任务必须重读）

1. **首上下文（最高约束）**：`AGENTS.md`
2. **任务总表与进度勾选**：`docs/specs/single-source-sync-and-versioning/task.md`（按 Wave 1 → Wave 7 顺序推进，做完一项勾选 `[x]`）
3. **详细技术规格**：`docs/specs/single-source-sync-and-versioning/PRD.md`（按 `task.md` 指向的精确 `PRD.md#Lstart-Lend` 精读）
4. **GitHub Sub-Issue 实时上下文**：执行每个任务前必须运行 `gh issue view <num> --repo AIMFllyYS/Tmp-Skills-Hub --comments`（注意读取全部审校补充与 Playbook 直引契约评论！）
5. **前端活体组件与动效真源（`/playbook` 路由）**：`apps/web/src/features/playbook/registry.ts`
   - 四个前端子任务（`T1.3 #241`、`T2.4 #245`、`T3.3 #248`、`T5.3 #253`）所需的全部原子控件、统一动效与目标页面/弹窗组件已在 `/playbook` 预制完成并验收对齐 `docs/conventions/ui-design-v1.md`；
   - **禁止重造 UI 或手写重复过渡动画**：直接 `import` 对应预制组件，专注补齐 `api.ts`、状态绑定、路由接入与前端测试！

## 二、不可违背的硬性约束（Constraints）

1. **Shell 环境为 Windows + PowerShell**：
   - 禁止使用 `&&`、`||`、`!` 串联命令（改用 `;` 或 `if ($?) { ... }`）；
   - 禁止使用 bash heredoc（`<<'EOF'`），多行 commit / PR / Issue 评论统一写临时文件后配合 `git commit -F <file>`、`gh pr create --body-file <file>`、`gh issue comment --body-file <file>`。
2. **绝对沙箱红线**：
   - 严禁向真实用户目录（`~/.claude`、`~/.codex`、`~/.agents`、`~/.gemini`、`~/.skills-hub`、`D:\projects\My-Skills\Hubs`）写入、移动或删除任何文件！
   - 所有单测、集成测试与端测必须经 `--home <repo>/.sandbox/<runId>` 或 `os.tmpdir()` 隔离运行，跑完清理临时目录。
3. **绝对架构分层红线**：
   - `apps/desktop → packages/cli → packages/core`；`apps/web → (HTTP /api) → packages/cli → packages/core`；
   - `packages/core` 严格零框架、零网络、零子进程（`git`/`gh` 必须放 `packages/cli/src/git/`）、零 `console.*`；
   - `apps/web` 严禁 import `core` / `cli` / Electron；
   - TypeScript strict 全开，零 `any`，零真删除（所有移除走 `archive/`、`archive/versions/`、`archive/conflicts/`、`.pre-migrate-*` 旁路）。
4. **防踩坑硬契约（已在施工前审校确认）**：
   - `packages/core/src/*.ts` 严禁在同一行同时出现 `rm(`、`recursive`、`skills`（`spec-conformance.test.ts` 静态门禁）；
   - 真源迁移 CLI 命令名为单词 `migrate`（非 `migrate-store`，匹配 `spec-conformance.test.ts` 的 `subCommands` 正则）；
   - `resolveHubPaths` 传入 `--home <X>` 时优先读取 `<X>/.skills-hub/config.json`，保证 `smoke-panel.mjs` 与 `json-contract.test.ts` 全绿；
   - `UiRouteContext` 增加 `paths: HubPaths | null` 并穿透到全部 `ui-*.ts` 路由；
   - `scripts/smoke-panel.mjs` 强门禁：点开 skill 卡片后 4s 内 `fetch <= 2`（因此 `SkillHistoryDrawer` 必须点击「历史记录」后才懒请求 `/api/git/log`）、静置 10s 无定时器轮询、保留 `nav-settings` / `reset-button` / `store-init-path` / `store-init-button`；
   - 不动 `main` 分支，不 force push，允许在确有必要时自主增删依赖并在 PR/Sub-Issue 报告说明理由。
5. **严禁自动关闭 Sub-Issue**：
   - 每个任务 PR 必须打向 `dev`，PR 正文关联 Issue 一律写 **`Refs #<subIssue>` / `Part of #<epic>`**，**绝对禁止写 `Closes #N` / `Fixes #N` / `Resolves #N`**！
   - 默认保持所有 Sub-Issue 为 `OPEN` 状态，由用户明早手动端测验收后自行关闭。

## 三、单任务自治闭环流程（对每个可执行 Sub-Issue 严格循环）

从最新 `origin/dev` 同步后，选取 `task.md` 中下一个前置 `depends-on` 已全部完成且未勾选的 Sub-Issue：

1. **读上下文**：`AGENTS.md` → `task.md` → 对应 `PRD.md#Lstart-Lend` → `gh issue view <num> --repo AIMFllyYS/Tmp-Skills-Hub --comments` → 相关板块规范与源码；
2. **切独立分支**：`git checkout dev; git pull --ff-only; git checkout -b <type>/<num>-<slug>`；
3. **复用优先实现**：按 PRD 模块划分高内聚落盘（前端直接 `import` `/playbook` 预制组件）；
4. **深度测试 + 沙箱端测**：
   - 补全主流程、边界与失败回滚单测/集成测试；
   - 运行四检：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test`；
   - 涉及 `apps/web` 或 `ui-server` 加跑 `pnpm smoke`；涉及 `apps/desktop` 加跑 `pnpm --filter @skills-hub/desktop build` 与 `test`；
   - 在独立沙箱目录执行 CLI / HTTP / 界面端测，发现问题立即修复；
5. **同步规范与打勾**：
   - 在 `task.md` 中将该任务勾选为 `- [x]`；
   - 自主判断是否需更新项目规范文档（如把 `cli-commands-v0.md` / `http-api-v0.md` / `agent-v0.md` 对应项从预留移入正式表、更新字段/结构说明等），在同一 PR 中同步提交；
6. **原子提交 → PR → CI 绿后合并 → 同步 `dev`**：
   - Conventional Commits 原子化 commit；
   - `git push -u origin <branch>` → `gh pr create --base dev ...`（正文仅用 `Refs #<num>`）；
   - `gh pr checks <pr> --watch` 等待全部 CI 绿灯（若 CI 失败则拉日志修复并重新推送，最多 3 轮）；
   - `gh pr merge <pr> --squash --delete-branch` → `git checkout dev; git pull --ff-only`；
7. **在 Sub-Issue 追加完整交付报告（保持 OPEN！）**：
   - 按 `task.md` §二 固定模板运行 `gh issue comment <num> --repo AIMFllyYS/Tmp-Skills-Hub --body-file <reportFile>`，必须包含：
     1. PR 链接、Commit SHA、变更文件与复用/新增依赖说明；
     2. 四检、新增单测数与沙箱端测实测结果；
     3. 规范文档更新说明（若有改动，直接贴出对应 PR files diff 锚点链接）；
     4. **开发者深度手动端测指南**（精确可复制的沙箱 PowerShell 命令、操作步骤、预期输出与异常边界验证方式）。

## 四、阻塞自愈与自动跳过机制（整夜不卡死策略）

如果在任意 Sub-Issue 中遇到编译、测试、冒烟、依赖或 CI 失败：
1. **先自主根因修复**：分析完整报错日志、核对规范与测试契约，执行最多 **3 轮结构化修复尝试**；
2. **确认真实阻塞后的优雅降级（绝不整夜空转或破坏 `dev`）**：
   - 若 3 轮后仍存在不可自行解决的硬阻塞（如外部环境/网络故障、无法绕过的系统权限/原生构建异常、需求存在不可推断的硬冲突）：
     1. 在该 Sub-Issue 下追加一条标题为 `## ⚠️ [BLOCKED] 自动推进受阻报告` 的评论，写清：精确报错日志、已尝试的 3 轮修复与排查结论、需要人工介入的最小决策点；
     2. 保持 `task.md` 中该任务为 `- [ ]`（不错误勾选），可选择将半成品分支推送为 Draft PR 留档或清理工作区，**立即切回干净的 `dev` 分支**（确保 `dev` 永远处于 100% 绿灯状态）；
     3. 将该任务及其直接下游强依赖标记为本轮跳过，**立刻转向 DAG 中其余无阻塞的可执行分支继续推进**（例如若 `T4.2` Desktop 打包阻塞，完全不影响继续完成 `T3.1`–`T3.3` 与 `T5.1`–`T5.3`）！

## 五、Done-When 结束条件与次日清晨汇总报告

当且仅当 `task.md` 中**所有非阻塞可执行任务均已完成并合入 `dev`**（或剩余全部任务均已明确登记 `[BLOCKED]` / 受阻上游）时结束目标循环，并输出一份清晰的清晨验收总表：
- 列出 `#239`–`#253` 全部 15 个任务的状态（`DONE (PR #xxx)` / `BLOCKED (原因)` / `SKIPPED (受阻于 T*.*)`）；
- 给出推荐的清晨人工端测验收顺序与 `http://127.0.0.1:4399` 监控面板复核提示。
```
