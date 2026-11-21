# PRD：单一真源纯软链接接管、冲突解决中心、开机巡检与 Git 云端备份（v0.3）

> 版本：v0.3.0-spec
> 创建：2026-11-20；状态：正式定案（供 5 个 Epic / 15 个 Sub-Issue 自治开发使用）
> 决策底稿：[single-source-sync-and-versioning.md](../../issues/single-source-sync-and-versioning/single-source-sync-and-versioning.md)
> 关联任务清单：[task.md](./task.md)
> 上游架构规范：[architecture-initial-spec.md](../../designs/architecture-initial-spec.md) · [store-and-paths-v0.md](../store-and-paths-v0.md) · [cli-commands-v0.md](../cli-commands-v0.md) · [http-api-v0.md](../http-api-v0.md) · [agent-v0.md](../agent-v0.md) · [desktop-shell-v0.md](../../designs/desktop-shell-v0.md) · [app-shell-v2.md](../../designs/app-shell-v2.md)

---

## 1. 产品目标与锁定决策

### 1.1 要解决的核心问题

当前 `v0.2.0` 的 `bootstrap` / `adopt` 只做「复制到总馆」，不迁出客户端原始真实目录，也不原地替换为软链接。这导致：
1. 初始化完立即形成「总馆一份 + 客户端一份」的双重平行副本，后续 `enable` 撞上 `unregistered-conflict` 无法接管；
2. 同名不同版本按扫描顺序先到先得、冲突直接跳过不留底，极易丢掉更新版本；
3. 长期使用中外部 Agent（Codex / Claude / Antigravity 等）新建或覆盖真文件夹后缺乏启动快速巡检与一键收敛能力；
4. 所有运行态（`backups/`、`archive/`、`links.json`、`translations/`、`tmp/`）与 `skills/` 混在同一个 `storeRoot`，无法直接对唯一真源目录做纯净的 Git 版本控制与 GitHub 云端备份；
5. 缺少 `doctor --prune`（清理卸载客户端留下的死台账）与 `verify --accept`（认领外部合法修改刷新哈希）两项运维自愈能力。

### 1.2 最终锁定决策（D1–D6）

| 编号 | 决策项 | 定案结论 |
|---|---|---|
| **D1** | 外部软链接（如 `ego-browser`） | 默认跳过不动，扫描清单标记为「外部托管链接」，允许用户显式勾选纳入接管 |
| **D2** | 冲突 skill 接管瞬间挂链策略 | 全部变体零丢失留存 `~/.skills-hub/conflicts/<name>/`；按目录内有效文件 `maxMtime` 最新者暂定唯一真源并立即挂回纯软链接，其余变体在冲突板块解决 |
| **D3** | 桌面端开机自启形态 | 可选开机自启并默认静默驻留系统托盘；启动 L1 巡检发现野生目录/冲突时再发 OS 通知与托盘角标 |
| **D4** | Git Commit 触发粒度 | 面板/CLI 常规确定性 CRUD 自动按规范模板提交（0 延迟、离线可用）；外部 Agent 改动与冲突融合由 Agent 写语义 commit |
| **D5** | GitHub 云端备份鉴权 | 复用官方 `gh` CLI（WebUI 设备码登录引导 + 一键建仓），Skills Hub 零保存明文 Token |
| **D6** | 目录布局与旧库存兼容 | 固定 `~/.skills-hub/` 控制备份区 + 默认 `~/.skills-hub/skills/` 唯一真源（可自定义迁移），100% 向后兼容旧单根 `config.json` |

---

## 2. 系统模块映射、资产复用矩阵与依赖 DAG

### 2.1 四包分层与模块归属（严格遵守单向依赖）

```text
apps/desktop ──(编程导入 packages/cli/src/exports.ts)──→ packages/cli ──→ packages/core
                                                              ▲
apps/web ───────────────(HTTP 127.0.0.1 /api/*)───────────────┘
```

| 板块 | 新增/重点修改文件 | 必须复用的既有资产（严禁重写造轮子） |
|---|---|---|
| **`packages/core`**（纯 TS，零网络/子进程/`console.*`） | `store-location.ts`、`store-layout.ts`、`fs-atomic.ts`、`reconcile-scan.ts`、`conflicts.ts`、`reconcile.ts`、`conflict-diff.ts`、`conflict-resolve.ts` | `discoverClientRoots`、`hashSkillFolder`、`readSkillMeta`、`isIgnoredSkillEntry`、`readLinksLedger`、`writeLinksLedger`、`applyLinkSet`、`readLinkTarget`、`findDanglingLinks`、`createBackupSnapshot`、`verifyBackupSnapshot`、`unlinkNoFollow`、`adoptSkillFolder`、`saveSkillFile`、`zipDirectory`、`migrateVersionedData`、`uniqueTmpId` |
| **`packages/cli`**（CLI + Hono + AI + `git`/`gh` 子进程） | `store-shared.ts`、`bootstrap.ts`、`doctor.ts`、`store-query.ts`、`store-migrate.ts`、`reconcile-cmds.ts`、`ui-reconcile.ts`、`conflict-cmds.ts`、`ui-conflicts.ts`、`self-skill/SKILL.md`、`git/git-runner.ts`、`git/git-repo.ts`、`git/secret-scan.ts`、`git/gh-cloud.ts`、`git-cmds.ts`、`ui-git.ts`、`agent/tools.ts`、`agent/prompt.ts`、`exports.ts` | `performInit`、`writePointerFile`、`performAdopt`、`performLinkChange`、`collectDoctorReport`、`performVerify`、`requireWriteAuth`、`emitOk`、`emitError`、`safeToolExecute`、`dump`、`WRITE_TOOL_NAMES`、`scrub`、`createUiApp`、`ui-http.ts` 安全中间件 |
| **`apps/web`**（React 19 SPA，仅消费 `/api/*`） | `features/shell/{SettingsDialog,StoreOnboarding,OverviewPage,SkillsPage,Sidebar,page}.tsx`、`features/reconcile/*`、`features/conflicts/*`、`features/git/*`、`features/skills/SkillViewer.tsx` | `components/ui/{dialog,button,badge,switch,tabs,checkbox,collapsible,scroll-area,input,tooltip}`、`ConfirmDialog`、`useCatalog`、`useAgentChat`、`lib/api-client.ts`、`lib/markdown.ts`（`DOMPurify`） |
| **`apps/desktop`**（Electron 壳，经 CLI 编程接口） | `apps/desktop/src/tray.ts`、`apps/desktop/src/main.ts`、`apps/desktop/src/preload.ts` | `createUiApp`、`createAppProtocolHandler`、`loadEnvFile`、`resolveHome`、CLI 导出的 L1 扫描与配置接口 |

### 2.2 五大 Epic / 15 个 Sub-Issue 依赖 DAG

