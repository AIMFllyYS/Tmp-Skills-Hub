# HTTP 契约 v0:本地服务(ui-server)

> 状态:生效 | 适用范围:packages/cli/src/ui-server.ts（及 ui-http / ui-groups / ui-drafts / ui-content / ui-links）↔ apps/web / apps/desktop | 对应 issue:#31
> 信封、错误 code 与 SkillRecord 字段一律复用 [json-contract-v0.md](json-contract-v0.md),不重复发明。本机安全中间件与前端路由原则见 [http-and-routing.md](../conventions/http-and-routing.md)。
> **#192 修订（2026-08-22）**：字段名与状态码以 `ui-server.ts` + `http-api.test.ts` + web `types.ts` 为准回写；不再保留已废弃的 `files` / `translated` / raw PUT body。`:hash` 匹配已统一为 `resolveSkill`。
> **#216 修订（2026-08-24）**：`POST /api/agent/chat` 改为 AI SDK UI message stream；翻译 SSE 与 Agent 解绑。
> **2026-11-20 修订**：补齐本机安全中间件（`Host` / `Origin` / `Content-Type` / body 大小上限）、全局 `onError`、`/api/*` 404 JSON 兜底、缺失 `/assets/*` 404、`POST /api/store/init` 与动态 `ctx.storeRoot`、统一 `auth-required` 与完整状态码映射。

### GUI 的 AI 连接设置

`GET /api/settings/ai` 返回来源 `mode`、`baseUrl`、`model`、`hasKey` 和是否支持加密持久化 `persistent`。`PUT /api/settings/ai` 接受 `{ mode: "custom", baseUrl, model, apiKey }` 或 `{ mode: "environment" }`。切回环境变量会清除手动保存的凭据。两个端点均可在库存初始化前使用。

## 1. 基础

- 服务:`skills-hub ui [--port <n>] [--home <path>]`（或由 `apps/desktop` 进程内调用 `startUiServer` / `createUiApp`）;Hono,`hostname: "127.0.0.1"`(固定,不接受外部绑定;支持 `port: 0`)
- 默认端口:4321;HTTP/JSON,UTF-8
- 成功信封:`{ ok: true, command: "<命令>", ...数据 }`;失败信封:`{ ok: false, command, code, message }`(code 枚举见 json-contract-v0.md §3 与本文 §4)
- 写端点(body JSON)无需 `--yes`:面板按钮即用户显式操作;授权边界 = 只绑本机 + 安全中间件校验
- `ctx.paths` 保存状态和唯一真源路径，`ctx.storeRoot` 保留状态目录字符串。依赖库存的端点在未初始化时返回 `503 store-not-configured`。初始化或迁移成功后，运行中的服务即时使用新路径。
- **本机安全中间件(`/api/*`)**:
  - **Host 白名单**:仅允许 `127.0.0.1`、`localhost`、`[::1]`（可带端口）及桌面端受控域名 `skills-hub`;否则返回 `403 forbidden` JSON 信封
  - **写请求 Origin 校验**:`POST` / `PUT` / `PATCH` / `DELETE` 若携带 `Origin` 头,仅允许 `http://127.0.0.1(:port)`、`http://localhost(:port)`、`http://[::1](:port)`、`app://skills-hub`（无 `Origin` 的本机 CLI/测试直调放行）;跨站请求返回 `403 forbidden` JSON 信封
  - **写请求 Content-Type 校验**:携带非空请求体的 `POST` / `PUT` / `PATCH` 必须为 `application/json`,否则返回 `415 bad-usage` JSON 信封（拦截跨站 `text/plain` 简单请求;无 body 的 `POST /api/skills/:hash/archive` 等放行）
  - **请求体大小上限**:写请求超出默认 2 MB 上限返回 `413 too-large` JSON 信封
- **错误兜底与静态资源**:
  - 全局 `app.onError()` 捕获未处理异常并返回脱敏后的 `500 io-error` JSON 信封
  - 任何未命中的 `/api/*` 请求（含 GET/POST/PUT/DELETE 等所有方法）返回 `404 not-found` JSON 信封,不被 SPA fallback 吞掉
  - 静态文件 `/assets/*` 缺失时直接返回 `404`（不再返回 `200` 提示页）;根路由 `/` 与前端路由在产物未构建时返回可读 HTML 提示页

