# 单一真源接管、冲突合并与 Git 版本控制架构分析（上下文与决策稿）

> 状态：已定案，已转为正式 PRD 与任务单（见 [PRD.md](../../specs/single-source-sync-and-versioning/PRD.md) 与 [task.md](../../specs/single-source-sync-and-versioning/task.md)）
> 创建：2026-11-20；更新：2026-11-20
> Source: [架构初始规范](../../designs/architecture-initial-spec.md) §1/§3/§4 · [库存位置与目录布局](../../specs/store-and-paths-v0.md) §1/§2/§4/§5 · [用户新建 skill 路径分析](../skill-creation-path/creation-path-analysis.md) · [桌面端外壳设计](../../designs/desktop-shell-v0.md)
> 定位：集中沉淀当前围绕「纯软链接唯一真源接管、同名多版本冲突池与 Agent 合并、开机/手动极速巡检与 self-skill 引导、可选 Git 与 GitHub CLI 云端备份、状态与资产目录分离」的全部讨论上下文、现状对照、工程边界与待拍板决策。

---

## 0. 背景与问题触发点

### 0.1 真机长期未同步实测现场

在真实 Windows 本机（库存位于 `D:\projects\My-Skills\Hubs`，指针在 `~/.skills-hub/config.json`，上次写入停在 `2026-08-19`，共有 157 个活跃 skill、1 份停在 `2026-08-17` 的基线备份）做只读核查后，暴露出停用约 3 个月后多 Agent 平行演化带来的 **4 类真实打架现场**：

1. **库存原件漂移（4 个）**：`verify` 检出 `vps-init`、`docx`、`pptx`、`xlsx` 内容已与 `index.json` 记录哈希不一致（外部直接或经链接改写所致）。
2. **受管链接被普通目录覆盖（18 处 / 6 个 skill）**：在 `codex`、`agents`、`claude` 3 个客户端里，完全相同的 6 个 skill——`creating-formal-reports-from-software-products`、`hyperframes`、`hyperframes-cli`、`hyperframes-registry`、`media-use`、`remotion-to-hyperframes`——其受管链接已被替换为普通真目录，`links.json` 台账仍以为它们是受管链接；此时在面板中操作会直接触发 `not-link-conflict` 保护中止。
3. **台账悬空死链接（360 条）**：`.trae`（113 条）与 `.trae-cn`（91 条）已在硬盘消失，`.cursor`（135 条）被清空重装，`.codex` / `.agents` / `.claude` 各少 7 条，而台账未随现实清理。
4. **未纳管新增目录与外部软链接（74 + 19）**：新增 74 个野生真目录（如 `bilibili-video-production`、`gb-standard-docx-pdf`、`code-video-craft`、`threejs-animation`、`xhs-automation`、`web-film-studio`，及 Antigravity `~/.gemini/config/skills` 下新增的 6 个等），另有 19 条指向 `Hubs` 之外的外部软链接（如 `ego-browser`）。

### 0.2 v0.2.0 架构核心自相矛盾点

当前 `v0.2.0` 的 `bootstrap` / `adopt`（见 [bootstrap.ts](../../../packages/cli/src/bootstrap.ts) 与 [store.ts](../../../packages/core/src/store.ts)）采取「只复制到总馆、不搬走客户端原目录、也不原地替换为软链接」的半接管策略。这导致一个结构性死结：

- 初始化结束的瞬间，硬盘上即出现**总馆一份 + 客户端一份**的双重平行副本；
- 随后在面板点击 `enable` 试图挂回软链接统一管理时，[link-switch.ts](../../../packages/core/src/link-switch.ts) 又因为「落点已有未登记真目录」命中 `unregistered-conflict` 而拒绝切换；
- 客户端真目录不移走、不清净成纯软链接，软删除（`archive`）、版本回滚与跨 Agent 实时同步就永远受制于客户端残留真目录。

---

## 1. 当前实现（v0.2.0）机制边界与短板基线

### 1.1 现有机制与安全保护边界