```text
[Epic 1: 状态与资产分离 + 运维自愈]
  T1.1 (core: 双路径契约 + EXDEV 原子写)
    ├──→ T1.2 (cli: 路径统一 + migrate + doctor --prune + verify --accept)
    │      ├──→ T1.3 (web: 设置双路径/迁移/自愈 UI) ───────────────────────────────┐
    │      └──→ T5.1 (cli: git 子进程封装 + .gitignore + 密钥预检 + 自动 commit)  │
    │                                                                               │
    └──→ [Epic 2: 客户端精准接管与纯软链收敛]                                       │
           T2.1 (core: L1/L2 两级极速扫描 + maxMtime)                               │
             └──→ T2.2 (core: 冲突池 + Reconcile 收敛内核)                          │
                    ├──→ T2.3 (cli: reconcile 命令 + bootstrap 接管 + /api)         │
                    │      ├──→ T2.4 (web: 巡检横幅 + 一键合并弹窗) ───┐            │
                    │      ├──→ T4.1 (cli: self-skill v2 + 同步自检)   │            │
                    │      └──→ T4.2 (desktop: 自启托盘 + 启动 L1 通知)│            │
                    │                                                   │            │
                    └──→ [Epic 3: 冲突解决中心 + Agent 合并]            │            │
                           T3.1 (core: 逐文件 Diff + pick/merge/split) │            │
                             └──→ T3.2 (cli: conflicts API + 4 Agent工具)           │
                                    ├──→ T3.3 (web: 冲突中心 + Agent联动) ◄─────────┘
                                    └──→ T5.2 (cli: 全链路自动commit + gh登录 + 云端备份)
                                           └──→ T5.3 (web: Git/gh登录向导/云备份/历史UI)
```

---

## 3. 详细功能与技术规格（按 Epic / Task 拆分）

---

### 3.1 Epic 1：状态与资产目录分离 + 运维自愈基座（Block A + B）

#### T1.1 `[core]` 状态目录 (`~/.skills-hub/`) 与唯一真源目录分离契约与兼容解析

- **目标**：在不破坏任何既有 168 个 core 单测与旧单根库存的前提下，引入双根目录模型 `HubPaths` 与跨分区安全文件写入基础原语。
- **核心类型与契约**（`packages/core/src/store-location.ts` & `store-layout.ts`）：
  ```ts
  export interface HubPaths {
    /** 固定本机控制与备份中心（如 <home>/.skills-hub） */
    stateRoot: string;
    /** 可自定义唯一真源目录（默认 <home>/.skills-hub/skills） */
    skillsRoot: string;
    /** 兼容模式标记：legacy = 旧单根(<storeRoot>/skills)，split = v2 分离布局 */
    layoutMode: "legacy" | "split";
  }

  export interface HubConfigV2 {
    version: 2;
    stateRoot: string;
    skillsRoot: string;
    /** 兼容旧读端：等于 stateRoot（split 模式下仅用于旧信息展示） */
    storeRoot: string;
    git?: { enabled: boolean; remoteUrl?: string; branch?: string };
    autoLaunch?: boolean;
    silentTray?: boolean;
  }
  ```
- **兼容与适配函数**：
  - `normalizeHubPaths(input: string | HubPaths): HubPaths`：当传入旧 `string`（如旧测试传 `storeRoot`）时，返回 `{ stateRoot: input, skillsRoot: path.join(input, STORE_SKILLS_DIR), layoutMode: "legacy" }`；当传入 `HubPaths` 时原样透传；
  - `readHubConfig(configPath)` / `writeHubConfig(configPath, config)`：支持读取 v1 `{ storeRoot }` 自动映射为 `legacy` `HubPaths`，以及 v2 完整结构；
  - **`resolveHubPaths({ cliHome, envHome, pointerFilePath })` 沙箱解析防踩坑口径（必守 `smoke-panel.mjs` 与 `json-contract.test.ts`）**：当传入 `cliHome` 时，**优先检查 `<cliHome>/.skills-hub/config.json` 是否存在**——若存在则按其声明的 `stateRoot`/`skillsRoot` 解析（确保 `init --home <X>` 后紧跟 `adopt --home <X>` 与 `ui --home <X>` 读到完全同一个目录！）；否则若 `<cliHome>/manifest.json` 存在则按旧单根 `legacy` 兼容；
  - **静态护栏提醒**：`packages/cli/test/spec-conformance.test.ts` 会静态扫描 `packages/core/src/*.ts`，禁止任何同一行同时出现 `rm(`、`recursive`、`skills`（移除逻辑一律复用 `unlinkNoFollow` 或拆行工具函数，绝不递归硬删 `skills/`）；
  - 既有核心模块（`store.ts`、`create.ts`、`archive.ts`、`backup.ts`、`backup-restore.ts`、`links.ts`、`link-switch.ts`、`groups.ts`、`stats.ts`、`skill-files.ts`、`clients.ts`）统一通过 `normalizeHubPaths` 访问：
    - 索引/账本/备份/归档/冲突/暂存走 `paths.stateRoot`；
    - 活跃 skill 实体目录与软链接目标走 `paths.skillsRoot`；
    - `discoverClientRoots` 同时排除 `paths.stateRoot` 与 `paths.skillsRoot`（避免把用户自定义真源或 `.skills-hub` 误识别为客户端）。
- **跨盘原子写入工具**（新文件 `packages/core/src/fs-atomic.ts`）：
  - `writeFileAtomicSafe(targetPath, data)`：在 `path.dirname(targetPath)` 同目录生成 `.skills-hub-tmp-<uniqueTmpId>` 临时文件写入后 `rename` 到 `targetPath`（确保同分区无 `EXDEV`），失败自动清理临时文件；
  - `moveDirSafe(srcDir, destDir)`：优先同盘 `rename`，遇到 `EXDEV` 时执行递归拷贝 + 字节/文件数校验 + `unlinkNoFollow(srcDir)`，严禁静默丢失；
  - `computeDirDiskUsage(dirPath)`：统计目录总字节与文件数（供设置页展示 `~/.skills-hub/` 体积）。
- **验收标准**：
  1. `HubPaths` 同时支持 `stateRoot`（如 `C:\sandbox\.skills-hub`）与跨盘/独立 `skillsRoot`（如 `D:\sandbox-skills`）完成全套 `adopt` / `create` / `saveSkillFile` / `enable` / `archive` / `backup`；
  2. 旧 v1 `config.json`（仅含 `{ storeRoot }`）读取 100% 兼容，全仓原有单测无需修改即全绿；
  3. 单测显式模拟 `EXDEV` 错误验证 `moveDirSafe` 回退路径无数据丢失。

#### T1.2 `[cli]` 初始化路径统一、真源目录迁移与自愈命令 (`doctor --prune` / `verify --accept`)