## 2. 读端点

| 端点 | 成功响应 | 失败 |
| --- | --- | --- |
| GET /api/health | `{ ok: true }` | — |
| GET /api/skills | `{ ok, command: "skills", storeRoot, total, skills: SkillRecord[], gitEnabled }`。随库存列表返回 Git 开关，点开 Skill 时无需额外请求设置 | 503 store-not-configured |
| GET /api/skills/:hash | `{ ok, command: "skill", skill: SkillRecord }` | 404 not-found; 400 bad-usage(前缀不唯一); 503 |
| GET /api/groups | `{ ok, command: "groups", version, groups: GroupDef[] }` | 503 |
| GET /api/stats | `{ ok, command: "stats", stats: StatsFile, ranking: UsageRankEntry[] }` | 503 |
| GET /api/archive | `{ ok, command: "archive", verb: "list", archiveDir, archived: ArchivedSkill[] }` | 503 |
| GET /api/clients | `{ ok, command: "clients", clients: { clientId, skillsDir }[] }`(global 侧发现的客户端) | —(不依赖库存) |
| GET /api/skills/:hash/links | `{ ok, command: "skill-links", hash, links: { clientId, state, detail }[] }`(检查器客户端页,按需拉取) | 404 not-found; 503 |
| GET /api/clients/:clientId/skill-states | `{ ok, command: "client-skill-states", clientId, skillsDir, enabled, total, rows: { hash, state, detail }[] }`(客户端视角全集行状态) | 404 not-found; 503 |
| GET /api/verify | `{ ok, command: "verify", storeRoot, checked, passed, drifted, missing }`(严格只读;与 CLI `--json` 统一用 `passed`) | 503 |
| GET /api/doctor | `{ ok, command: "doctor", store, roots, linkTypes, danglingLinks }` | 503 store-not-configured（HTTP 与 CLI 不同:CLI `doctor --json` 在库存未配置时仍 `ok:true`,用 `store.resolved` 表达;HTTP 走 withStore → 503） |
| GET /api/backups | `{ ok, command: "backup", verb: "list", storeRoot, latest, snapshots }`(与 CLI backup list --json 同形) | 503 |
| GET /api/drafts | `{ ok, command: "drafts", drafts: DraftRecord[] }`（无 verb;与 CLI `new list` 的 `command:"new"` 不同） | 503 |
| GET /api/agent/models | `{ ok, command: "agent-models", defaultModel, models: { id, label, note }[] }`（Agent 模型白名单,见 agent-v0.md §6） | — |
| GET /api/skills/:hash/tree | `{ ok, command: "skill-tree", dirName, entries: SkillFileEntry[], truncated }` | 404 not-found; 503 |
| GET /api/skills/:hash/file?path= | `{ ok, command: "skill-file", dirName, path, content, sizeBytes }` | 400 bad-usage（缺 path）/ outside; 404; 422 binary\|too-large; 503 |
| GET /api/skills/:hash/translation?path= | `{ ok, command: "skill-translation", hash, path, translated }`（译文缓存命中,见 store-and-paths-v0.md §2.1.1） | 400 bad-usage（缺 path / outside）; 404 translation-not-found\|not-found; 503 |

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
| POST /api/store/init | `{ skillsRoot?, guideTargets? }`（缺省 `<home>/.skills-hub/skills`；兼容旧 `{ storeRoot? }` 请求） | `{ ok, command: "store-init", stateRoot, skillsRoot, layoutMode, storeRoot, pointerFile, layoutCreated, builtinGroupsWrote, guide? }`。引导页在显式确认后发送所展示的客户端目录数组 `guideTargets`。空数组仅安装到真源；省略则保持原初始化行为。`guide.clients` 逐项目报告结果，可只重试失败的目录。 | 400 bad-usage（非法路径或已初始化后更换真源）; 500 io-error |
| GET /api/settings | — | `{ ok, command: "settings", stateRoot, skillsRoot, layoutMode, stateDiskBytes, git, autoLaunch, silentTray, isDesktop }` | 503 store-not-configured |
| PATCH /api/settings | `{ gitEnabled?, autoLaunch?, silentTray? }`（仅布尔值） | 同 GET，配置原子写回。Git 启用行为同 `/api/git/toggle`。桌面模式同步登录项与托盘，系统拒绝时保留旧配置 | 400 bad-usage; 409 git-unavailable; 500 io-error; 503 store-not-configured |
| POST /api/store/migrate | `{ targetSkillsRoot, dryRun? }` | `{ ok, command: "store-migrate", paths, skills, movedLinks, aside, dryRun }` | 400 bad-usage; 409 conflict; 500 io-error; 503 store-not-configured |
| POST /api/doctor/prune | `{ dryRun? }` | `{ ok, command: "doctor-prune", count, pruned, dryRun }`，只修改台账 | 400 bad-usage; 503 store-not-configured |
| POST /api/verify/accept | `{ names?, dryRun? }` | `{ ok, command: "verify-accept", count, accepted, missing, dryRun }`，缺失项跳过 | 400 bad-usage; 404 not-found; 409 conflict; 503 store-not-configured |
| GET /api/reconcile/scan | — | `{ ok, command: "reconcile-scan", clientsScanned, managedLinks, unmanagedRealDirs, replacedLinks, newConflicts, externalSymlinks, danglingLinks, nonSkillEntries, scanDurationMs, scannedAt }` | 503 store-not-configured |
| POST /api/reconcile/preview | `{ includeExternalLinks? }` | `{ ok, command: "reconcile-preview", backupRequired, backupDir, skillsRoot, toAdopt, toRelinkIdentical, conflicts, skippedExternalLinks, untouchedNonSkill, danglingToPrune }`（只读） | 400 bad-usage; 503 store-not-configured |
| POST /api/reconcile/apply | JSON 对象 `{ includeExternalLinks? }` | `{ ok, command: "reconcile-apply", snapshotId, backupVerified, adoptedCount, relinkedCount, conflictCount, linksCreated, externalLinksAdopted, skippedExternalLinks, danglingPruned, failures }`。部分客户端失败由 `failures` 报告 | 400 bad-usage; 409 verify-failed; 500 io-error; 503 store-not-configured |
| GET /api/conflicts | — | `{ ok, command: "conflicts-list", conflicts }`。每项含真源哈希、各变体来源、`maxMtimeMs` 和 `shorterContentWarning` | 503 store-not-configured |
| GET /api/conflicts/:name/diff | `?a=&b=`（默认当前真源与首个异版） | `{ ok, command: "conflicts-diff", skillName, variantA, variantB, files, truncated }` | 400 bad-usage; 404 not-found; 503 |
| GET /api/conflicts/:name/file | 必填 `?variant=&path=`，`variant` 可为 `active` | `{ ok, command: "conflicts-file", variant, path, content, sizeBytes, binary: false }`。文本输出脱敏 | 400 outside\|bad-usage; 404 not-found; 422 binary\|too-large; 503 |
| POST /api/conflicts/:name/resolve | `{ mode: "pick", winnerVariantId }`、`{ mode: "merge", mergedFiles, deletePaths? }` 或 `{ mode: "split", variantId, newName }`，可附 `summary` | `{ ok, command: "conflicts-resolve", skillName, mode, activeHash, archives, remainingVariants, newSkill? }` | 400 outside\|bad-usage; 404 not-found; 409 conflict; 503 |
| POST /api/skills/:hash/enable | `{ clientId, scope? }` | `{ ok, command: "enable", clientId, scope, targetDir, created, removed }` | 400 bad-usage(缺 clientId); 404 not-found(客户端或 skill 不存在); 409 link-failed; 503 |
| POST /api/skills/:hash/disable | 同上 | `{ ok, command: "disable", ... }` | 同上 |
| POST /api/links/preview | `{ hashes, clientIds, action: enable\|disable, scope? }` | `{ ok, command: "links-preview", action, add, remove, conflictCount, wouldCreate, wouldRemove, conflicts }`(不写盘) | 400 bad-usage; 404 not-found; 503 |
| POST /api/links/apply | 同上 | `{ ok, command: "links-apply", action, created, removed }`(按落点各一次 applyLinkSet) | 400; 404; 409 link-failed(含 conflicts,未写盘); 503 |
| POST /api/skills/:hash/archive | —(无 body) | `{ ok, command: "archive", dirName, archiveFile, sizeBytes, removedLinks }` | 404 not-found; 409(归档失败); 503 |
| POST /api/skills/:hash/restore | —(无 body;:hash 为归档名) | `{ ok, command: "restore", dirName, hash, archiveFile }` | 404 not-found; 409 conflict; 500; 503 |
| POST /api/adopt | `{ source }`(本地路径或 GitHub / skills.sh URL) | `{ ok, command: "adopt", dryRun: false, storeRoot, adopted, duplicates, conflicts, invalid, fetchFailed, outcomes }` | 400 bad-usage; 502 github-fetch-failed; 503 |
| POST /api/drafts | `{ dirName, description? }` | description 非空:allocate+commit,`{ ok, command: "new", verb: "create", dirName, hash, storeDir }`; description 空:只 allocate,无 hash | 400 bad-usage; 409 draft-exists; 503 |
| POST /api/drafts/:dirName/commit | —(无 body) | `{ ok, command: "new", verb: "commit", dirName, hash }` | 404 draft-not-found; 400 draft-incomplete; 409 draft-exists; 503（#193:与 CLI `new commit` 同 code） |
| POST /api/drafts/:dirName/discard | —(无 body) | `{ ok, command: "new", verb: "discard", dirName, archivePath }` | 404 draft-not-found; 503（#193:与 CLI `new discard` 同 code） |
| PUT /api/skills/:hash/file?path= | JSON `{ content: string }` | `{ ok, command: "skill-file-save", dirName, path, hash }`（`hash` 为写回后的新内容哈希,同时同步四份元数据） | 400 bad-usage（缺 path / 缺 content）/ outside; 404; 422 too-large; 503 |
| POST /api/translate | `{ text, target?, path? }`（target/path 可省:纯文本翻译不落盘;两者都带时仅在流式正常完成且译文非空时写入译文缓存,失败/中止绝不缓存） | **SSE 流**（翻译专用:`event: delta` `{ text }` / `done` `{}` / `error` `{ code, message }`。底层走 AI SDK `streamText` + `result.fullStream` + 静默 `onError`,见 [ai-integration-v1.md](ai-integration-v1.md)） | 进流前:400 bad-usage / 413 too-large / 415 bad-usage; 未配置密钥或模型错误走流内 `error` |
| POST /api/agent/chat | `{ messages: UIMessage[], model?, writePolicy?: "ask"\|"allow" }`（经 `safeValidateUIMessages` 校验,见 [agent-v0.md](agent-v0.md)） | **AI SDK UI message stream**（`createAgentUIStreamResponse`,`sendReasoning: false`,`onError` 走 `mapLlmError`,含超时保护） | 400 bad-usage（非法消息结构 / 缺 messages / 含 system role）; **503 not-configured**（无 `QINIU_API_KEY`,进流前 JSON 信封） |
| POST /api/groups | `{ id, name?, description? }` | `{ ok, command: "group", verb: "create", id, name, description }` | 400 bad-usage; 409 group-exists; 503 |
| PATCH /api/groups/:id | `{ name?, description? }`(至少一项) | `{ ok, command: "group", verb: "rename", id, name, description }` | 400; 404 group-not-found; 503 |
| DELETE /api/groups/:id | — | `{ ok, command: "group", verb: "delete", id, memberCount }`(只删分组定义,不删 skill) | 404 group-not-found; 503 |
| POST /api/groups/:id/members | `{ hashes, action: add\|remove }` | `{ ok, command: "group", verb: "add"\|"remove", id, hashes, changed }` | 400; 404 group-not-found\|not-found; 503 |
| POST /api/analyze | `{ target }`(hash 前缀或 dirName) | `{ ok, command: "analyze", target, similar, conflict }`(只建议,不写盘) | 400 bad-usage; 404 not-found; 503 not-configured; 502 analyze-failed（底层 `invalid-response` 等编码写入 `message`） |
| POST /api/share | `{ target, repo? }`(hash 前缀或 dirName;repo 覆盖 manifest.trustedRepo) | `{ ok, command: "share", dirName, url, idempotent, dryRun }` | 400 bad-usage; 404 not-found; 409 remote-conflict; 503 auth-required(无 GITHUB_TOKEN); 502 github-push-failed |
| POST /api/backups/preview | `{ snapshotId? }` | `{ ok, command: "backups-preview", snapshotId, dryRun: true, clients, skills, files, links, wouldRestore, skippedOwnDirs, asideStore, asidePointer }`(不写盘) | 400; 404 not-found; 409 verify-failed; 503 |
| POST /api/reset | `{ snapshotId?, confirm: "reset" }` | `{ ok, command: "reset", storeRoot, snapshotId, asideStore, asidePointer, adopted }`(本请求内跑完还原,与 CLI `reset --json` 同形) | 400 bad-usage(缺确认短语); 404; 409 verify-failed\|restore-failed; 500 io-error; 503 |
| GET /api/git/status | — | `{ ok, command: "git-status", enabled, gitInstalled, gitVersion, ghInstalled, ghVersion, ghAuthenticated, ghUsername, initialized?, branch?, aheadCount?, dirtyCount?, remoteDiverged?, remoteUrl }` 及安装提示。库存未配置时仍可检测依赖 | 500 |
| POST /api/git/toggle | `{ enabled: boolean }` | `{ ok, command: "git-toggle", enabled }`。开启时初始化真源，关闭后保留版本仓 | 400; 409 git-unavailable; 503 |
| GET /api/git/log | `?skill=&limit=`（默认 30，最多 100） | `{ ok, command: "git-log", commits }`，每项含 `hash`、`shortHash`、`timestamp`、`author`、`message`、`filesChanged`、`insertions`、`deletions`。指定 `skill` 时只汇总该目录，二进制文件只计文件数 | 400; 409 git-unavailable; 503 |
| GET /api/git/diff | `?commit=<hash>&skill=` | `{ ok, command: "git-diff", commit, patch }`。按提交读取可选单技能的脱敏差异 | 400; 409 git-unavailable; 503 |
| POST /api/git/gh/login/start | `{}` | `{ ok, command: "gh-login-start", sessionId, userCode, verificationUri, status: "pending", expiresAt }` | 502 gh-login-failed; 503 git-unavailable |
| GET /api/git/gh/login/status | `?sessionId=` | `{ ok, command: "gh-login-status", sessionId, status, authenticated, username, error, expiresAt }`。内存会话状态为 pending、authenticated、expired 或 error | 404 not-found |
| POST /api/git/cloud/setup | `{ repoName, visibility: "private"\|"public", confirmPublicSecrets? }` | `{ ok, command: "git-cloud-init", remoteUrl }`。公开预检当前文件和历史补丁，疑似密钥命中会在 409 中返回脱敏 `findings` | 409 secret-detected\|remote-conflict; 502; 503 auth-required |
| POST /api/git/cloud/push | `{}` | `{ ok, command: "git-cloud-push", remoteUrl }`。校验 origin，使用非强制推送 | 409 remote-diverged\|remote-conflict; 502; 503 |

