# HTTP 契约 v0:本地服务(ui-server)

> 状态:生效 | 适用范围:packages/cli/src/ui-server.ts ↔ apps/web | 对应 issue:#31
> 信封、错误 code 与 SkillRecord 字段一律复用 [json-contract-v0.md](json-contract-v0.md),不重复发明。

## 1. 基础

- 服务:`skills-hub ui [--port <n>] [--home <path>]`;Hono,`hostname: "127.0.0.1"`(固定,不接受外部绑定)
- 默认端口:4321;HTTP/JSON,UTF-8
- 成功信封:`{ ok: true, command: "<命令>", ...数据 }`;失败信封:`{ ok: false, command, code, message }`(code 枚举见 json-contract-v0.md §3)
- 写端点(body JSON)无需 --yes:面板按钮即用户显式操作;授权边界 = 只绑本机
- storeRoot 解析失败(未 init)时,所有业务端点返回 503 store-not-configured

## 2. 读端点

| 端点 | 成功响应 | 失败 |
| --- | --- | --- |
| GET /api/health | { ok: true } | — |
| GET /api/skills | { ok, command: "skills", storeRoot, total, skills: SkillRecord[] } | 503 store-not-configured |
| GET /api/skills/:hash | { ok, command: "skill", skill: SkillRecord } | 404 not-found;503 |
| GET /api/groups | { ok, command: "groups", version, groups: GroupDef[] } | 503 |
| GET /api/stats | { ok, command: "stats", stats: StatsFile, ranking: UsageRankEntry[] } | 503 |
| GET /api/archive | { ok, command: "archive", verb: "list", archiveDir, archived: ArchivedSkill[] } | 503 |
| GET /api/clients | { ok, command: "clients", clients: { clientId, skillsDir }[] }(global 侧发现的客户端) | —(不依赖库存) |
| GET /api/skills/:hash/links | { ok, command: "skill-links", hash, links: { clientId, state, detail }[] }(检查器客户端页,按需拉取) | 404 not-found;503 |
| GET /api/clients/:clientId/skill-states | { ok, command: "client-skill-states", clientId, skillsDir, enabled, total, rows: { hash, state, detail }[] }(客户端视角全集行状态) | 404 not-found;503 |
| GET /api/verify | { ok, command: "verify", storeRoot, checked, passed, drifted, missing }(只读;CLI --json 的 ok 数组在此改名为 passed,避开信封 ok) | 503 |
| GET /api/doctor | { ok, command: "doctor", store, roots, linkTypes, danglingLinks }(与 CLI --json 同形) | 503 store-not-configured |
| GET /api/backups | { ok, command: "backup", verb: "list", storeRoot, latest, snapshots }(与 CLI backup list --json 同形) | 503 |

### SkillRecord(与 json-contract §2 同定义)

- `hash`:内容哈希(hex)
- `dirName`:库存目录名
- `meta: { name, description }`:SKILL.md 元信息
- `origins[]`:收录来源(kind + reference),**与 visibleIn 永不合并**
- `visibleIn[]`:客户端可见性,由台账实时推导(某 dirName 在哪些客户端有链接)
- `installedAt`:入库时间(ISO)
- **不存在 `source` 字段**(历史遗留的 clientId 别名已废除)

### UsageRankEntry(与 core 同名类型;GET /api/stats 的 ranking 项)

- `skillHash`:skill 内容哈希(hex)。**没有 `hash` 字段**(与 SkillRecord.hash 同值、不同键名)
- `show` / `enable`:分别计数
- `total`:`show + enable`

## 3. 写端点