- **目标**：消除 `bootstrap` 与 `performInit` 默认路径分裂，落地 `doctor --prune`、`verify --accept`、`migrate`（单命令名，兼容 `spec-conformance.test.ts` 的 `subCommands` 正则校验）及 `/api/settings` 读写接口。
- **行为契约**：
  1. **路径初始化统一与 `UiRouteContext.paths` 穿透**（`packages/cli/src/store-shared.ts`、`bootstrap.ts`、`ui-http.ts`、`ui-server.ts` 及 `ui-{groups,drafts,content,links}.ts`）：
     - 新初始化默认 `stateRoot = path.join(home, ".skills-hub")`、`skillsRoot = path.join(home, ".skills-hub", "skills")`，写入 v2 `config.json`；
     - `UiRouteContext` 增加 `paths: HubPaths | null`（与兼容字段 `storeRoot` 保持同步），`withStore` / `resolveUiHubPaths` 将 `HubPaths` 传入所有 `ui-*.ts` 路由，保证分离布局下所有既有端点读写同一真源目录；
     - 支持 `POST /api/store/init` 传入可选 `{ skillsRoot?: string }`（保持兼容旧 `{ storeRoot?: string }` 参数）；初始化提示明确告知控制中心与备份固定存于 `~/.skills-hub/`，前期不建议修改，唯一真源路径可自定义。
  2. **`skills-hub doctor --prune`** + **`POST /api/doctor/prune`**：
     - 读取 `links.json` 并复用 `findDanglingLinks`，剔除磁盘上已不存在目标路径的悬空记录（不触碰任何客户端磁盘目录），原子写回 `links.json`；
     - 支持 `--dry-run`（仅报告将清理条目数与明细）、`--yes`、`--json`。
  3. **`skills-hub verify --accept [<name...>]`** + **`POST /api/verify/accept`**：
     - 先运行只读 `performVerify`，对指定 `names`（缺省为全部 `drifted` 项）重算确定性哈希，原子同步更新 `index.json`、`groups.json`、`stats.json`、`links.json`（缺失项 `missing` 报错跳过，不静默删除）；
     - 支持 `--dry-run`、`--yes`、`--json`。
  4. **`skills-hub migrate --to <absPath>`** + **`POST /api/store/migrate`**（新文件 `packages/cli/src/store-migrate.ts`）：
     - 校验目标路径为绝对路径、非已有非空目录且非客户端目录；
     - 步骤：校验目标可写 → 拷贝当前 `skillsRoot` 下所有活跃 skill 至新路径并逐个重算 SHA-256 校验一致 → 按客户端分批调用 `applyLinkSet`（journal 原子切换）将全部受管软链接重定向到新 `skillsRoot` → 原子更新 `config.json`（及运行中 `ui-server` 动态上下文）→ 将旧 `skillsRoot` 重命名为 `<old>.pre-migrate-<timestamp>` 旁路留底（零真删除）。若 Windows 正占用旧目录而拒绝改名，原文件原地保留并返回实际备份路径；
     - 任一步失败逆序回滚软链接并保持旧 `config.json` 不变。
  5. **`GET /api/settings` & `PATCH /api/settings`**：返回 `stateRoot`、`skillsRoot`、`layoutMode`、`stateDiskBytes`、`git` 配置、`autoLaunch`、`silentTray` 及运行环境是否为桌面端；`PATCH` 原子写回可变更项。
- **验收标准**：
  - CLI `--json` 契约与 HTTP 端点单测完整覆盖 `doctor --prune`、`verify --accept`、`migrate-store`（含成功迁移后客户端软链接指向验证与中途失败回滚验证）、`/api/settings`。

#### T1.3 `[web]` 设置面板升级：目录分离展示、真源路径迁移、空间清理与自愈入口

- **目标**：升级 `StoreOnboarding.tsx`、`SettingsDialog.tsx` 与 `OverviewPage.tsx`，让用户可视化感知目录分离、安全迁移真源路径并一键自愈死链接/漂移指纹。
- **Playbook 组件直引契约（禁止重写重复 UI）**：
  - 所有视觉与动效组件已在 `/playbook`（[registry.ts](../../../apps/web/src/features/playbook/registry.ts)）完整预制，本任务**直接 `import` 并接入真实 `/api/settings`、`/api/store/migrate`、`/api/doctor/prune`、`/api/verify/accept`**：
    - `DualPathOnboardingView`（`apps/web/src/features/shell/DualPathOnboardingView.tsx`）
    - `DualPathSettingsSection`、`MigrateStoreDialog`、`SelfHealSection`、`DesktopAutoLaunchSection`、`formatBytes`（`apps/web/src/features/shell/SettingsV3Panels.tsx`）
  - **冒烟红线**：必须保留 `[data-testid="nav-settings"]`、`[data-testid="reset-button"]`、`[data-testid="store-init-path"]`、`[data-testid="store-init-button"]`。
- **交互规格**（严格遵守 `ui-design-v1.md` 克制灰阶与统一控件规范）：
  1. **首次引导（`StoreOnboarding.tsx`）**：清晰分两行说明——「控制与备份中心（固定）：`~/.skills-hub/`」「唯一真源目录（默认 `~/.skills-hub/skills/`，可自定义）」，提供目录输入框/选择并支持一键以默认推荐配置初始化。
  2. **设置 Dialog（`SettingsDialog.tsx`）**：
     - 展示只读「控制与备份中心 (`~/.skills-hub/`)」路径 + 一键复制 + 磁盘占用大小；
     - 展示「唯一真源目录 (`skillsRoot`)」路径 + 一键复制 + 「迁移真源目录」按钮（弹窗输入新绝对路径 → 二次确认 → 调 `POST /api/store/migrate` → 刷新目录并 Toast 反馈迁移结果与旧目录旁路路径）；
     - 保留原有「已发现应用」折叠区与「恢复到初始化前」危险区。
  3. **自愈入口（`OverviewPage.tsx` 的「需要处理」区块 & `SettingsDialog.tsx`）**：
     - 当 `doctor.danglingLinks.length > 0` 时展示可点击行「N 条已失效客户端台账记录 → 一键清理」（经 `ConfirmDialog` 调用 `POST /api/doctor/prune`）；
     - 当 `verify.drifted.length > 0` 时展示可点击行「N 个 skill 内容已在外部更新 → 确认并同步指纹」（展示清单经 `ConfirmDialog` 调用 `POST /api/verify/accept`）。
- **验收标准**：
  - Vitest 前端单测 + `pnpm smoke`（`--require-chrome`）通过；沙箱实测设置页展示双目录、清理死链接与认领漂移状态实时刷新无报错。

---

### 3.2 Epic 2：客户端精准接管与纯软链接收敛引擎（Block A + B）

*(系统性根治并收口历史 Issue `#162`、`#163`、`#164`、`#165`)*

#### T2.1 `[core]` 两级极速扫描内核 (L1 浅扫 + L2 按需深扫) 与目录分类器

- **目标**：提供可同时用于「首次接管」「桌面端开机启动巡检」与「UI 手动重扫」的高性能两级扫描内核（新文件 `packages/core/src/reconcile-scan.ts`）。
- **L1 极速浅扫 (`scanClientDriftL1(home, paths)`)**：
  - 调用 `discoverClientRoots(home, { storeRoot: paths.stateRoot, extraExcludeDirs: [paths.skillsRoot] })`；
  - 对每个客户端的 `skillsDir` 仅执行**单层** `readdir` + `lstat` + `readLinkTarget`（**严禁递归遍历合法链接内部文件，确保 30 个目录耗时 < 20ms**）；
  - 将客户端内每个条目精准分类为 6 种类型：
    1. `managed-link`：软链接/Junction，目标位于 `paths.skillsRoot` 内且已登记于 `links.json`（直接放行，0 内容 I/O）；
    2. `unmanaged-real-dir`：普通真实目录，不在 `links.json` 中；
    3. `replaced-link-real-dir`：`links.json` 登记为受管链接，但磁盘上已变成普通真实目录（解决真实本机 18 处 `not-link-conflict` 地雷！）；
    4. `external-symlink`：软链接/Junction，但指向 `paths.skillsRoot` 之外（如 `ego-browser`）；
    5. `dangling-link`：`links.json` 登记条目但磁盘路径不存在或链接失效；
    6. `non-skill-entry`：普通文件或系统保留目录（如 `.system`、`builtin_skills` 或 `isIgnoredSkillEntry` 命中项）。