- `:hash` 与 CLI 共用 `resolveSkill`:dirName 精确,否则唯一哈希前缀;0 命中 404 not-found;前缀不唯一 400 bad-usage
- `SkillFileEntry`:`{ path, kind: "file"|"dir", sizeBytes }`
- `scope`:global(默认,home 下)/ project(cwd 下),与 cli-commands-v0.md §2 一致
- 写操作复用同一套 perform*:链接 `performLinkChange` / `previewLinkChange`,分组 `performCreateGroup` / `performUpdateGroup` / `performDeleteGroup` / `performGroupMembers`,草稿 `performAllocate` / `performCreate` / `performCommit` / `performDiscard`,初始化 `performInit`（与 CLI 同一实现,行为不漂移）
- unregistered-conflict(落点被用户目录占据)与 not-link-conflict 以 409 + link-failed 返回,message 给出人工处理指引,绝不覆盖
- `/api/translate`、`/api/agent/chat` 与 `/api/store/init` 不受 `withStore` 守卫;库存未配置时 Agent 仍可对话(工具返回可读文本),前端可经 `/api/store/init` 在 UI 内完成引导初始化
- Agent 流契约与翻译 SSE 分离:Agent 走 AI SDK UI message stream,翻译仍用 delta/done/error（#216）

## 4. HTTP 状态码映射