| 模块 | 当前行为 | 既有安全边界 |
|---|---|---|
| 收录与初始化 | 复制进总馆 `skills/<name>/`，按内容 SHA-256 去重；原客户端目录一字节不动 | 同内容幂等合并来源；同名不同内容报 `conflict` 绝不覆盖 |
| 链接集合切换 | `enable` / `disable` 经 `applyLinkSet` 切换，Windows 使用免提权 Junction | 双保险防误删锁：`unregistered-conflict`（不覆盖未登记真目录）、`not-link-conflict`（不删除被替换为真目录的条目）；写 `tmp/` journal，跨卷失败逆序回滚 |
| 离线与后台行为 | 无后台常驻 `fs.watch`；OS 撑住已建好的 Junction 照常可用 | 经链接直接修改原件会实时穿透各已启用客户端，但绕过 `archive/versions/` 快照且导致 `index.json` 哈希漂移；若脚本清空链接**内部**文件会直接删空总馆真身 |
| 删除与重置 | `disable` 仅摘链接；`archive` 摘链后打包 `.zip`；编辑留单文件快照到 `archive/versions/` | 零真删除；`reset` 先将旧总馆挪到 `.pre-reinit-*`，客户端冲突目录挪到带唯一 `runId` 的 `.skills-hub.restore-aside/<runId>/` |
| IDE 发现 | 按目录形状扫描 `<home>/<client>/skills`、`.config/<client>/skills` 及 Cursor / Antigravity / Windsurf 嵌套惯例（[clients.ts](../../../packages/core/src/clients.ts)） | 绝不创建不存在的 root；新发现 IDE 默认挂 `0` 个（零静默写入）；当前无手动填路径注册 UI |
| 备份与还原 | `backup` 按 SHA-256 存入 `backups/blobs/` 去重池，指向总馆内只记链接，总馆外链接递归复制内容 | `backup` 快照的是**客户端各目录现场**而非总馆自身；`restore` 绝不直接覆盖现物 |

### 1.2 当前关键短板

1. **无 Reconcile 收敛引擎**：没有「先备份 → 移出客户端真实 skill 目录 → 原地挂回纯软链接」的闭环，日常野生新增也无对账入口。
2. **冲突处理阻塞且先到先得**：`adoptSkillFolder` 按扫描顺序先扫到谁算谁，不比较时间；撞名不同内容直接跳过丢弃，没有冲突保留池，也没有 WebUI/GUI 冲突处理面板。
3. **无自愈运维命令**：`doctor` 无法清理 360 条死台账（缺 `--prune`）；`verify` 严格只读，外部改完无法确认刷新指纹（缺 `--accept`）。
4. **缺少主动巡检与托盘**：Electron 桌面壳（[main.ts](../../../apps/desktop/src/main.ts)）尚未支持开机自启、系统托盘与启动 L1 巡检横幅。
5. **self-skill 引导存在反指示漏洞**：[SKILL.md](../../../packages/cli/self-skill/SKILL.md) 第 3 行 `description` 漏掉「新建 / 修改 skill」，第 21 行甚至明写「*不需要调用我的场景：只是修改 skill 内容（那是 skill 自身的事）*」。
6. **无 Git 版本控制与 `gh` 云端备份**：现有 [share.ts](../../../packages/cli/src/share.ts) 需用户手工配 `GITHUB_TOKEN` 推送社团授信仓，无本地 Git 历史与 `gh` 一键个人备份能力。
7. **默认路径内部不一致**：`bootstrap.ts` 默认使用 `~/.skills-hub`，而 `store-shared.ts` 中的 `performInit` 默认落在 `~/.skills-hub/store`。

---

## 2. 目标架构五大核心提案与深度分析

### 2.1 状态与资产目录分离：固定 `~/.skills-hub/` 控制备份区 + 可自定义唯一真源目录

沿用工程内既有隐藏目录名 **`.skills-hub`**（对应 [store-shared.ts](../../../packages/cli/src/store-shared.ts) 的 `POINTER_REL` 与 [clients.ts](../../../packages/core/src/clients.ts) 的 `OWN_DIR_PREFIX` 自动排除规则，避免被误扫成 IDE 客户端）。

将「本机运行态 / 备份」与「唯一真源资产」物理拆开——**前者默认固定在 `~/.skills-hub/`（前期开发不建议更改，初始化时明确告知用户）；唯独后者允许用户自定义路径**：