- **L2 按需深扫 (`inspectDriftL2(l1Report, paths, options?)`)**：
  - **仅对** L1 筛出的 `unmanaged-real-dir`、`replaced-link-real-dir`（以及当 `includeExternalLinks: true` 时的 `external-symlink`）执行深度读取；
  - 检查 `readSkillMeta(entryPath)`：若缺少合法 `name`/`description`，标记为 `incomplete-or-non-skill`（防止抓取 IDE 正在写入中的半成品或非 skill 文件夹！）；
  - 计算确定性内容哈希 `hashSkillFolder(entryPath)`、有效文件数 `fileCount`、总字节数 `totalBytes`，以及**目录内所有非忽略文件的最大 `mtimeMs`（`maxMtimeMs`）**（严禁仅读父目录 `mtime`！）；
  - 对照 `index.json` 与本次跨客户端同批扫描结果，将每个有效发现归类为：
    - `identical-to-store`（内容与总馆完全一致，只需安全替换为软链接）；
    - `new-skill`（总馆不存在同名，且各客户端副本内容一致，直接入库并换软链接）；
    - `name-conflict`（同名但出现 2 个及以上不同内容哈希——含“与总馆冲突”或“多个客户端之间互冲突”），自动按 `maxMtimeMs` 降序排列变体，并计算 **`shorterContentWarning: boolean`**（当 `maxMtimeMs` 最新变体有效字节数 < 其他变体的 65% 或时间差 < 10 秒时置 `true`，防范 Windows 复制导致 `mtime` 欺骗）。
- **验收标准**：
  - 单测覆盖全部 6 种 L1 分类、`maxMtimeMs` 深层子文件感知、`incomplete` 半成品过滤、`shorterContentWarning` 启发式警告、以及 30 个含受管链接客户端下的 L1 性能断言（零递归读内容）。

#### T2.2 `[core]` 冲突池数据结构与 Reconcile 精准接管收敛内核

- **目标**：构建零丢失冲突池存储层（`packages/core/src/conflicts.ts`）与完整的「备份校验 → 精准移出 → 入真源/冲突池 → 原地挂纯软链接」事务引擎（`packages/core/src/reconcile.ts`）。
- **冲突池持久化契约**（`packages/core/src/conflicts.ts`）：
  - 存储位置：`<stateRoot>/conflicts/conflicts.json`（`CONFLICTS_FILE_VERSION = 1`，经 `migrateVersionedData` 读取）与 `<stateRoot>/conflicts/<skillName>/<variantId>/`（`variantId` = 哈希前 12 位）；
  - 数据结构：
    ```ts
    export interface ConflictVariant {
      variantId: string;           // hash.slice(0, 12)
      hash: string;
      sourceClients: string[];     // 如 ["codex", "claude"] 或 ["store"]
      maxMtimeMs: number;
      fileCount: number;
      totalBytes: number;
      detectedAt: string;
    }
    export interface ConflictRecord {
      skillName: string;
      activeHash: string;          // 当前位于 skillsRoot/<skillName> 的暂定真源哈希
      variants: ConflictVariant[]; // 不含或显式标注 active，完整留存所有异版副本
      shorterContentWarning: boolean;
      createdAt: string;
      updatedAt: string;
    }
    ```
  - 幂等性：重复检测到同一哈希变体时仅合并 `sourceClients` 并更新 `maxMtimeMs`，不重复生成副本。
- **Reconcile 规划与执行引擎**（`packages/core/src/reconcile.ts`）：
  - `planReconcile(home, paths, options?)`：纯只读，返回精确预览计划（`backupRequired: true`、`toAdopt`、`toRelinkIdentical`、`conflicts` 含暂定赢家、`skippedExternalLinks`、`untouchedNonSkill`、`danglingToPrune`）。
  - `executeReconcile(home, paths, options?)`（严格事务顺序）：
    1. **前置强制备份与校验**：调用 `createBackupSnapshot(paths, home)` 并调用 `verifyBackupSnapshot` 校验通过；若校验失败**立即中止，零改动任何客户端目录**；
    2. **先落盘总馆（零丢失）**：
       - `new-skill`：复制到 `skillsRoot/<name>/` 并登记 `index.json`；
       - `name-conflict`：若现有总馆已有版本，先将其留底至 `conflicts/<name>/<oldHash12>/`（及 `archive/versions/`）；把全部冲突变体复制进 `conflicts/<name>/<variantId>/`；将 `maxMtimeMs` 最新的暂定赢家写入 `skillsRoot/<name>/` 并同步更新 `index.json` / `groups.json` / `stats.json` / `links.json`；更新 `conflicts.json`；
    3. **精准移出客户端真目录 + 原地挂回纯软链接（按客户端分批原子切换）**：
       - 对每个需要替换的客户端目录内的**单个有效 skill 真实目录**（绝不触碰 `non-skill-entry` 与未勾选的 `external-symlink`）：
         - 先用 `moveDirSafe` 将真实目录移入 `<stateRoot>/tmp/reconcile-aside-<runId>/<clientId>/<name>/`；
         - 紧接着调用 `applyLinkSet`（或逐客户端一次集合切换）在原落点创建指向 `skillsRoot/<name>/` 的 Junction/symlink 并更新 `links.json`；
         - 若遇到 Windows 文件锁（`EBUSY`/`EPERM`）或建链失败：**按 journal 逆序恢复已移出的真实目录回原客户端位置**，并把该条失败结构化汇报；
       - 客户端链接切换成功后，把 `tmp/reconcile-aside-<runId>` 的原目录归档到 `archive/reconcile/<runId>/`。原因是 blob 备份和内容哈希会跳过 `.git` 等条目，保留完整原目录才能覆盖这些内容。
    4. 可选附带清理 `danglingLinks` 台账记录。
- **验收标准**：
  - 单测在沙箱构造混合场景（已有受管链接 + 新增野生目录 + 被覆盖的 `replaced-link-real-dir` + 2 个客户端同名不同版本 + `.system` 非 skill 目录 + `ego-browser` 外部软链接），验证执行后：① 客户端中所有有效 skill 100% 变为指向 `skillsRoot` 的 Junction；② `.system` 与 `ego-browser` 毫发无损；③ 冲突池留存全部异版、`maxMtime` 最新者成为真源；④ 注入失败时原目录无损回滚。

#### T2.3 `[cli]` `reconcile` 命令、`bootstrap` 接管闭环与 `/api/reconcile/*` HTTP 端点

