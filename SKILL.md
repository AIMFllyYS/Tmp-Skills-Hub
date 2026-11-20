---
name: skills-hub
description: 何时调用我:你需要管理本机 Agent Skill 的库存时——收录新 skill(本地目录/GitHub/skills.sh)、查某个 skill 的分组与描述、按需启用/撤回它在某个客户端的可见性、软删除不再需要的 skill 或从归档恢复、推到授信仓库分享、备份/还原客户端或做相近/冲突分析。只读这一份就能跑通全流程,不需要其他对话。
---

# skills-hub:本机 Agent Skill 统一管理

## 什么时候该调用我

- **收录**:用户说「帮我存一下这个 skill / 这个目录是个 skill / 这个 GitHub 链接」→ 用 `adopt` 收录进统一库存(支持本地目录、GitHub 仓库或目录、skills.sh 三段链接)
- **查询**:想知道库存里有什么、某 skill 的分组与描述 → `list` / `group list` / `show`
- **按需启用**:想让某个 skill 在 Claude/Codex/Cursor/Antigravity 等客户端可见 → `enable`
- **撤回**:不想让它再可见(原件保留)→ `disable`
- **软删除与恢复**:确定不要了 → `archive`(打包进归档区,不真删除);需要取回 → `archive restore`
- **新建**:从零创建一个新 skill → `new` / `new commit` / `new discard` / `new list`
- **分享**:把库存里的 skill 推送到社团授信 GitHub 仓库 → `share`
- **分析**:想知道库存里哪个 skill 与某个 skill 相近或冲突 → `analyze`(模型判断,只建议不写盘)
- **备份与还原客户端**:建快照/校验/还原客户端 skills(不动库存)→ `backup` / `backup list` / `backup verify` / `backup restore`
- **回到初始化前再自动初始化**:用户说「一键恢复到 bootstrap 之前再重新收录」→ `reset`。人在面板设置里点重置并确认;Agent 用 `reset --yes`。不要让人再打命令。

不需要调用我的场景:只是修改 skill 内容(那是 skill 自身的事,改完可 `verify` 校验哈希)。

## 前置

CLI 入口:仓库内 `node packages/cli/dist/index.js <command>`(需先 `pnpm build`),或全局 bin `skills-hub <command>`。

> 沙箱规则:任何"真实执行"都在沙箱 home 下做。所有演示命令用 `<SANDBOX_HOME>` 占位表示沙箱库存根,真实环境先问用户要库存位置。

## 全流程(自包含)

### 0. 一键初始化(真机体验;交互式,库存已就绪时直接启动面板)

    skills-hub bootstrap [--home <库存根>] [--port 4321] [--yes]

- 依次交互确认:库存位置(回车用默认 `~/.skills-hub`)→ 备份(Y=写入 `<库存根>/backups/` 增量快照,N=跳过)→ 迁移(Y=收录全部本机 skills)
- 红字警告 + 每一步 Y 即显式授权;完成后自动收录并启用自身 skill,再启动面板并尝试打开浏览器
- 幂等:指针文件已配置 → 零交互直接启动面板
- 非 TTY 环境需 `--yes`(全自动,默认路径,跳过全部确认)

### 1. 初始化库存(一次性)

    skills-hub init --home <SANDBOX_HOME> --yes

### 2. 收录 skill(本地目录)

    skills-hub adopt <本地skill目录路径> --home <SANDBOX_HOME> --yes

重复收录同一内容 → 显示「已存在(内容相同)」并并入来源;同名不同内容 → 冲突,绝不覆盖。

### 2b. 收录 skill(GitHub / skills.sh 链接,需网络)

    skills-hub adopt https://github.com/<owner>/<repo> --home <SANDBOX_HOME> --yes
    skills-hub adopt https://github.com/<owner>/<repo>/tree/<ref>/<路径> --home <SANDBOX_HOME> --yes
    skills-hub adopt https://skills.sh/<owner>/<repo>/<skill> --home <SANDBOX_HOME> --yes