```text
C:\Users\<用户>\.skills-hub\      ← 固定本机控制、备份与状态中心（初始化告知，不建议改）
├── config.json                   ← 指向唯一真源路径 + Git / 开机自启等设置
├── backups\                      ← 客户端去重基线快照（blobs/ + manifest + latest）
├── archive\                      ← 软删除归档 zip / versions/ 版本快照 / drafts/ 废稿
├── conflicts\                    ← 同名多版本待决冲突变体池
├── links.json / stats.json       ← 仅属本机的软链接台账与启用统计
├── translations\ / tmp\          ← 本机译文缓存与跨盘/原子操作 journal
└── skills\                       ← 【默认】唯一真源目录（★ 唯一允许自定义到如 D:\My-Skills）
```

**核心收益**：
1. **天然适配 Git 纯净仓库**：本机脏状态与绝对路径账本（`backups/`、`archive/`、`conflicts/`、`links.json`、`translations/`、`tmp/`）全部留在 `~/.skills-hub/`；唯一真源目录内只保留纯正的跨机可移植资产（各 skill 目录及可选分组清单），直接 `git init` 即是一座零污染仓库。
2. **C 盘客户端接管极速原子化**：`.codex`、`.claude`、`.gemini` 等客户端目录均位于用户主目录（C 盘），将原有真目录移入同样位于 C 盘的 `~/.skills-hub/backups/` 或 `conflicts/` 可走同盘 `rename`（零拷贝毫秒级原子移动）。
3. **前期开发与排障确定性高**：无论真源放在何处，本机快照与台账总在固定路径兜底，避免双端寻找状态位置混乱。

**必须兜住的 4 个工程边界**：
- **跨盘原子写 `EXDEV` 防护**：若用户把唯一真源自定义在 `D:`，不可再用 C 盘 `~/.skills-hub/tmp/` 直接 `rename` 写进 `D:`。写真源内部文件时，临时文件需就近落在真源同分区临时目录并自动支持复制+清理降级。
- **C 盘空间可控**：扫描与备份继续忽略 `node_modules/` / `.venv/` / `__pycache__/` 等重型构建物；设置页展示 `~/.skills-hub/` 占用体积并提供历史快照 / 旧归档手动清理。
- **后期迁移真源路径的联动**：初始化告知默认放在 `~/.skills-hub/skills/`；若后期用户真在设置中改迁真源路径，必须走「拷贝到新路径并校验 → 按 journal 批量重指所有客户端 Junction → 更新 `config.json` → 旧路径旁路留底」完整迁移流程，严禁只改指针导致全机软链接集体悬空。
- **测试沙箱完全隔离**：继续严格通过 `path.join(home, ".skills-hub")` 拼接，禁止在内核直调 `os.homedir()`，确保 `--home` / `SKILLS_HUB_HOME` 沙箱测试零碰触真实用户目录。

---

### 2.2 客户端接管与纯软链接同步（Reconcile 收敛引擎）

**目标态**：每个 Agent 客户端的 `skills/` 目录退化为**纯软链接投影层（Pure Projection Layer）**。只要客户端内只剩下指向唯一真源的软链接/Junction，**软删除（`archive`）、修改、回滚全部在 Skills Hub 内部一次完成**，各客户端天然 100% 同步，无需任何多副本同步逻辑。

**复用统一流程**：无论是「首次初始化接管」、「桌面端启动巡检发现异常后合并」，还是「WebUI 手动触发重新扫描」，底层走同一套可幂等重入的 **Reconcile 收敛流水线**：

```text
扫描客户端目录 → 识别野生非软链接 skill（含同名冲突）
  → 预览清单确认 → 全量写入/更新 ~/.skills-hub/backups/ 快照并校验
  → 按目录级精准移出客户端真身（归入唯一真源或冲突池）
  → 原地逐条建回指向唯一真源的 Junction（按 journal 失败逆序回滚）
```