- **目标**：通过 CLI 与 HTTP 暴露 Reconcile 能力，并升级 `bootstrap` 使其首次初始化即直接落地纯软链接终态。
- **交付项**：
  1. `packages/cli/src/reconcile-cmds.ts` + `index.ts`：
     - `skills-hub reconcile [--dry-run] [--include-external-links] [--yes] [--json]`；
     - 严格遵守 `requireWriteAuth`（非交互无 `--yes` 退出码 2）。
  2. `packages/cli/src/bootstrap.ts` 升级：
     - 交互确认库存路径（展示固定 `~/.skills-hub/` + 默认真源 `~/.skills-hub/skills/`）→ 展示扫描预览（发现多少新 skill、多少同名冲突、将全部备份并转为纯软链接）→ 用户明确确认 `Y` 后调用 `executeReconcile`（内置强制备份校验 + 接管换链）→ 启用 `self-skill` → 启动面板；
     - 彻底消灭旧版 `bootstrap` 后留下一堆真目录导致 `unregistered-conflict` 的体验断点。
  3. `packages/cli/src/ui-reconcile.ts` + `ui-server.ts` + `exports.ts`：
     - `GET /api/reconcile/scan`（返回 L1 + L2 扫描摘要，支持启动自动检查与手动重扫）；
     - `POST /api/reconcile/preview`（返回详细接管计划）；
     - `POST /api/reconcile/apply`（执行接管，返回新建链接数、入库数、冲突数、跳过项、备份快照 ID）；
     - `exports.ts` 导出 `performReconcileScanL1` 供 `apps/desktop` 托盘启动巡检复用。
- **验收标准**：
  - `http-api.test.ts` 与 `reconcile-cmds.test.ts` 覆盖沙箱完整 CLI + HTTP 契约（含 `--dry-run`、缺 `--yes` 拒绝、`POST /api/reconcile/apply` 幂等重跑第 2 次返回 0 待处理项）。

#### T2.4 `[web]` 全局「重新扫描 / 发现野生与冲突 skills」提醒横幅与一键合并接管弹窗

- **目标**：让用户一打开 WebUI 或桌面端就能第一时间感知客户端野生真目录与版本冲突，并一键触发安全备份与合并接管。
- **Playbook 组件直引契约（禁止重写重复 UI）**：
  - 直接复用 `/playbook` 已预制的 `ReconcileBanner`、`RescanTriggerButton`（`apps/web/src/features/reconcile/ReconcileBanner.tsx`）、`ReconcileDialog`（`apps/web/src/features/reconcile/ReconcileDialog.tsx`）与 `types.ts`；本任务仅补齐 `features/reconcile/api.ts` 并接入 `App.tsx` / `OverviewPage.tsx` / `Sidebar.tsx`。
  - **冒烟性能红线**：仅在应用挂载就绪时异步触发 1 次 `GET /api/reconcile/scan` + 用户手动点击重扫，**严禁设置定时器轮询**（否则触发 `smoke-panel.mjs` 的 10s 静置 CPU / fetch 门禁失败）。
- **交互规格**（新目录 `apps/web/src/features/reconcile/`）：
  1. **启动自动巡检 + 手动重扫按钮**：
     - `App.tsx` 在库存就绪后异步触发一次轻量 `GET /api/reconcile/scan`（不阻塞首屏渲染）；
     - `OverviewPage.tsx` 与 `Sidebar.tsx` 底部/顶栏提供「重新扫描」操作按钮，随时手动重扫；
  2. **非阻塞提醒横幅（`ReconcileBanner.tsx`）**：
     - 当检测到 `unmanagedRealDirs > 0` 或 `replacedLinks > 0` 或 `newConflicts > 0` 时，在主区顶部以克制灰阶/琥珀提示条显示：「检测到 X 个本地新增/未接管 skill（其中 Y 个存在同名版本冲突），建议备份并合并入唯一真源」+「查看并合并」主按钮 +「稍后」收起按钮；
  3. **接管预览与确认弹窗（`ReconcileDialog.tsx`）**：
     - 打开时请求 `POST /api/reconcile/preview`，分组清晰展示：
       - 将自动备份快照至 `~/.skills-hub/backups/`；
       - 将新收录并转为纯软链接的列表；
       - 将进入「冲突处理中心」的同名冲突列表（标注暂定主版来源与 `shorterContentWarning`）；
       - 默认跳过的外部软链接（提供可选 Checkbox 决定是否纳入）与保留不动的非 skill 文件；
     - 点击「备份并一键合并」调用 `POST /api/reconcile/apply`，完成后刷新 `useCatalog()`，若产生冲突则弹出快捷入口直达「Skills 管理 → 冲突」标签页。
- **验收标准**：
  - Vitest 组件单测 + `pnpm smoke` 通过；沙箱端测验证“往沙箱 `.codex/skills/` 放入一个新真目录 → 点重新扫描 → 横幅出现 → 确认合并 → 原目录变为 Junction 且横幅消失”。

---

### 3.3 Epic 3：同名多版本冲突解决中心 + Agent 智能合并（Block A + B）

#### T3.1 `[core]` 冲突变体逐文件 Diff 引擎与安全决议落盘内核

- **目标**：提供零依赖纯 TypeScript 的多变体差异计算引擎（`packages/core/src/conflict-diff.ts`）与三种无损冲突决议落盘引擎（`packages/core/src/conflict-resolve.ts`）。
- **逐文件 Diff 引擎 (`diffConflictVariants`)**：
  - 输入 `paths`、`skillName`、`variantA`（支持 `"active"` 表示当前唯一真源或具体 `variantId`）、`variantB`；
  - 遍历双方 `listSkillFiles` 产出：
    - `files[]`: `{ relPath, status: "added"|"removed"|"modified"|"unchanged", isBinary, sizeA, sizeB, hunks?: UnifiedDiffHunk[] }`；
    - 文本文件使用纯 TS Myers/LCS 行级 diff 算法输出紧凑上下文 unified hunks（无外部重依赖，超长文件安全截断并标注 `truncated: true`）；
    - `readConflictVariantFile(paths, skillName, variantId, relPath)`：复用同款路径穿越防线（越界返回 `outside`，二进制返回 `binary`，超限返回 `too-large`）。
- **冲突决议落盘内核 (`resolveConflict`)**：
  - 支持三种 `mode`：
    1. **`pick`**：指定 `winnerVariantId`（`"active"` 或某个冲突 `variantId`）。若选定非 `"active"`，先将当前 `skillsRoot/<name>` 整体快照保存至 `archive/versions/<name>-<ISO>/`，再用所选变体原子替换 `skillsRoot/<name>`；将所有落选变体各自打包 zip 归档至 `<stateRoot>/archive/conflicts/<name>-<variantId>-<ISO>.zip`；重算哈希并原子同步 `index.json` / `groups.json` / `stats.json` / `links.json`；从 `conflicts.json` 移除该条目并清理其临时变体目录；
    2. **`merge`**：接收 `mergedFiles: Record<string, string>`（及可选 `deletePaths?: string[]`，全部做相对路径防穿越校验），先快照当前真源至 `archive/versions/`，按合并内容原子写回 `skillsRoot/<name>`，归档所有原冲突变体至 `archive/conflicts/`，重算哈希并同步四份元数据，清出冲突池；
    3. **`split`**：将指定 `variantId` 以 `newName`（校验合法英文名且不重名）写入 `skillsRoot/<newName>/` 并注册为独立 `SkillRecord`，仅从原冲突记录中移除该变体（若原冲突不再剩其余异版则自动结案）。
  - **铁律**：全流程零真删除，任何被覆盖版本在 `archive/versions/` 或 `archive/conflicts/` 均可追溯恢复。