- GitHub 仓库根模式 → 发现全部含 `SKILL.md` 的目录;tree/blob 模式 → 只收指定目录。
- skills.sh 三段链接解析为 GitHub 源复用同一套判定;`site/` 与 `p/` 前缀会给出明确的不支持提示。
- 匿名 API 60 次/小时,超限时报 403 并提示设置 `GITHUB_TOKEN` 提升额度。

### 3. 看库存与读 description

    skills-hub list [--source <kind|关键词>] [--enabled] --home <SANDBOX_HOME>
    skills-hub show <skill名或哈希前缀> --home <SANDBOX_HOME>

### 4. 查分组与分组操作

    skills-hub group list --home <SANDBOX_HOME>
    skills-hub group add <组id> <skill名...> --home <SANDBOX_HOME> --yes
    skills-hub group remove <组id> <skill名...> --home <SANDBOX_HOME> --yes
    skills-hub group create <id> [--name 显示名] [--desc 描述] --home <SANDBOX_HOME> --yes
    skills-hub group rename <id> --name <新显示名> --home <SANDBOX_HOME> --yes
    skills-hub group delete <组id> --home <SANDBOX_HOME> --yes

内置分组:`development` / `design` / `tooling` / `writing` / `research`。分组只是视图——删除分组不影响任何 skill。

### 5. 按需启用(挂链接到客户端)

    skills-hub enable <skill名...> --client <claude|codex|...> [--scope global|project] --home <SANDBOX_HOME> --yes
    skills-hub enable --group <组id> --client <claude|codex|...> --home <SANDBOX_HOME> --yes

### 6. 撤回(摘链接,原件保留)

    skills-hub disable <skill名...> --client <claude|codex|...> [--scope global|project] --home <SANDBOX_HOME> --yes
    skills-hub disable --group <组id> --client <claude|codex|...> --home <SANDBOX_HOME> --yes

### 7. 软删除与归档恢复

    skills-hub archive <skill名...> --home <SANDBOX_HOME> --yes
    skills-hub archive --home <SANDBOX_HOME>                    # 列出归档区
    skills-hub archive restore <归档名或skill名> --home <SANDBOX_HOME> --yes

归档 = 先摘全部受管链接,再把库存目录打包成 zip 移入归档区,并从库存清单移除。`archive restore` 从归档区恢复回库存活跃区(不自动重建链接,也不删除归档 zip)。

### 8. 校验与自检

    skills-hub verify --home <SANDBOX_HOME>
    skills-hub doctor --home <SANDBOX_HOME>

`verify` 严格只读:重算哈希,报告被外部修改(漂移)或缺失的 skill,不自动改写(`--json` 下通过数组键名为 `passed`)。

### 9. 相近/冲突分析(文本判断交给模型)

    skills-hub analyze <本地skill目录|库存skill名> --home <SANDBOX_HOME>
    skills-hub analyze <库存skill名> --home <SANDBOX_HOME> --json

- 对照库存 description 给出相近(`similar`)与可能冲突(`conflict`)清单及理由;
- 只读建议,不触发任何写操作;
- 需要 `QINIU_API_KEY`(写在工作目录 `.env` 或 `~/.skills-hub/.env`,已被 git 忽略,绝不提交);无密钥时返回 `not-configured` 明确降级提示,不编造结论。

### 10. 分享到授信仓库(需网络与 token)

    skills-hub share <skill名或哈希前缀> [--repo owner/repo] --home <SANDBOX_HOME> --yes [--dry-run]

- 将库存 skill 推送到授信 GitHub 仓库的 `skills/<dirName>/`,返回可被 `adopt` 拉回的 tree 链接;
- 远端内容哈希相同时幂等跳过;同名不同内容报 `remote-conflict`,绝不覆盖;
- 需要 `GITHUB_TOKEN`(环境变量或 `.env`),无 token 报 `auth-required`。

### 11. 本地查看服务(面板)

    skills-hub ui --home <SANDBOX_HOME> --port 4321