**3 条必守安全护栏**：
1. **目录级精准接管，严禁整目录清空**：部分 IDE 会在 `skills/` 下维护非 skill 系统文件（如 `.system/` 内部组件、说明文档或缓存），且本机可能存在外部软件维护的软链接（如 `ego-browser -> ~/.local/share/ego/ego-skills`）。收敛引擎**只处理含有效 `SKILL.md` 的真实目录**，非 skill 杂项保持不动，外部软链接默认识别标注而非粗暴抹掉。
2. **原地补回原有能力集合**：接管前 `.codex` 有哪些 skill、`.claude` 有哪些 skill，接管移除真身后应立即在原地按原本启用清单挂回软链接，保证 IDE 能力不掉线。
3. **合规性对齐**：[architecture-initial-spec.md](../../designs/architecture-initial-spec.md) §4 禁止的是「未经告知与授权的**静默**搬移」。只要执行前弹出清晰预览清单（将备份数、转链接清单、冲突项、跳过杂项）并经用户授权确认，且备份校验通过后再移动原目录，就 100% 符合架构红线。

---

### 2.3 同名多版本冲突池 + WebUI/GUI 冲突处理板块 + Agent 智能合并工具

**核心思路**：废除现有 `adoptSkillFolder` 遇到撞名就报 `conflict` 跳过丢弃的做法，改为**「零丢失保留全部变体 + 暂定最新为主 + 专有冲突板块 + Agent 读上下文智能合并」**：

1. **同名多版本冲突池（`~/.skills-hub/conflicts/<name>/<variantId>/`）**：
   - 收敛扫描时，所有同名但内容哈希不同的变体一份不丢，全部备份后入池，连同元信息一起登记（原来源客户端集合、内容哈希、`maxMtime`、文件清单）。
   - 计算每个文件夹内所有有效文件的**最大修改时间（`maxMtime`，绝不只看顶层文件夹 `mtime`）**，默认将最新的一份复制为唯一真源活跃版本并挂出软链接，同时给该 skill 标上 `存在冲突 (N 个变体)` 标记。
   - **Windows `mtime` 欺骗预警**：若某份老版本因昨天被重新拷贝/解压而获得了最新 `mtime`，但其有效正文长度或文件数明显缩水、或时间差仅在数秒内，冲突卡片显示低风险/内容缩水黄色提醒，靠冲突池兜底确保绝不丢版。
2. **WebUI & 桌面 GUI 共享「冲突处理」板块**：
   - 因 `apps/desktop` 桌面端直接封装加载 `apps/web` 的 UI 产物，做一套「冲突处理」页面即可让 WebUI 与桌面 GUI 天然同时拥有。
   - 页面并排展示冲突 skill 的所有变体（所属客户端、`maxMtime`、哈希、逐文件 Diff），提供 4 种人工操作：
     - **确认留用当前真源**：将其余落选变体归档入 `archive/conflicts/` 并清除冲突标记；
     - **扶正另一变体为真源**：自动将当前真源留快照到 `archive/versions/` 后替换为所选变体（客户链接自动命中新版，无需逐条重连）；
     - **拆分为两个独立 skill**：给其中一版重命名后分别入库；
     - **一键交给 Agent 分析合并**。
3. **新增确定性 CLI / Agent 冲突融合工具集**：
   - 遵循 `AGENTS.md`「智能判断写进 Agent / Skill，确定性读写留给内核与 CLI」原则，在 [tools.ts](../../../packages/cli/src/agent/tools.ts) 与 CLI 中新增 4 个一等确定性工具：
     - `list_conflicts`：列出待处理冲突清单及各变体来源、`maxMtime`、文件变更摘要；
     - `diff_conflict_variants`：对多变体输出确定性的逐文件新增/删减/行级 Diff；
     - `read_conflict_file`：按需精读某一变体的特定文件上下文；
     - `apply_conflict_resolution`：落地用户最终确认的决议（`pick` 选定版本或 `merge` 写入融合后的完整文件内容，受现有 `writePolicy` 写确认门禁保护；自动存档旧版到 `archive/versions/` / `archive/conflicts/`，重算哈希并原子更新关联数据）。

---

### 2.4 开机自启 + 启动极速巡检 + UI 手动重扫 + 强化 `self-skill`

用**「前置引导（挡住 85%~90%） + 启动/手动轻量巡检（100% 兜底漏网）」**双层防线替代沉重且易锁文件的 `fs.watch`：