- **验收标准**：
  - 单测完整覆盖 `diffConflictVariants`（增/删/改/二进制/路径穿越拦截）与 `pick` / `merge` / `split` 三种模式（验证哈希同步更新、旧版归档 zip 存在且可解压、软链接零破坏且直接读到合并后的新内容）。

#### T3.2 `[cli]` `conflicts` CLI 命令、`/api/conflicts/*` 端点与 4 个 Agent 一等合并工具

- **目标**：将冲突查询、Diff 与解决能力完整暴露给 CLI、本地 HTTP API 与面板内置 Agent。
- **交付项**：
  1. **CLI**（`packages/cli/src/conflict-cmds.ts` + `index.ts`）：
     - `skills-hub conflicts list [--json]`
     - `skills-hub conflicts diff <name> [--a active|<id>] [--b <id>] [--json]`
     - `skills-hub conflicts resolve <name> --mode pick|split [--winner <id>] [--new-name <name>] [--yes] [--json]`
  2. **HTTP API**（`packages/cli/src/ui-conflicts.ts` + `ui-server.ts`）：
     - `GET /api/conflicts`
     - `GET /api/conflicts/:name/diff?a=&b=`
     - `GET /api/conflicts/:name/file?variant=&path=`
     - `POST /api/conflicts/:name/resolve`
  3. **Agent 一等工具集**（`packages/cli/src/agent/tools.ts` & `prompt.ts`）：
     - 读工具（永不审批）：
       - `list_conflicts`
       - `diff_conflict_variants`（`{ skillName, variantA?, variantB }`）
       - `read_conflict_file`（`{ skillName, variantId, path }`）
     - 写工具（加入 `WRITE_TOOL_NAMES`，在 `writePolicy: "ask"` 下强制暂停等待用户在前端点「Approve」才落盘！）：
       - `apply_conflict_resolution`（`{ skillName, mode: "pick"|"merge"|"split", winnerVariantId?, mergedFiles?, deletePaths?, newName?, summary }`）
     - 更新 `packages/cli/src/agent/prompt.ts` 系统提示词：指导 Agent 在处理同名冲突时先调 `diff_conflict_variants` 与 `read_conflict_file` 读清上下文，区分「超集直接选取」与「双向分叉融合合并」，说明理由后发起 `apply_conflict_resolution` 由用户审批落盘。
- **验收标准**：
  - CLI 契约测试 + `http-api.test.ts` + `agent.test.ts`（用替身模型测试 Agent 顺序调用 `list_conflicts` → `diff_conflict_variants` → `apply_conflict_resolution` 且在 `ask` 模式下被审批门禁正确拦截）。

#### T3.3 `[web]` WebUI & 桌面 GUI 共享「冲突处理」板块与一键 Agent 分析合并联动

- **目标**：在 WebUI（桌面 Electron GUI 自动共享）落地完整的「冲突处理」工作区，并与内置 Agent 无缝打通。
- **Playbook 组件直引契约（禁止重写重复 UI）**：
  - 直接复用 `/playbook` 已预制的 `ConflictsView`（`apps/web/src/features/conflicts/ConflictsView.tsx`）、`ConflictDiffViewer`（`ConflictDiffViewer.tsx`）、`buildConflictAgentPrompt`（`types.ts`）与带徽章的 `SegmentedTabs`；本任务仅补齐 `features/conflicts/api.ts` 并接入 `SkillsPage.tsx`、`OverviewPage.tsx` 与 `AgentPage.tsx`。
- **交互规格**（新目录 `apps/web/src/features/conflicts/`）：
  1. **入口与导航**（遵守 `app-shell-v2.md` 四板块骨架）：
     - 在 `SkillsPage.tsx` 扩展第三 Tab：**「应用」/「内容」/「冲突」**（`SkillsTab = "apps" | "content" | "conflicts"`），有未决冲突时 Tab 旁及左侧「Skills 管理」导航带克制计数徽章；
     - `OverviewPage.tsx` 的「需要处理」区块展示未决冲突入口，点击直跳 `Skills 管理 → 冲突`。
  2. **冲突工作区（`ConflictsView.tsx` + `ConflictDiffViewer.tsx`）**：
     - 左侧列：未决冲突 skill 列表（显示变体数、`shorterContentWarning` 黄色预警标记、涉及客户端芯片如 `codex` / `claude`）；
     - 右侧主区：顶部展示所有变体卡片（来源客户端、格式化 `maxMtime`、文件数/体积、标记当前活跃真源）；下方展示文件变更列表与行级 Unified Diff 视图（浅绿/浅红语义高亮，受 `ui-design-v1.md` 例外色约束）；
     - 顶部操作条提供 4 个清晰动作：
       1. **保留当前真源**（归档其余变体，经 `ConfirmDialog`）；
       2. **切换此变体为真源**（一键扶正，旧真源留快照）；
       3. **拆分为独立 Skill**（弹窗输入新英文名）；
       4. **交给 Agent 分析并合并**（通过 `ShellNav` 携带上下文跳至 **Agent** 页，自动预填聚焦该冲突 skill 的分析合并提示词，由 Agent 调 diff 工具给出融合草案并发起可点击审批的 `apply_conflict_resolution` 卡片）。
- **验收标准**：
  - 前端组件与路由单测 + `pnpm smoke` 通过；沙箱端测验证冲突 Tab 渲染 Diff、执行「扶正/拆分/留用」后冲突计数归零且无刷新错乱。

---

### 3.4 Epic 4：开机自启托盘巡检与强引导 `self-skill`（Block A + B）

#### T4.1 `[cli]` 升级 `self-skill/SKILL.md` 强触发指南与全客户端同步自检

- **目标**：彻底修复当前 [SKILL.md](../../../packages/cli/self-skill/SKILL.md) 漏触发与反向指引问题，让 Codex / Claude / Cursor / Antigravity 在一切 skill 增删改查前高概率先读本指南并定位到唯一真源。
- **交付项**：
  1. **重写 `packages/cli/self-skill/SKILL.md`**：
     - `description` 覆盖全量中英文高召回动作词：`新建/创建(create/new)`、`修改/编辑/更新/回写经验(edit/update/modify/refactor)`、`收录(adopt)`、`启用/停用(enable/disable)`、`软删除/归档(archive)`、`冲突合并(conflicts)`、`对账收敛(reconcile)`、`Git 提交与云端备份(git)`；
     - 删除原第 21 行反向条款，改为明确铁律：**“任何对 Skill 的新建、修改、回写经验或删除，必须先读取本 skill：确认唯一真源真实路径（`skills-hub show` 或 `~/.skills-hub/config.json`），禁止直接在 `.codex/skills` 等客户端目录私建真文件夹；改完内容后按需执行 `skills-hub verify --accept` 或 `skills-hub git commit`”**；
     - 同步补齐 v0.3 新增命令的简明用法示例。
  2. **存量自检同步（`syncSelfSkill(home, paths, selfSkillDir?)`）**：
     - 在 `bootstrap` 与 `ui-server` 启动后（或在 `reconcile` 中）检查总馆里的 `skills-hub` 自身 skill 是否落后于随包分发的最新版：若内容有更新则自动无损更新真源（旧版照常留快照到 `archive/versions/`），并确保新发现的客户端（如新支持的 Antigravity）可选挂上链接（不静默覆盖用户主动 `disable` 过的客户端）。
