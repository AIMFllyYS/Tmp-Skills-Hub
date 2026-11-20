# v0.3 单一真源接管、冲突中心、巡检与 Git 云端备份 — 任务总清单（`task.md`）

> 对应 PRD：[PRD.md](./PRD.md)（共 459 行）
> 决策背景：[single-source-sync-and-versioning.md](../../issues/single-source-sync-and-versioning/single-source-sync-and-versioning.md)
> 前端活体组件真源：`/playbook` 路由（见 [registry.ts](../../../apps/web/src/features/playbook/registry.ts) — `T1.3` / `T2.4` / `T3.3` / `T5.3` 直接 `import` 预制组件并绑定 `/api/*`）
> 目标仓库：`AIMFllyYS/Tmp-Skills-Hub`（所有 PR 打向 `dev`）
> 本地进度监控（不进 Git）：`node docs/specs/single-source-sync-and-versioning/monitor/server.mjs` → `http://127.0.0.1:4399`
> 总体规模：**5 个 Parent Epics（`#234`–`#238`） / 15 个原子 Sub-Issues（`#239`–`#253`）**

---

## 一、自治 Agent 标准执行 SOP（每个 Sub-Issue 严格遵循）

每次承接一个新任务（`T*.*`）时，AI Agent 必须按以下 9 步顺序完整执行，不跳过任何步骤：

1. **首上下文**：先阅读根目录 [AGENTS.md](../../../AGENTS.md)，严格锁定分层铁律（`core` 零网络/子进程/`console.*`、`web` 仅走 HTTP `/api`、`desktop` 仅走 CLI 编程导出）、沙箱红线（绝不写入真实用户目录）与 Windows PowerShell 语法约束（禁 `&&` / heredoc）。
2. **定位任务与 PRD 精读**：读取本文件 `task.md`，核对目标任务的前置依赖 `depends-on` 已全部勾选 `[x]` 并合入 `dev`，随后按对应行号精读 [PRD.md](./PRD.md) 指定章节。
3. **拉取 GitHub Sub-Issue 最新上下文**：执行 `gh issue view <issueNumber> --repo AIMFllyYS/Tmp-Skills-Hub --comments`，检查是否有用户新追加的评论、纠偏或补充要求。
4. **阅读板块规范与现有源码**：按任务归属查阅相关规范（`docs/specs/`、`docs/conventions/`）及复用资产源码；从最新 `origin/dev` 切出独立主题分支（如 `feat/239-hub-paths-separation`），严禁在未合并分支上叠开新分支。
5. **实施代码与复用优先**：优先复用标注的既有函数/组件，保持文件职责单一易维护；如确需引入新依赖可自主决策，并在 PR 与 Sub-Issue 报告中说明理由。
6. **深度测试 + 本地端测 + 问题自修**：
   - 新增覆盖主流程、边界与异常回滚的单元测试/集成测试（写操作全部在 `--home` 沙箱或 `os.tmpdir()`）；
   - 执行全仓四检：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test`；涉及 Web/HTTP 必跑 `pnpm smoke`，涉及 Desktop 必跑 `pnpm --filter @skills-hub/desktop build` 与 `test`；
   - 进行真实沙箱 CLI / HTTP / 浏览器端测，发现任何问题立即修复直至全绿。
7. **文档同步与进度打勾**：
   - 将本文件 `task.md` 中对应任务从 `- [ ]` 勾选为 `- [x]`；
   - 自主判断是否需同步更新项目规范文档（接口契约 `http-api-v0.md`、命令面 `cli-commands-v0.md`、路径约定 `store-and-paths-v0.md`、Agent 工具 `agent-v0.md`、结构规范 `project-structure.md` 等，移除对应项的 `[v0.3 规划中]` 标记并反映真实改动）。
8. **原子化提交 + PR 合入 `dev` + 本地远端同步**：
   - 按 Conventional Commits 原子化提交（多行提交信息用 `git commit -F <tempfile>`）；
   - 向 `dev` 提交 PR：**PR 正文必须使用 `Refs #<subIssue>` / `Part of #<epic>`，严禁写 `Closes #N` / `Fixes #N` / `Resolves #N`（避免合入时自动关闭 Sub-Issue！）**；
   - 等待 GitHub Actions CI 全绿后 squash merge 进 `dev`，并立即切换回本地 `dev` 执行 `git pull --ff-only` 保持本地与云端最新。
9. **在对应 Sub-Issue 追加完整交付报告（绝不关闭 Sub-Issue！）**：
   - 使用 `gh issue comment <subIssue> --body-file <reportFile>` 追加评论（模板见第二节）；
   - **默认保持 Sub-Issue 为 `OPEN` 状态**：待用户深度端测验收通过后由用户手动 Close；若用户端测发现问题，将直接在 Sub-Issue 下追加评论供后续修复。

