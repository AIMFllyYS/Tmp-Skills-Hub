# HTTP 服务、安全与前端路由规范

> Created: 2026-11-20
> Updated: 2026-11-20
> Status: accepted
> 适用范围：`packages/cli` 本地 HTTP 服务（`ui-server.ts` / `ui-*.ts`）与 `apps/web` SPA（含 Electron 桌面壳内嵌访问）
> 端点明细见 [http-api-v0.md](../specs/http-api-v0.md)；JSON 信封见 [json-contract-v0.md](../specs/json-contract-v0.md)

## 一、Hono API 路由与动词约定

1. **绑定与装配入口**：本地服务由 `packages/cli/src/ui-server.ts` 中的 `createUiApp()` 创建 Hono 实例，默认只绑定 `127.0.0.1`（默认端口 `4321`，支持 `port: 0` 动态端口供测试与 Electron 桌面壳使用）。
2. **模块化拆分**：路由按领域拆入 `ui-groups.ts`、`ui-drafts.ts`、`ui-content.ts`、`ui-links.ts`，共享信封与上下文守卫收口在 `ui-http.ts`（`err`、`withStore`、`skillLookupErr`、`STATUS_BY_CODE`）。
3. **REST 资源与子资源动词**：
   - 资源集合与详情使用复数名词 `GET`（`/api/skills`、`/api/skills/:hash`、`/api/groups`、`/api/drafts`、`/api/backups`、`/api/clients`）。
   - 领域动作使用子资源动词 `POST`（如 `/api/skills/:hash/enable`、`/api/skills/:hash/archive`、`/api/links/apply`、`/api/store/init`、`/api/reset`）。
   - 文件内容读取与编辑写回使用 `GET / PUT /api/skills/:hash/file?path=`；不引入多套平行路径格式。
   - **单一业务真源**：HTTP 写操作直接复用与 CLI 相同的 `perform*` 与 `packages/core` 函数，严禁在路由层重写一套文件系统逻辑。

## 二、请求校验、大小上限与统一信封

1. **输入校验**：
   - JSON 解析失败、缺少必填字段或参数非法 → 返回 `400` + `code: "bad-usage"`。
   - 相对路径越出 skill / translation 目录或含 NUL 字节 → 返回 `400` + `code: "outside"`（或 `bad-usage`）。
   - `/api/agent/chat` 必须使用 AI SDK `safeValidateUIMessages` 校验请求消息数组且拒绝 `role: "system"`，校验失败返回 `400` + `code: "bad-usage"`，避免进入模型调用后抛出 500。
2. **请求体大小上限**：写端点统一受请求体大小上限保护（默认 `2 MB`），超限请求在解析前拒绝并返回 `413` + `code: "too-large"` JSON 信封。
3. **统一信封与状态码**：
   - 成功：`{ ok: true, command: "<name>", ... }`
   - 失败：`{ ok: false, command: "<name>", code: "<enum>", message: "<可读中文说明>" }`
   - 全局兜底：`app.onError()` 捕获未处理异常并返回脱敏后的 `500` `io-error` JSON 信封（绝不泄露栈追踪或密钥）；所有未匹配的 `/api/*` 路由统一返回 `404` `not-found` JSON 信封，**禁止**被 SPA fallback 吞掉；缺失的 `/assets/*` 静态文件返回 `404`，不再回退 `200` 提示页。
4. **动态 `storeRoot`**：`UiRouteContext` 中的 `storeRoot` 可随 `POST /api/store/init` 初始化成功后更新，路由处理器一律从 `ctx.storeRoot` 读取最新库存根，不在注册期闭包固化初始 `null`。

## 三、本机安全基线（Host / Origin / Content-Type / XSS）

即使仅监听 `127.0.0.1`，本地服务仍需防御恶意网页通过浏览器发起的 DNS Rebinding、跨站简单请求（CSRF）及 Markdown 储存型 XSS：