- **验收标准**：
  - 单测验证 `self-skill/SKILL.md` 通过 `parseSkillMeta` 解析、包含所有核心触发词、无旧反向语句；`syncSelfSkill` 在沙箱下幂等升级成功。

#### T4.2 `[desktop]` Electron 开机自启、系统托盘静默驻留与启动 L1 巡检通知

- **目标**：在 `apps/desktop` 落地开机自启、系统托盘静默运行与启动极速 L1 巡检提醒（严格遵守 `desktop → cli → core` 分层，不把扫描代码写进 Electron）。
- **交付项**：
  1. **系统托盘模块**（新文件 `apps/desktop/src/tray.ts`）：
     - 创建系统托盘图标与右键菜单：「打开 Skills Hub」「立即重新扫描」「开机自启（勾选联动）」「退出」；
     - 支持 `--hidden` 启动参数：开机自启以 `--hidden` 拉起时先不弹出主窗口，仅驻留托盘；当用户启用托盘模式时点击窗口关闭按钮最小化到托盘（菜单点「退出」才真正释放内置服务并退出进程）。
  2. **开机自启联动**（`apps/desktop/src/main.ts` & `packages/cli` `/api/settings`）：
     - 监听配置 `autoLaunch` 变更，调用 Electron `app.setLoginItemSettings({ openAtLogin, args: ["--hidden"] })`；
     - 浏览器单独跑 `skills-hub ui` 时，`GET /api/settings` 返回 `isDesktop: false`，WebUI 优雅置灰提示「开机自启与托盘仅在桌面客户端中可用」。
  3. **启动 L1 极速巡检与原生通知**：
     - 桌面主进程就绪后调用 `packages/cli` 导出的 `performReconcileScanL1(home, paths)`（<20ms）；
     - 若检出野生真目录或被覆盖链接：更新托盘 tooltip/角标，调用 Electron `Notification` 弹出系统通知「检测到 N 个新本地 Skill / 冲突，点击查看并合并」，点击通知自动唤起并聚焦主窗口进入合并弹窗；若 0 异常且处于 `--hidden` 模式则全程静默零打扰。
- **验收标准**：
  - `apps/desktop/test/` 新增托盘/启动巡检决策纯逻辑单测（mock Electron API），`pnpm --filter @skills-hub/desktop typecheck` / `build` / `test` 全绿，且 `pnpm build:desktop` 成功打出无报错免签名目录包。

---

### 3.5 Epic 5：可选 Git 版本控制与 GitHub CLI 云端备份（Block A + B + C）

#### T5.1 `[cli]` Git 进程封装、环境检测、安全 `.gitignore` 与确定性自动 Commit 引擎

- **目标**：在 `packages/cli/src/git/` 建立纯净、安全、零 shell 注入风险的 Git 基础设施层（严禁进入 `packages/core`）。
- **模块划分**：
  1. `packages/cli/src/git/git-runner.ts`：
     - 基于 `node:child_process` `execFile`（`shell: false`，彻底杜绝命令注入）封装 `runGit(cwd, args)` 与 `runGh(cwd, args)`，带超时保护与 `scrub()` 错误脱敏；
     - `detectGitEnvironment()`：探测 `git` 版本、`gh` 版本、`gh auth status`（解析当前登录用户名），缺任一工具时返回结构化安装引导（Windows `winget` 命令 + 官方下载链接），绝不抛未捕获异常。
  2. `packages/cli/src/git/git-repo.ts`：
     - `initSkillsGitRepo(skillsRoot)`：仅在 `skillsRoot` 内执行 `git init -b main`（或保留已有仓库），原子写入/补齐严格 `.gitignore`（忽略 `.env`、`.env.*`、`node_modules/`、`.venv/`、`__pycache__/`、`.DS_Store`、`Thumbs.db`、`*.tmp`、`.skills-hub-tmp-*`），若尚未有提交则创建初始基线提交 `chore(skills): initialize single-source repository`；
     - `autoCommitSkillChange(paths, summary, config)`：当 `config.git?.enabled === true` 且本机有 `git` 时，对 `skillsRoot` 执行 `git add -A` → 若 `git status --porcelain` 非空则执行 `git commit -m <summary>`（未配置 git user.name/email 时仅在当前仓库 local config 补写默认 `Skills Hub <skills-hub@local>`，绝不改用户全局 `~/.gitconfig`！）；当 Git 关闭或未安装时静默返回 `{ skipped: true }` 实现平滑降级；
     - `getGitStatus(skillsRoot)`、`getGitLog(skillsRoot, skillName?, limit?)`、`getGitDiff(skillsRoot, refA?, refB?)`。
  3. `packages/cli/src/git/secret-scan.ts`：
     - 轻量确定性正则密钥预检器 `scanSecretsInDir(skillsRoot)`：扫描常见高风险凭据模式（GitHub `ghp_`/`gho_`/`github_pat_`、OpenAI `sk-`、AWS `AKIA`、私钥块 `-----BEGIN .* PRIVATE KEY-----`、常见 `API_KEY=` 硬编码），返回命中文件与行号（仅返回脱敏前缀，绝不回传完整密钥！），用于创建/推送 **Public 公开仓库**前强制告警拦截。
- **验收标准**：
  - `packages/cli/test/git.test.ts` 在临时目录真实跑通 `initSkillsGitRepo` → 修改文件 → `autoCommitSkillChange` → `getGitLog`/`getGitDiff`；验证关闭开关时优雅跳过；验证 `scanSecretsInDir` 精准拦住模拟密钥且返回脱敏结果。

#### T5.2 `[cli]` 挂载全链路自动 Commit、`gh` 设备码登录引导、一键建仓云端备份与 Agent Git 工具