| 端点 | body | 成功响应 | 失败 |
| --- | --- | --- | --- |
| POST /api/skills/:hash/enable | { clientId, scope? } | { ok, command: "enable", clientId, scope, targetDir, created, removed } | 400 bad-usage(缺 clientId);404 not-found(客户端或 skill 不存在);409 link-failed;503 |
| POST /api/skills/:hash/disable | 同上 | { ok, command: "disable", ... } | 同上 |
| POST /api/links/preview | { hashes, clientIds, action: enable\|disable, scope? } | { ok, command: "links-preview", action, add, remove, conflictCount, wouldCreate, wouldRemove, conflicts }(不写盘) | 400 bad-usage;404 not-found;503 |
| POST /api/links/apply | 同上 | { ok, command: "links-apply", action, created, removed }(按落点各一次 applyLinkSet) | 400;404;409 link-failed(含 conflicts,未写盘);503 |
| POST /api/skills/:hash/archive | —(无 body) | { ok, command: "archive", dirName, archiveFile, sizeBytes, removedLinks } | 404 not-found;409(归档失败);503 |
| POST /api/skills/:hash/restore | —(无 body;:hash 为归档名) | { ok, command: "restore", dirName, hash, archiveFile } | 404 not-found;409 conflict;500;503 |
| POST /api/adopt | { source }(本地路径或 GitHub / skills.sh URL) | { ok, command: "adopt", adopted, duplicates, conflicts, invalid, outcomes } | 400 bad-usage;502 github-fetch-failed;503 |
| POST /api/groups | { id, name?, description? } | { ok, command: "group", verb: "create", id, name, description } | 400 bad-usage;409 group-exists;503 |
| PATCH /api/groups/:id | { name?, description? }(至少一项) | { ok, command: "group", verb: "rename", id, name, description } | 400;404 group-not-found;503 |
| DELETE /api/groups/:id | — | { ok, command: "group", verb: "delete", id, memberCount }(只删分组定义,不删 skill) | 404 group-not-found;503 |
| POST /api/groups/:id/members | { hashes, action: add\|remove } | { ok, command: "group", verb: "add"\|"remove", id, hashes, changed } | 400;404 group-not-found\|not-found;503 |
| POST /api/analyze | { target }(hash 前缀或 dirName) | { ok, command: "analyze", target, similar, conflict }(只建议,不写盘) | 400 bad-usage;404 not-found;503 not-configured;502 analyze-failed |
| POST /api/share | { target, repo? }(hash 前缀或 dirName;repo 覆盖 manifest.trustedRepo) | { ok, command: "share", dirName, url, idempotent, dryRun } | 400 bad-usage;404 not-found;409 remote-conflict;503 auth-required(无 GITHUB_TOKEN);502 github-push-failed |
| POST /api/backups/preview | { snapshotId? } | { ok, command: "backups-preview", snapshotId, dryRun: true, clients, skills, files, links, wouldRestore, skippedOwnDirs, asideStore, asidePointer }(不写盘) | 400;404 not-found;409 verify-failed;503 |
| POST /api/reset | { snapshotId?, confirm: "reset" } | { ok, command: "reset", storeRoot, snapshotId, asideStore, asidePointer, adopted }(本请求内跑完还原,与 CLI `reset --json` 同形) | 400 bad-usage(缺确认短语);404;409 verify-failed\|restore-failed;500 io-error;503 |

- `:hash` 匹配规则与 CLI 的 resolveNames 同口径:dirName 精确,否则哈希前缀
- `scope`:global(默认,home 下)/ project(cwd 下),与 cli-commands-v0.md §2 一致
- 写操作复用 link-actions.ts 的 performLinkChange/archiveSkill(与 CLI enable/disable/archive 同一实现,行为不漂移)
- unregistered-conflict(落点被用户目录占据)与 not-link-conflict 以 409 + link-failed 返回,message 给出人工处理指引,绝不覆盖

## 4. HTTP 状态码映射

| code | HTTP |
| --- | --- |
| bad-usage | 400 |
| not-found | 404 |
| group-not-found | 404 |
| link-failed | 409 |
| group-exists | 409 |
| store-not-configured | 503 |
| not-configured | 503 |
| io-error(预留) | 500 |
| github-fetch-failed | 502 |
| analyze-failed | 502 |
| github-push-failed | 502 |
| remote-conflict | 409 |
| auth-required | 503 |
| verify-failed | 409 |
| restore-failed | 409 |

> 注:auth-required / group-empty / invalid-skill 是 CLI 专属 code(交互授权、按空组 enable)。分组写操作走 HTTP,code 与 CLI 同口径。

## 5. 测试

packages/cli/test/http-api.test.ts:createUiApp 注入沙箱 storeRoot/home,`app.request()` 直测(不占真实端口),覆盖信封形状、origins/visibleIn 分离、写端点成功与结构化失败、links preview/apply、分组 CRUD、analyze 只读建议、verify/doctor 只读报告、503 未配置。
