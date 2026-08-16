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

### SkillRecord(与 json-contract §2 同定义)

- `hash`:内容哈希(hex)
- `dirName`:库存目录名
- `meta: { name, description }`:SKILL.md 元信息
- `origins[]`:收录来源(kind + reference),**与 visibleIn 永不合并**
- `visibleIn[]`:客户端可见性,由台账实时推导(某 dirName 在哪些客户端有链接)
- `installedAt`:入库时间(ISO)
- **不存在 `source` 字段**(历史遗留的 clientId 别名已废除)

## 3. 写端点

| 端点 | body | 成功响应 | 失败 |
| --- | --- | --- | --- |
| POST /api/skills/:hash/enable | { clientId, scope? } | { ok, command: "enable", clientId, scope, targetDir, created, removed } | 400 bad-usage(缺 clientId);404 not-found(客户端或 skill 不存在);409 link-failed;503 |
| POST /api/skills/:hash/disable | 同上 | { ok, command: "disable", ... } | 同上 |
| POST /api/skills/:hash/archive | —(无 body) | { ok, command: "archive", dirName, archiveFile, sizeBytes, removedLinks } | 404 not-found;409(归档失败);503 |

- `:hash` 匹配规则与 CLI 的 resolveNames 同口径:dirName 精确,否则哈希前缀
- `scope`:global(默认,home 下)/ project(cwd 下),与 cli-commands-v0.md §2 一致
- 写操作复用 link-actions.ts 的 performLinkChange/archiveSkill(与 CLI enable/disable/archive 同一实现,行为不漂移)
- unregistered-conflict(落点被用户目录占据)与 not-link-conflict 以 409 + link-failed 返回,message 给出人工处理指引,绝不覆盖

## 4. HTTP 状态码映射

| code | HTTP |
| --- | --- |
| bad-usage | 400 |
| not-found | 404 |
| link-failed | 409 |
| store-not-configured | 503 |
| io-error(预留) | 500 |

> 注:auth-required / group-exists / group-not-found / group-empty / invalid-skill 是 CLI 专属 code;HTTP 层不出现(无交互授权、分组操作暂不走 HTTP)。

## 5. 测试

packages/cli/test/http-api.test.ts:createUiApp 注入沙箱 storeRoot/home,`app.request()` 直测(不占真实端口),覆盖信封形状、origins/visibleIn 分离、写端点成功与结构化失败、503 未配置。