- **目标**：把自动 Commit 接入所有真源写操作、落地免 Token 落盘的 `gh` 设备码 Web 登录与云端备份，并为 Agent 增加 Git 工具。
- **交付项**：
  1. **全链路确定性自动 Commit 挂载**：
     - 在 `saveSkillFile` 写端点/命令、`performAdopt`、`archiveSkill`、`restoreArchivedSkill`、`commitDraft`、`executeReconcile`、`resolveConflict` 成功完成后，若开启 Git 开关则异步/安全调用 `autoCommitSkillChange`（提交失败仅记结构化 warning，绝不回滚已成功落盘的业务数据）；
  2. **`gh` 设备码 Web 登录引导**（`packages/cli/src/git/gh-cloud.ts`）：
     - `startGhDeviceLogin()`：以子进程启动 `gh auth login --hostname github.com --git-protocol https --web`（关闭自动开终端交互），从 stdout/stderr 解析 8 位一次性设备码（`XXXX-XXXX`）与验证 URL（`https://github.com/login/device`），按 `sessionId` 暂存内存会话（设置 10 分钟超时自动清理子进程，防止孤儿进程）；
     - `pollGhDeviceLogin(sessionId)`：检查会话状态及 `gh auth status`，登录完成后返回 `{ status: "authenticated", username }`；
     - **凭据红线**：Skills Hub 全程不读取、不存储任何明文 GitHub Token。
  3. **一键建仓与安全云端推送**（`packages/cli/src/git/gh-cloud.ts`）：
     - `setupCloudBackupRepo(skillsRoot, { repoName, visibility, confirmPublicSecrets? })`：
       - 若 `visibility === "public"`，强制执行 `scanSecretsInDir(skillsRoot)`；命中风险且未显式二次确认时返回 `409 secret-detected` 及脱敏命中清单；
       - 调用 `gh repo create <repoName> --private|--public --source <skillsRoot> --remote origin --push`（已存在 `origin` 时优雅处理不重复覆盖）；
     - `pushCloudBackup(skillsRoot)`：执行 `git push -u origin HEAD`（**严禁 `--force`**；若远端存在本地未拉取提交返回 `409 remote-diverged` 并提示拉取合并）。
  4. **CLI 命令 + HTTP 端点 + Agent Git 工具**：
     - CLI：`skills-hub git status|enable|disable|log|commit|cloud init|cloud push`；
     - HTTP：`/api/git/status`、`/api/git/toggle`、`/api/git/log`、`/api/git/gh/login/start`、`/api/git/gh/login/status`、`/api/git/cloud/setup`、`/api/git/cloud/push`；
     - Agent 工具（`packages/cli/src/agent/tools.ts`）：只读 `git_status` / `git_log` / `git_diff`，受审批写工具 `git_commit`（用于外部/面板 Agent 完成复杂改动或冲突合并后写入语义提交信息）。
- **验收标准**：
  - 单测与 HTTP 契约测试完整覆盖 `gh` 子进程 mock（含设备码解析、登录轮询超时清理、公开仓库命中密钥 `409 secret-detected`、远端分叉 `409 remote-diverged`）与 Agent Git 工具调用。

#### T5.3 `[web]` Git 版本控制设置、提交历史查看、`gh` 设备码登录向导与一键云端备份 UI

- **目标**：在 WebUI & 桌面 GUI 中交付完整、零黑框门槛的 Git 版本控制与 GitHub 云端备份交互体验（新目录 `apps/web/src/features/git/`）。
- **Playbook 组件直引契约（禁止重写重复 UI）**：
  - 直接复用 `/playbook` 已预制的 `GitSettingsSection`、`GhLoginDialog`、`CloudBackupDialog`、`SkillHistoryDrawer`（均位于 `apps/web/src/features/git/`）；本任务仅补齐 `features/git/api.ts` 并接入 `SettingsDialog.tsx`、`StoreOnboarding.tsx` 与 `SkillViewer.tsx`。
  - **冒烟性能红线（关键）**：`smoke-panel.mjs` 断言点开 skill 卡片后 4 秒内 `fetch <= 2`（`/tree` + `/file`），因此 `SkillHistoryDrawer` **必须在用户显式点击「历史记录」按钮打开抽屉时才懒请求 `GET /api/git/log`**，严禁在选中 skill 时预加载！
- **交互规格**：
  1. **安装引导 & 设置页 Git 板块（`GitSettingsSection.tsx`）**：
     - 在 `StoreOnboarding.tsx`（可选步骤）和 `SettingsDialog.tsx` 实时显示本机 `Git` 与 `GitHub CLI (gh)` 检测状态；未安装时提供清晰安装链接与一键复制 `winget` 命令，且明确标注「可跳过，随时在设置开启」；
     - 提供总开关「使用 Git 管理 Skills 版本」（切换调用 `POST /api/git/toggle`，未装 Git 时置灰并提示安装）。
  2. **`gh` 设备码登录向导弹窗（`GhLoginDialog.tsx`）**：
     - 点击「登录 GitHub (gh)」调用 `POST /api/git/gh/login/start`，大号等宽字体展示 8 位设备码 `XXXX-XXXX`，提供「复制验证码并打开 GitHub 验证页」按钮，前端轮询 `GET /api/git/gh/login/status` 显示登录中动画，授权成功自动关闭并展示已登录用户名。
  3. **一键创建仓库与云端备份弹窗（`CloudBackupDialog.tsx`）**：
     - 输入仓库名（默认建议 `my-skills-hub-backup`）、单选 **私有仓库（Private，默认推荐）** / **公开仓库（Public）**；
     - 选 Public 时展示醒目风险提示，若后端返回 `secret-detected` 则列出脱敏风险文件与行号；
     - 建仓成功后在设置卡片展示远端仓库链接、待推送提交数与「立即推送备份」按钮（遇 `remote-diverged` 展示清晰拉取提示）。
  4. **单 Skill 提交历史抽屉（`SkillHistoryDrawer.tsx`）**：
     - 在 `SkillViewer.tsx` 头部，当 Git 开关已开启时显示「历史记录」按钮，展开查看该 skill 历次 Git commit（时间、提交摘要、变更摘要）。
- **验收标准**：
  - 前端单测覆盖各状态（未装 Git、未登录 `gh`、设备码轮询成功、公开仓库密钥预警、`remote-diverged` 提示）+ `pnpm smoke` 通过。

---

## 4. 非功能约束、安全红线与可维护性要求

1. **沙箱铁律（最高红线）**：所有自动化测试与 AI 自治端测**严禁**写入真实 `~/.claude`、`~/.codex`、`~/.agents`、`~/.gemini`、`~/.skills-hub` 或 `D:\projects\My-Skills\Hubs`，所有写测试必须使用 `--home <repo>/.sandbox/<runId>` 或 `os.tmpdir()` 隔离目录。
2. **代码可维护性**：
   - 每个 Sub-Issue 只动自己归属的单一模块/垂直切面，单文件尽量保持内聚清晰（遵循 [code-size-and-organization.md](../../conventions/code-size-and-organization.md)），严禁把新业务逻辑塞进已有大文件（如把 Git 或 Reconcile 塞进 `ui-server.ts` 或 `store.ts`）；
   - TypeScript strict 全开，零 `any`；新公共导出全部写入 `packages/core/src/index.ts` 或 `packages/cli/src/exports.ts` 并附带 JSDoc。
3. **质量门禁（每个 Sub-Issue PR 必过）**：
   - `pnpm lint` = 0、`pnpm typecheck` = 0、`pnpm build` = 0、`pnpm test` = 0；
   - 涉及 `apps/web` 或 `ui-server` 时必跑 `pnpm smoke`；涉及 `apps/desktop` 时必跑 `pnpm --filter @skills-hub/desktop build` 与 `test`。
4. **文档同步与 Sub-Issue 交付纪律**：
   - 每个任务落地后，将本文与 `cli-commands-v0.md` / `http-api-v0.md` / `agent-v0.md` 中对应条目的 `[v0.3 规划中]` 标记移除并同步真实字段差异；
   - PR 必须用 **`Refs #<subIssue>`**（严禁 `Closes #N` 自动关单），并在 Sub-Issue 下追加包含「执行报告 + 变更汇总 + 开发者深度手动端测指南 + 规范文档 diff 链接」的完整评论；**由用户端测确认后自行关闭 Sub-Issue**。