1. **重构内置 [SKILL.md](../../../packages/cli/self-skill/SKILL.md)**：
   - 修正当前缺失「新建/修改」触发词及第 21 行反向指引的问题；
   - 在 `description` 强化中英文高召回触发关键词（新建、创建、更新、修改、回写经验、删除/归档 skill），明确写死：**只要涉及对 skill 的任何增删改查，Agent 必须先读取本 skill 获取唯一真源真实位置与标准 CLI / 操作流程**；
   - 保持本 skill 自动安装并启用至所有已发现客户端（同时认识到各 Agent 语义命中具有概率性且受内置 `skill-creator` 竞争，详见 [creation-path-analysis.md](../skill-creation-path/creation-path-analysis.md)，因此必须配下方兜底巡检）。
2. **开机自启与两级极速巡检（5~20ms）**：
   - Electron 桌面端支持可选开机自启，默认安静启动到系统托盘（无新发现不弹大窗打扰）；WebUI 与桌面端设置/总览均提供「立即重新扫描」按钮；
   - **L1 极速浅扫**：启动与重扫时仅对各客户端 `skills/` 第一层执行 `readdir` + `lstat`——**凡已在 `links.json` 登记且指向真源的合法链接直接跳过（0 内容 I/O）**；仅标出「新增野生非软链接真目录（含半成品检查）」与「台账死链接」；
   - **L2 按需深扫**：仅对 L1 筛出的少数真目录读取 `SKILL.md`（若缺 `name`/`description` 视为 IDE 正在写入中的半成品，暂不误抓）、计算哈希与 `maxMtime` 并比对总馆是否撞名；
   - 若发现新增或冲突，UI 弹出非阻塞提醒条/托盘通知：「检测到新的本地 skill 或版本冲突，是否备份并合并入唯一真源？」，确认后直接触发 **§2.2 + §2.3** 同一套接管与冲突解决流程。

---

### 2.5 可选 Git 版本控制 + 确定性/Agent 混合提交 + GitHub CLI (`gh`) 一键云端备份

1. **安装检测与设置页开关（双轨可降级）**：
   - 首次安装 / 初始化时自动检测本机是否已安装 `git`；若未安装则友好引导安装，同时允许用户跳过不装；
   - UI 设置面板提供明确开关：**「启用 Git 进行 Skills 版本控制」**。关闭或未装 `git` 时优雅降级为纯文件系统 + `archive/versions/` 单文件快照，不阻塞核心功能。
2. **纯资产仓库范围（由 §2.1 天然保证）**：
   - `git init` 仅作用在唯一真源目录（包含 `skills/` 及可选 `groups.json` / `manifest.json`），默认配备严格 `.gitignore`（排除 `.env*`、`node_modules/`、`.venv/`、`__pycache__/`、OS 缩略图及临时文件）；
   - `backups/`、`archive/`、`conflicts/`、`links.json` 等本机运行态留在 `~/.skills-hub/`，绝不混入 Git 提交历史。
3. **Commit 与合并的分工（快路径 + 智能路径）**：
   - **常规增删改查走确定性快路径**：面板保存编辑、接管新 skill、归档/恢复等确定性动作由 CLI 自动执行规范化提交（如 `feat(skill): adopt <name>`、`chore(skill): archive <name>`），做到 0 延迟、0 Token 消耗、断网可用；
   - **高价值上下文动作走 Agent 智能路径**：外部 Agent 改写/创作后按 `self-skill` 规范调用提交命令补充语义摘要；多版本复杂合并、按修改上下文回溯历史并定位目标 skill 时，由 Agent 读取 `git diff` / `git log` 完成分析并在人确认后提交。
4. **基于 GitHub CLI（`gh`）的引导登录与一键云端建仓备份**：
   - 检测 `gh` 登录状态；未登录时在 WebUI / GUI 内置引导流程——后端拉起 `gh auth login --hostname github.com --git-protocol https --web`，提取 **8 位一次性设备授权码**展示在面板弹窗中，提供一键复制与打开浏览器授权页并后台轮询登录态；**Skills Hub 全程不触碰、不存储用户明文 GitHub Token**；
   - 登录后支持在面板一键创建云端备份仓库（支持选择 **Private 私有（强烈推荐默认）** 或 **Public 公开（弹窗警示 + 轻量化密钥/敏感信息扫描拦截）**），配置 `origin` 并推送同步（v1 定位单向云端备份 push；若远端有分叉冲突严禁 `push -f`，提示拉取解决）；
   - 分层约束：所有 `git` / `gh` 子进程调用全部收口在 `packages/cli` 并经本地 `/api/git/*` 暴露，严禁进入纯逻辑层 `packages/core`。