| code | HTTP | 说明 |
| --- | --- | --- |
| bad-usage | 400 / 415 | 400:参数缺失或非法、消息结构无效; 415:写请求携带非空 body 但非 `application/json` |
| outside | 400 | 相对路径越出允许目录 |
| draft-incomplete | 400 | 定稿时 `SKILL.md` 缺 `name` 或 `description` |
| forbidden | 403 | 本机安全中间件拦截非法 `Host` 或跨站写 `Origin` |
| not-found | 404 | skill / 客户端 / 快照 / 归档 / 未知 `/api/*` 路由 |
| group-not-found | 404 | 分组不存在 |
| draft-not-found | 404 | 草稿不存在 |
| translation-not-found | 404 | 指定 skill/path 的译文缓存未命中 |
| link-failed | 409 | 链接切换冲突或失败（含 `unregistered-conflict` / `not-link-conflict`） |
| conflict | 409 | 归档恢复同名内容冲突 |
| group-exists | 409 | 分组重复创建 |
| draft-exists | 409 | 草稿占名或定稿重名冲突 |
| remote-conflict | 409 | share 远端已有同名不同内容 |
| verify-failed | 409 | 备份快照校验失败 |
| restore-failed | 409 | 备份还原或 reset 写回客户端失败 |
| too-large | 413 / 422 | 413:HTTP 请求体超过安全上限（2 MB）; 422:skill 文本读写超过 `MAX_FILE_BYTES` |
| binary | 422 | 二进制文件禁止按文本读取 |
| io-error | 500 | 文件系统或未捕获全局异常（已脱敏） |
| github-fetch-failed | 502 | adopt 拉取 GitHub / skills.sh 失败 |
| analyze-failed | 502 | 相近/冲突分析调用失败（含底层 `invalid-response` / `timeout` / `network` / `api` 收拢） |
| invalid-response | 502 | `mapLlmError` 对不可解析 JSON/Schema 结构的内部映射（`STATUS_BY_CODE` 预留 502;`POST /api/analyze` 当前以顶层 `analyze-failed` 返回并将 `(invalid-response)` 附入 `message`） |
| github-push-failed | 502 | share 推送被 GitHub 拒绝或失败 |
| store-not-configured | 503 | 库存未配置（`withStore` 守卫） |
| not-configured | 503 | 缺少 `QINIU_API_KEY` |
| auth-required | 503 | `POST /api/share` 缺 `GITHUB_TOKEN` 或 `gh` 未登录 |
| git-unavailable | 409 / 503 | 本机未安装 Git 或 GitHub CLI |
| gh-login-failed | 502 | GitHub CLI 设备登录启动失败 |
| secret-detected | 409 | 公开云端仓库推送前敏感密钥预检命中风险（v0.3 预留） |
| remote-diverged | 409 | 远端备份仓库存在本地未拉取提交，拒绝强推（v0.3 预留） |

> 注:`auth-required` 在 HTTP 侧专用于 `POST /api/share` 缺 `GITHUB_TOKEN`（503）,在 CLI 侧还用于非交互写操作缺 `--yes`（exit 2）;`group-empty` / `invalid-skill` 仅在 CLI 命令层出现。

## 5. 测试

`packages/cli/test/http-api.test.ts`:`createUiApp` 注入沙箱 `storeRoot`/`home`,`app.request()` 直测(不占真实端口),覆盖信封形状、安全中间件（403 Host/Origin、415 `text/plain`、413 超限、404 JSON `/api/*`、404 缺失 `/assets/*`）、`POST /api/store/init`、origins/visibleIn 分离、写端点成功与结构化失败、links preview/apply、分组 CRUD、`/api/drafts*`、翻译流与缓存铁律、Agent `onError` 与消息校验、analyze 只读建议、verify/doctor 只读报告、503 未配置。