| 防线 | 规则 | 拦截响应 |
|---|---|---|
| **Host 白名单** | 所有 `/api/*` 请求校验 `Host` 头，仅允许 `127.0.0.1`、`localhost`、`[::1]`（可带端口）及桌面端受控主机名 `skills-hub` | `403` `forbidden` JSON |
| **写请求 Origin 校验** | `POST` / `PUT` / `PATCH` / `DELETE` 若携带 `Origin` 头，只允许 `http://127.0.0.1(:port)`、`http://localhost(:port)`、`http://[::1](:port)`、`app://skills-hub`（同机 CLI/Node 无 `Origin` 放行） | `403` `forbidden` JSON |
| **写请求 Content-Type 校验** | `POST` / `PUT` / `PATCH` 携带非空请求体时，强制要求 `application/json`，阻断浏览器 `text/plain` / `form-urlencoded` 跨站简单请求；无请求体的命令（如 `POST /api/skills/:hash/archive`）放行 | `415` `bad-usage` JSON |
| **Markdown XSS 净化** | 前端所有 Markdown 渲染（`apps/web/src/lib/markdown.ts`：`SKILL.md` 预览、Agent 回复）在 `marked.parse()` 之后**必须**经 `DOMPurify.sanitize()` 清洗，剥离 `<script>`、内联 `on*` 事件和危险协议（`javascript:` / `vbscript:` / `data:text/html`），外部链接补 `target="_blank" rel="noopener noreferrer"` | 渲染期阻断 |

## 四、两条流式协议分离（翻译 SSE vs Agent UI Stream）

1. **翻译流（`POST /api/translate`）**：
   - 使用轻量专用 SSE：`event: delta` `{ text }`、`event: done` `{}`、`event: error` `{ code, message }`。
   - 服务端走 AI SDK `streamText` 并消费 `result.fullStream`（传静默 `onError`），显式处理流内 `"error"` 与 `"abort"`；**只有正常结束且译文非空时才写入 `translations/` 缓存**，失败、中止或空结果绝不落盘。
   - 前端通过 `AbortController` 控制请求生命周期，切换 skill、切换文件或卸载组件时立即中止旧流。
2. **Agent 流（`POST /api/agent/chat`）**：
   - 使用 AI SDK UI Message Stream（`createAgentUIStreamResponse` + `x-vercel-ai-ui-message-stream`），由前端 `@ai-sdk/react` 的 `useChat` 消费。
   - 必须设置 `sendReasoning: false`、`onError`（经 `mapLlmError` 脱敏转写中文提示）与超时保护；缺密钥时在建流前返回 `503` `not-configured` JSON 信封。
   - 两条协议各自独立，不再共用帧格式（见 [ai-integration-v1.md](../specs/ai-integration-v1.md)）。

## 五、Web SPA 路由、加载与渐进式水合规则

1. **首屏零白屏骨架（#205）**：`apps/web/index.html` 在 `#root` 内提供纯灰阶 CSS 壳骨架（匹配侧栏 + 主区结构并响应 `prefers-reduced-motion: reduce`），在 React 挂载前即时可见。
2. **页面懒加载与异常隔离**：
   - 主区二级页面与弹层（`StatsPage`、`SkillsPage`、`AgentPage`、`SettingsDialog`）使用 `React.lazy()` + `<Suspense fallback={<PageSkeleton />}>`，并配合 Vite 分包控制单 chunk 体积（构建不允许出现 `> 500 kB` 告警）。
   - 应用外层包裹 `ErrorBoundary` 提供可控重试入口，防止单个视图渲染异常导致整页崩溃。
3. **渐进式水合与未配置引导**：
   - 取消阻塞全壳的 7 路 `Promise.all` 门禁：以 `/api/skills` 与 `/api/clients` 为首屏关键路径优先就绪；`stats`、`archive`、`doctor`、`backups`、`groups` 等辅助切片并行独立水合，局部未就绪时用 `<Skeleton />` 占位。
   - 严格区分「服务端离线（`offline`）」与「库存未配置（`503 store-not-configured`）」：库存未配置时允许用户点击初始化引导卡（触发 `POST /api/store/init`），同时保持 **Agent 页可正常进入对话**。
4. **统一请求层 `apiRequest`**：
   - 所有 `apps/web` API 调用收口至统一 `apiRequest` helper（或基于其上的 SSE 包装），统一处理 JSON 解析、结构化错误提取（保留 `code`）与路径参数 `encodeURIComponent()` 编码。
   - 错误反馈严格遵循 [ui-design-v1.md](./ui-design-v1.md) §9：统一走 Toast 通道，不在同一页面同时堆叠内联红框与 Toast。