浏览器打开 `http://127.0.0.1:4321`(或直接使用 `apps/desktop` 桌面应用)。人用壳是左侧四板块(总览 / 统计 / Skills 管理 / Agent)加左下角设置(Dialog);可在面板上启用/编辑/翻译/归档/与 Agent 对话管理库存。仅绑 `127.0.0.1`。

### 12. 客户端备份与按快照还原(库存与指针不动)

    skills-hub backup [--full] --home <SANDBOX_HOME> --yes
    skills-hub backup list --home <SANDBOX_HOME>
    skills-hub backup verify [snapshotId] --home <SANDBOX_HOME>
    skills-hub backup restore [snapshotId] --home <SANDBOX_HOME> --yes
    skills-hub backup restore <snapshotId> --home <SANDBOX_HOME> --dry-run --json

`backup` 默认增量复用 `<storeRoot>/backups/blobs/` 共享池。`backup restore` 先 verify 再逐条写回客户端 skill 落点;不整目录改名 `skills/`;displaced 条目进唯一 `runId` 旁路目录(`tmp/restore-aside-<runId>` / `.skills-hub.restore-aside/<runId>`)。与 `archive restore` 不是同一条命令。

### 13. 一键回到初始化前并重新收录

    skills-hub reset --home <SANDBOX_HOME> --yes
    skills-hub reset --snapshot <snapshotId> --home <SANDBOX_HOME> --yes

还原客户端 → 旁路指针与旧库存(只改名,含 `translations/` 等目录)→ 用确认前读到的 `storeRoot` 再收录。`--yes` 不得落到默认 `~/.skills-hub`。面板设置里确认重置后由 `POST /api/reset` 在当前 `ui` 进程跑完同一套逻辑,用户不用再打字。

### 14. 新建 skill(#169)

用户说「帮我做一个 skill」「我要创建一个新 skill」时,用 `new` 在库存里直接创建,而不是在客户端目录里手动建文件夹:

    skills-hub new <name> --home <SANDBOX_HOME> --json
    # 返回 storeDir——往这个路径写 SKILL.md 和 references/
    # AI 写完后:
    skills-hub new commit <name> --home <SANDBOX_HOME> --json

这条路径让新 skill 从诞生起就在库存里,不产生孤儿目录。`new` 不要求 `--yes`(只在库存内写,不碰客户端目录)。

如果 AI 写到一半决定放弃:

    skills-hub new discard <name> --home <SANDBOX_HOME> --json

半成品移入 `archive/drafts/`,不引入真删除。

查看当前草稿:

    skills-hub new list --home <SANDBOX_HOME> --json

## 禁止事项(红线)

- **没有真删除**:`archive` 是唯一移除方式,且库存原件一个字节不删;`disable` 只摘链接。任何"彻底删除"只能由用户自己处理归档区文件。
- **写操作必须显式授权**:非交互环境不带 `--yes` 会被拒绝(exit 2)。不要绕过,也不要替用户想当然。
- **只写沙箱**:除非用户明确指定,库存写操作一律在沙箱 home 验证。
- **不碰客户端目录内容**:`enable`/`disable` 只挂/摘受管链接(junction 或台账登记的 `kind: "copy"`),绝不移动或覆盖用户未登记的已有目录。
- **不提交密钥**:`QINIU_API_KEY` / `GITHUB_TOKEN` 只从环境变量或 `.env` 读取,不进日志、不进报告、不进发往前端的响应。

## 机器可读输出

所有命令支持 `--json`,结构契约见 `docs/specs/json-contract-v0.md`(成功信封 `ok` + `command`,失败信封 `ok: false` + `code` + `message`,退出码 `0` / `1` / `2`)。

## 开发与自测

改动前后跑四检:`pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test`,面板改动跑 `pnpm smoke`。
沙箱 E2E:`init` → `adopt`(本地+GitHub+skills.sh)→ `list`/`show` → `enable`/`disable`(`--group` 批量)→ `verify` → `archive` / `archive restore` → `analyze`,全部在 `--home <SANDBOX_HOME>` 下。
