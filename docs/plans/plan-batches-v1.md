# 分批执行计划（v1）

> Created: 2026-08-16
> Status: accepted
> Source: [第一次同步会](../updates/meeting-2026-08-15-first-sync.md) · [架构初始规范](../designs/architecture-initial-spec.md) · [库存与路径](../specs/store-and-paths-v0.md) · [CLI 命令面](../specs/cli-commands-v0.md)
> 取代 [plan-first-shippable.md](./plan-first-shippable.md) 的里程碑划分（那份的 M0–M4 保留作为背景，执行以本文为准）。

## 宗旨（三条，优先于一切细节）

1. **以录音稿为方向。** 有分歧时回去看录音稿怎么说，不自行发挥产品方向。
2. **把问题变简单。** 越清晰越简单越好。能不引入的依赖就不引入；必须引入时允许，但要在 PR 里说明理由。
3. **代码规范可读。** 规范「大体是硬、细节偏软」——分层与依赖方向、产品红线是硬的；文件怎么切、组件怎么组织是软的。

## 批次与录音稿的对应

| 批 | 名称 | 对应录音稿 | 依赖 |
|---|---|---|---|
| 0 | 工程基座 | 工程执行规范 | — |
| 1 | 存：发现与库存 | Step 1 存 | 0 |
| 2 | 用改删范围：链接层 | Step 2/3/4/5 | 1 |
| 3 | 渐进式披露 | Step 2 深化 | 2 |
| 4 | 统一看：面板 | Step 6 统一看 | 3 |
| 5 | 查看器与外部收录 | Step 6 之后的收录路径 | 4 |
| 6 | AI 接入 | Step 6 之后的社区/智能玩法 | 3、5 |

一批 = 一个父 issue + 一群 sub-issue = 一个分支族。按 [issue-to-pr](../../AGENTS.md) 规范，**每个 sub-issue 单独出一个 PR**，PR 打向 `dev`，正文末尾唯一一条 `Closes #N`。

## 各批内容与验收

### 批 0 工程基座

装测试框架与 CI，把规范里的矛盾修掉，让后面每一批都有可自判的验收手段。

验收：`pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test` 四条全绿，CI 在 PR 上自动跑。

### 批 1 存：发现与库存

发现客户端 root（按目录形状，不按品牌名）、建立统一库存、按内容哈希去重入库、`verify` 检测漂移。

验收：在沙箱 home 下能发现全部 root；同一内容重复收录不产生第二份；库存位置可通过 `--home` 完全重定向。

### 批 2 用改删范围：链接层

受管链接台账、原子集合切换与回滚、`enable` / `disable`、软删除归档为 zip。

验收：沙箱内建立链接后读取可穿透到库存原件；注入失败能完整回滚；台账未登记的同名条目会报错而非被覆盖；不存在真删除代码路径。

### 批 3 渐进式披露

分组增删改查、`list --json` / `show` 供 AI 取 description、按需 `enable` / `disable`、skills-hub 自身的 `SKILL.md`、调用计数落 `stats.json`。

验收：AI 仅凭 skills-hub 自己的 SKILL.md 就能完成「查分组 → 看 description → 注入 → 调用 → 撤回」全流程；每次 `show` / `enable` 都被计数。

### 批 4 统一看：面板

HTTP 契约、面板列表、搜索、分组、开关（开关即调用 `enable` / `disable`）、归档区、统计展示与排序。

验收：`skills-hub ui` 一条命令起完整体验；面板开关能真实改变客户端目录里的链接。

### 批 5 查看器与外部收录

skill 内容查看（类小型编辑器的渲染）、编辑写回、翻译按钮、GitHub 链接与 skills.sh 链接收录。

验收：能在面板里读完并改完一个 skill 且改动落到库存原件；能把一个 GitHub 链接收录进库存。

### 批 6 AI 接入

把 CLI 暴露给 DeepSeek：读 description、找相近 skill、分析冲突并报告用户。

验收：给定一个新 skill，AI 能指出库存里与它相近或冲突的既有 skill。

## 不做（本计划）

账号与统一登录、团队共享与授信仓库、公开技能市场、局域网分享、「有用」的自动判定。
当前阶段是**单点验证**——只在一台机器上跑通，不引入团队协作的复杂度。逐条见 [backlog-from-first-sync.md](../issues/backlog-from-first-sync.md)。

## 必须联网调研的知识点

以下内容仓库里没有答案，实现时必须联网查证，不允许凭猜测写代码：

- macOS / Linux 上各客户端的 skills 目录约定
- 除本机已实测的 26 个 root 外还有哪些主流客户端
- skills.sh 的链接结构与拉取方式
- symlink / junction / hardlink 在各系统的权限要求与非破坏性语义
- DeepSeek API 的调用方式（密钥在 `.env`，已被 git 忽略）