---

## 二、Sub-Issue 交付评论固定模板

```markdown
## ✅ 任务执行报告：`T*.*`

- **PR**: #<prNumber>（已 squash merge 至 `dev`，Commit: `<sha>`）
- **状态**: 代码与自动化测试已合入 `dev`，**本 Sub-Issue 保持 Open 待您手动端测后关闭**

### 1. 变更摘要
- 新增/修改模块与核心设计要点（简明条目）
- 复用的既有模块与新增依赖说明（若无新依赖写「无」）

### 2. 自动化测试与端测实测结果
- `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test`：全绿（附新增用例数）
- 沙箱端测 / `pnpm smoke` / Desktop 构建结果

### 3. 规范文档更新说明
- 若更新了 `docs/` 或 `AGENTS.md`：逐条列出文件并附 GitHub PR diff 锚点链接（如 `https://github.com/AIMFllyYS/Tmp-Skills-Hub/pull/<pr>/files#diff-...`）
- 若无变更：明确写「本次无需调整规范文档」

### 4. 开发者深度手动端测指南（请逐项体验验证）
1. **沙箱准备命令**（绝不污染真实目录）：给出可直接复制执行的 PowerShell 命令
2. **核心场景验证步骤与预期结果**
3. **关键边界/异常回滚验证步骤**
```

---

## 三、任务执行总表（按依赖拓扑分组，AI 完成后勾选 `[x]`）

### E1: 状态与资产目录分离 + 运维自愈基座 | Epic #234 | Block A + B | PRD L83-L170

- [x] **T1.1** `[core]` 状态目录 (`~/.skills-hub/`) 与唯一真源目录分离契约与兼容解析 — [#239](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/239) | [PRD.md#L85-L127](./PRD.md#L85-L127)
  - **depends-on**: 无（全专项起点，可直接开工）
  - **负责模块**: `packages/core/src/store-location.ts`, `store-layout.ts`, `fs-atomic.ts`(新增), 现有 core 模块 `normalizeHubPaths` 兼容适配, `index.ts`
  - **复用资产**: `resolveStoreRoot`, `readPointerStoreRoot`, `initializeStoreLayout`, `uniqueTmpId`, `migrateVersionedData`, `unlinkNoFollow`
- [x] **T1.2** `[cli]` 初始化路径统一、真源目录迁移 (`migrate`) 与自愈命令 (`doctor --prune` / `verify --accept`) — [#240](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/240) | [PRD.md#L128-L149](./PRD.md#L128-L149)
  - **depends-on**: T1.1 (#239)
  - **负责模块**: `packages/cli/src/store-shared.ts`, `bootstrap.ts`, `doctor.ts`, `store-query.ts`, `store-migrate.ts`(新增), `ui-server.ts`, `ui-http.ts`, `ui-{groups,drafts,content,links}.ts`, `index.ts`
  - **复用资产**: `performInit`, `writePointerFile`, `collectDoctorReport`, `performVerify`, `findDanglingLinks`, `applyLinkSet`, `hashSkillFolder`, `requireWriteAuth`
- [x] **T1.3** `[web]` 设置面板升级：目录分离展示、真源路径迁移、空间清理与自愈入口（直引 `/playbook` 组件） — [#241](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/241) | [PRD.md#L150-L170](./PRD.md#L150-L170)
  - **depends-on**: T1.2 (#240)
  - **负责模块**: `apps/web/src/features/shell/{StoreOnboarding.tsx,SettingsDialog.tsx,OverviewPage.tsx}`, `features/skills/{api.ts,types.ts}`
  - **复用资产**: `/playbook` 预制 `DualPathOnboardingView`, `DualPathSettingsSection`, `MigrateStoreDialog`, `SelfHealSection`, `DesktopAutoLaunchSection`, `formatBytes`, `useCatalog`

### E2: 客户端精准接管与纯软链接收敛引擎 | Epic #235 | Block A + B | PRD L172-L283

- [x] **T2.1** `[core]` 两级极速扫描内核 (L1 浅扫 + L2 按需深扫) 与目录分类器 — [#242](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/242) | [PRD.md#L176-L199](./PRD.md#L176-L199)
  - **depends-on**: T1.1 (#239)
  - **负责模块**: `packages/core/src/reconcile-scan.ts`(新增), `packages/core/src/index.ts`
  - **复用资产**: `discoverClientRoots`, `readLinksLedger`, `readLinkTarget`, `readStoreIndex`, `readSkillMeta`, `hashSkillFolder`, `isIgnoredSkillEntry`
- [x] **T2.2** `[core]` 冲突池数据结构与 Reconcile 精准接管收敛内核 — [#243](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/243) | [PRD.md#L200-L242](./PRD.md#L200-L242)
  - **depends-on**: T2.1 (#242)
  - **负责模块**: `packages/core/src/conflicts.ts`(新增), `packages/core/src/reconcile.ts`(新增), `packages/core/src/index.ts`
  - **复用资产**: `createBackupSnapshot`, `verifyBackupSnapshot`, `adoptSkillFolder`, `applyLinkSet`, `moveDirSafe`, `writeFileAtomicSafe`, `migrateVersionedData`, `reconcile-scan.ts`
- [ ] **T2.3** `[cli]` `reconcile` 命令、`bootstrap` 接管闭环与 `/api/reconcile/*` HTTP 端点 — [#244](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/244) | [PRD.md#L243-L260](./PRD.md#L243-L260)
  - **depends-on**: T2.2 (#243), T1.2 (#240)
  - **负责模块**: `packages/cli/src/reconcile-cmds.ts`(新增), `ui-reconcile.ts`(新增), `bootstrap.ts`, `ui-server.ts`, `index.ts`, `exports.ts`
  - **复用资产**: `planReconcile`, `executeReconcile`, `scanClientDriftL1`, `inspectDriftL2`, `requireWriteAuth`, `emitOk`, `emitError`
- [ ] **T2.4** `[web]` 全局「重新扫描 / 发现野生与冲突 skills」提醒横幅与一键合并接管弹窗（直引 `/playbook` 组件） — [#245](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/245) | [PRD.md#L261-L283](./PRD.md#L261-L283)
  - **depends-on**: T2.3 (#244)
  - **负责模块**: `apps/web/src/features/reconcile/api.ts`(新增), `App.tsx`, `OverviewPage.tsx`, `Sidebar.tsx`
  - **复用资产**: `/playbook` 预制 `ReconcileBanner`, `RescanTriggerButton`, `ReconcileDialog`, `reconcile/types.ts`, `useCatalog`

### E3: 同名多版本冲突解决中心 + Agent 智能合并 | Epic #236 | Block A + B | PRD L285-L349

- [ ] **T3.1** `[core]` 冲突变体逐文件 Diff 引擎与安全决议落盘内核 — [#246](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/246) | [PRD.md#L287-L304](./PRD.md#L287-L304)
  - **depends-on**: T2.2 (#243)
  - **负责模块**: `packages/core/src/conflict-diff.ts`(新增), `packages/core/src/conflict-resolve.ts`(新增), `conflicts.ts`, `index.ts`
  - **复用资产**: `listSkillFiles`, `readSkillFile`, `saveSkillFile`, `hashSkillFolder`, `zipDirectory`, `readStoreIndex`, `writeStoreIndex`, `readGroups`, `writeGroups`, `readUsageStats`, `readLinksLedger`, `writeLinksLedger`
- [ ] **T3.2** `[cli]` `conflicts` CLI 命令、`/api/conflicts/*` 端点与 4 个 Agent 一等合并工具 — [#247](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/247) | [PRD.md#L305-L328](./PRD.md#L305-L328)
  - **depends-on**: T3.1 (#246)
  - **负责模块**: `packages/cli/src/conflict-cmds.ts`(新增), `ui-conflicts.ts`(新增), `agent/tools.ts`, `agent/prompt.ts`, `ui-server.ts`, `index.ts`
  - **复用资产**: `conflicts.ts`, `conflict-diff.ts`, `conflict-resolve.ts`, `safeToolExecute`, `dump`, `WRITE_TOOL_NAMES`, `requireWriteAuth`
- [ ] **T3.3** `[web]` WebUI & 桌面 GUI 共享「冲突处理」板块与一键 Agent 分析合并联动（直引 `/playbook` 组件） — [#248](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/248) | [PRD.md#L329-L349](./PRD.md#L329-L349)
  - **depends-on**: T3.2 (#247), T2.4 (#245)
  - **负责模块**: `apps/web/src/features/conflicts/api.ts`(新增), `features/shell/{page.ts,SkillsPage.tsx,Sidebar.tsx,OverviewPage.tsx}`, `features/agent/AgentPage.tsx`
  - **复用资产**: `/playbook` 预制 `ConflictsView`, `ConflictDiffViewer`, `buildConflictAgentPrompt`, `SegmentedTabs`(带徽章), `useCatalog`, `useAgentChat`

### E4: 开机自启托盘静默巡检与强引导 self-skill v2 | Epic #237 | Block A + B | PRD L351-L382

- [ ] **T4.1** `[cli]` 升级 `self-skill/SKILL.md` 强触发指南与全客户端同步自检 — [#249](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/249) | [PRD.md#L353-L365](./PRD.md#L353-L365)
  - **depends-on**: T2.3 (#244)
  - **负责模块**: `packages/cli/self-skill/SKILL.md`, `packages/cli/src/bootstrap.ts`, `packages/cli/test/`
  - **复用资产**: `adoptAndEnableSelfSkill`, `parseSkillMeta`, `saveSkillFile`, `performLinkChange`, `discoverClientRoots`
- [ ] **T4.2** `[desktop]` Electron 开机自启、系统托盘静默驻留与启动 L1 巡检通知 — [#250](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/250) | [PRD.md#L366-L382](./PRD.md#L366-L382)
  - **depends-on**: T2.3 (#244)
  - **负责模块**: `apps/desktop/src/tray.ts`(新增), `apps/desktop/src/main.ts`, `preload.ts`, `apps/desktop/test/`
  - **复用资产**: `createUiApp`, `performReconcileScanL1` (`packages/cli/src/exports.ts`), Electron `Tray`, `Notification`, `app.setLoginItemSettings`

### E5: 可选 Git 版本控制与 GitHub CLI 云端备份 | Epic #238 | Block A + B + C | PRD L384-L445

- [ ] **T5.1** `[cli]` Git 进程封装、环境检测、安全 `.gitignore` 与确定性自动 Commit 引擎 — [#251](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/251) | [PRD.md#L386-L401](./PRD.md#L386-L401)
  - **depends-on**: T1.2 (#240)
  - **负责模块**: `packages/cli/src/git/{git-runner.ts,git-repo.ts,secret-scan.ts,index.ts}`(新增), `packages/cli/test/git.test.ts`(新增)
  - **复用资产**: `scrub` (`llm/errors.ts`), `HubPaths`, `isIgnoredSkillEntry`
- [ ] **T5.2** `[cli]` 挂载全链路自动 Commit、`gh` 设备码登录引导、一键建仓云端备份与 Agent Git 工具 — [#252](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/252) | [PRD.md#L402-L423](./PRD.md#L402-L423)
  - **depends-on**: T5.1 (#251), T2.3 (#244), T3.2 (#247)
  - **负责模块**: `packages/cli/src/git/gh-cloud.ts`(新增), `git-cmds.ts`(新增), `ui-git.ts`(新增), `ui-server.ts`, `agent/tools.ts`, `index.ts`
  - **复用资产**: `git-runner.ts`, `git-repo.ts`, `secret-scan.ts`, `safeToolExecute`, `WRITE_TOOL_NAMES`, `requireWriteAuth`
- [ ] **T5.3** `[web]` Git 版本控制设置、提交历史查看、`gh` 设备码登录向导与一键云端备份 UI（直引 `/playbook` 组件） — [#253](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/253) | [PRD.md#L424-L445](./PRD.md#L424-L445)
  - **depends-on**: T5.2 (#252), T1.3 (#241)
  - **负责模块**: `apps/web/src/features/git/api.ts`(新增), `SettingsDialog.tsx`, `StoreOnboarding.tsx`, `SkillViewer.tsx`
  - **复用资产**: `/playbook` 预制 `GitSettingsSection`, `GhLoginDialog`, `CloudBackupDialog`, `SkillHistoryDrawer`, `git/types.ts`

---

## 四、推荐顺序与并行波次参考

| 波次 | 可推进任务 | 说明 |
|---|---|---|
| Wave 1 | `T1.1` (#239) | 全仓双路径地基，必须最先合入 `dev` |
| Wave 2 | `T1.2` (#240) / `T2.1` (#242) | `core` 扫描与 `cli` 初始化/自愈互不冲突，可串行或并行 |
| Wave 3 | `T1.3` (#241) / `T2.2` (#243) / `T5.1` (#251) | 设置 UI、Reconcile 冲突池内核、Git 基础封装分别位于 `web`/`core`/`cli/git` |
| Wave 4 | `T2.3` (#244) / `T3.1` (#246) | Reconcile CLI/HTTP + 冲突 Diff/Resolve 内核 |
| Wave 5 | `T2.4` (#245) / `T3.2` (#247) / `T4.1` (#249) / `T4.2` (#250) | 巡检横幅、冲突 CLI+Agent、`self-skill` v2、Desktop 托盘自启 |
| Wave 6 | `T3.3` (#248) / `T5.2` (#252) | 冲突处理中心 UI + 全链路自动 Commit & `gh` 云端备份后端 |
| Wave 7 | `T5.3` (#253) | Git 设置、`gh` 设备码登录向导与单 Skill 提交历史 UI 收官 |