---

## 3. 架构闭环总览

```text
  Agent / 用户创作或修改 skill
         │
         ├─ 命中强化版 self-skill ──→ 直写唯一真源目录 + 语义 commit
         │
         └─ 逃逸到客户端真目录 ────→ 开机 L1 极速巡检 / UI 手动重扫捕获
                                         │
                                         ▼
                           [统一 Reconcile 收敛引擎]
                      preview 确认 → C:\Users\..\.skills-hub\backups 备份校验
                      → 移出客户端真目录 → 原地挂回纯软链接 (Junction)
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
           无冲突：直入唯一真源                        同名异版：maxMtime 暂定主版
                    │                                其余入 conflicts/ + UI 冲突板块
                    │                                ──→ Agent diff 工具分析 → 人确认合并
                    └────────────────────┬────────────────────┘
                                         ▼
                         唯一真源 (默认 ~/.skills-hub/skills，可自定义)
                                         │
                         [可选 Git 开关] → 自动/Agent commit → gh 一键推 GitHub 私有库备份
```

---

## 4. 决策定案记录（Decision Record）

以下 6 项决策已于 `2026-11-20` 锁定默认落地口径，正式展开为 [PRD.md](../../specs/single-source-sync-and-versioning/PRD.md) 与 [task.md](../../specs/single-source-sync-and-versioning/task.md)：

- [x] **D1. 接管扫描遇到「外部软链接」的处理策略**：采用**选项 A**——默认跳过保持原样，在扫描/接管清单中标记为「外部托管链接」，用户可显式勾选纳入接管。
- [x] **D2. 存在同名冲突时，接管瞬间客户端挂链策略**：采用**选项 A**——所有变体先备份并进入 `~/.skills-hub/conflicts/<name>/` 零丢失留底，按目录内有效文件 `maxMtime` 最新者暂定为唯一真源并立即为客户端挂回软链接，其余变体在 WebUI/GUI 冲突板块由用户或 Agent 合并解决。
- [x] **D3. 桌面端开机自启与启动巡检交互形态**：采用**选项 A**——支持开机自启并默认静默缩至系统托盘，L1 巡检发现野生真目录或冲突时再通过系统通知/角标提醒（设置页可关闭或切换）。
- [x] **D4. Git Commit 的触发粒度**：采用**选项 A**——常规面板/CLI 确定性 CRUD 自动按规范模板 commit（0 延迟、离线可用），外部 Agent 改动与冲突融合交由 Agent 写语义 commit。
- [x] **D5. GitHub 云端备份鉴权依赖选型**：采用**选项 A**——复用官方 `gh` CLI，由 WebUI 提供设备码登录向导与一键创建私有/公开仓库，Skills Hub 零保存明文 Token。
- [x] **D6. 默认路径收口与本机历史库存迁置时机**：统一默认控制中心 `~/.skills-hub/` + 默认唯一真源 `~/.skills-hub/skills/`（兼容读取旧单根 `config.json`）；全部新任务严格在 `--home` 沙箱内开发与测试，待引擎验收完成后再由用户按新流程安全收敛本机 `D:\projects\My-Skills\Hubs`。

---

## 5. 正式落地文档与跟踪入口

- 详细 PRD：[docs/specs/single-source-sync-and-versioning/PRD.md](../../specs/single-source-sync-and-versioning/PRD.md)
- 任务追踪与 Agent 自动化 SOP：[docs/specs/single-source-sync-and-versioning/task.md](../../specs/single-source-sync-and-versioning/task.md)
- 已同步兼容更新的规范：`architecture-initial-spec.md`、`store-and-paths-v0.md`、`cli-commands-v0.md`、`http-api-v0.md`、`agent-v0.md`、`desktop-shell-v0.md`、`app-shell-v2.md`、`project-structure.md`、`pr-and-git-workflow.md`、`AGENTS.md`。
