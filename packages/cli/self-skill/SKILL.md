---
name: skills-hub
description: 管理本机 Agent Skill。新建/创建 create/new，修改/编辑/更新/回写经验 edit/update/modify/refactor，查询 list/show，收录 adopt，启用/停用 enable/disable，软删除/归档 archive，冲突合并 conflicts，巡检/对账收敛 reconcile，Git 提交和云端备份 git，以及分享与快照恢复时使用。
---

<!-- skills-hub-guide-version: 2 -->

# Skills Hub 本机技能管理指南

## 任何读写先定位唯一真源

在新建、修改、回写经验或删除任何 Skill 之前，必须先阅读本指南。用 `skills-hub show <名称> --json` 确认库存中的 `matches[].dirName`，再读 `~/.skills-hub/config.json` 的 `skillsRoot` 定位原件。旧版配置只有 `storeRoot` 时，原件在 `<storeRoot>/skills/<dirName>`。客户端目录内的条目是挂载入口，禁止在 `.codex/skills`、`.claude/skills`、`.cursor/skills-cursor` 或 Antigravity 落点私建真文件夹。首次新建时让 CLI 分配库存草稿目录。

修改或回写经验优先使用面板编辑器或 Agent 的 `write_skill_file`，保存时自动留版本快照。用户已经在唯一真源中编辑时，先运行 `skills-hub verify` 核对漂移，用户认可后用 `skills-hub verify --accept --yes` 更新台账。启用了 Git 时可用 `skills-hub git log` 核对自动提交，按需用 `skills-hub git commit` 写明提交原因。

真实写入和接管前向用户说明来源、落点和影响，获得明确授权。以下示例的 `<SANDBOX_HOME>` 必须替换为独立的临时 Home，`--home` 指向发现客户端的基座。仓库中可用 `node packages/cli/dist/index.js` 代替 `skills-hub`，先运行 `pnpm build`。沙箱服务统一使用 `--port 0`，打开该命令输出的实际端口。

## 创建、收录与编辑

```powershell
skills-hub init --home <SANDBOX_HOME> --yes --json
skills-hub list --home <SANDBOX_HOME> --json
skills-hub show <name> --home <SANDBOX_HOME> --json
skills-hub new <name> --home <SANDBOX_HOME> --json
skills-hub new list --home <SANDBOX_HOME> --json
skills-hub new commit <name> --home <SANDBOX_HOME> --json
skills-hub new discard <name> --home <SANDBOX_HOME> --json
skills-hub adopt <local-directory-or-URL> --home <SANDBOX_HOME> --yes --json
skills-hub verify --home <SANDBOX_HOME> --json
skills-hub verify --accept --dry-run --home <SANDBOX_HOME> --json
skills-hub verify --accept --home <SANDBOX_HOME> --yes --json
```

`new` 返回 `storeDir`。在该位置写 `SKILL.md`、`references/` 等文件，再用 `new commit` 定稿。放弃草稿时使用 `new discard`，内容进入 `archive/drafts/`。收录支持本地目录、GitHub 仓库、GitHub 树路径及 `https://skills.sh/<owner>/<repo>/<skill>`。同指纹复用已有记录，同名异版保留双方并提示选择。编辑时沿用已确定的技能名。

## 客户端挂载与库存归档

```powershell
skills-hub scan --home <SANDBOX_HOME>
skills-hub enable <name> --client codex --home <SANDBOX_HOME> --dry-run --json
skills-hub enable <name> --client codex --home <SANDBOX_HOME> --yes
skills-hub disable <name> --client codex --home <SANDBOX_HOME> --yes
skills-hub group list --home <SANDBOX_HOME>
skills-hub group add <group-id> <name> --home <SANDBOX_HOME> --yes
skills-hub archive <name> --home <SANDBOX_HOME> --yes
skills-hub archive --home <SANDBOX_HOME>
skills-hub archive restore <archive-name> --home <SANDBOX_HOME> --yes
```

`enable` / `disable` 只建立或撤回受管挂载。按组挂载用 `--group <id>`，项目作用域用 `--scope project`。软删除用 `archive`，先移除受管挂载，再将原件留在归档。恢复后按需重新启用。分组维护用 `group create`、`group rename`、`group remove` 和 `group delete`，操作分组定义不会删除技能。

## 对账收敛与同名冲突

```powershell
skills-hub bootstrap --home <SANDBOX_HOME> --port 0
skills-hub reconcile --home <SANDBOX_HOME> --dry-run --json
skills-hub reconcile --home <SANDBOX_HOME> --yes --json
skills-hub conflicts list --home <SANDBOX_HOME> --json
skills-hub conflicts diff <name> --a active --b <variant-id> --home <SANDBOX_HOME> --json
skills-hub conflicts resolve <name> --mode pick --winner <variant-id> --home <SANDBOX_HOME> --yes
skills-hub conflicts resolve <name> --mode split --winner <variant-id> --new-name <new-name> --home <SANDBOX_HOME> --yes
skills-hub migrate --to <absolute-path> --home <SANDBOX_HOME> --dry-run --json
```

首次 `bootstrap` 选择真源位置并确认后，系统校验备份才执行客户端接管并打开面板。日常用 `reconcile --dry-run` 对照待收录、换链、冲突及跳过项。外部托管链接默认保留，得到单独授权才用 `--include-external-links`。读清所有冲突变体再选择保留、拆分或通过面板 Agent 提交融合决议。移动真源时先预演 `migrate`，确认目标后才加 `--yes` 执行，固定控制与备份根仍在 `~/.skills-hub/`。

## 本地备份、Git 与分享

```powershell
skills-hub backup --home <SANDBOX_HOME> --yes
skills-hub backup list --home <SANDBOX_HOME>
skills-hub backup verify <snapshot-id> --home <SANDBOX_HOME>
skills-hub backup restore <snapshot-id> --home <SANDBOX_HOME> --dry-run --json
skills-hub doctor --home <SANDBOX_HOME>
skills-hub ui --home <SANDBOX_HOME> --port 0
```

客户端还原使用 `backup restore`；先核对快照和预览，经授权再去掉 `--dry-run` 并加 `--yes`。`reset` 会恢复客户端并旁路旧库存，只有用户明确要求回到初始化状态时才使用。想评估内容相近程度时可用 `analyze <name-or-path>` 获得只读建议；`share <name>` 用于推送单个技能到授信仓库，先用 `--dry-run` 核对目标。

启用了 v0.3 Git 功能的发行版可用 `skills-hub git status`、`skills-hub git enable --yes` 和 `skills-hub git log`。Git 仓只包住真源。云端备份通过设置中的 GitHub CLI 设备登录，默认选择私有仓库，确认远端和内容后才初始化或推送。沙箱只用本地 Git 或 `gh` 替身。任何密钥、认证令牌和 `.env*` 都不得写进 Skill、日志或 Git 历史。

支持 `--json` 的命令用 `ok`、`command`、`code` 与 `message` 查看结果。接管、挂载、归档、迁移和云端操作以实际命令结果为准，失败时把具体原因交给用户确认。
