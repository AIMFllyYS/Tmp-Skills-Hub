# AI 集成 v1——七牛云推理服务

> 状态:生效 | 取代 [deepseek-integration-v0.md](deepseek-integration-v0.md)
> 修订理由:供应商从 DeepSeek 官方切换为七牛云聚合推理——统一多模型入口、更便宜、支持 `enable_thinking` 开关、流式与工具调用(function calling),满足翻译流式化与新增 Agent 模块的需求。
>
> **#216 修订（2026-08-24）**：调用封装从自制 `chatCompletion` / `chatCompletionStream`(手写 OpenAI SSE 与 tool_calls 累积)改为 Vercel AI SDK。七牛云仍是唯一供应商;密钥铁律不变。
> **2026-11-20 修订（AI SDK v7 迁移对齐）**：升级为 `ai@7` / `@ai-sdk/openai-compatible@3` / `@ai-sdk/react@4`；补齐 `result.fullStream` 翻译流错误处理与缓存门禁、`analyze` `"JSON"` 提示词约束、`RetryError` 解包、`TimeoutError`/`AbortError` 分离、`invalid-response` 映射与凭据字面量脱敏。

## 1. 事实清单

| 项 | 值 |
| --- | --- |
| 端点 | `{QINIU_BASE_URL:-https://api.qnaigc.com/v1}`(OpenAI 兼容 `/chat/completions`) |
| 认证 | `Authorization: Bearer <QINIU_API_KEY>` |
| 默认模型 | `deepseek/deepseek-v4-flash-20260731`;`QINIU_MODEL` 环境变量可覆盖(只影响翻译/分析的缺省模型) |
| Agent 模型 | 白名单制,见 [agent-v0.md](agent-v0.md) §6 |
| SDK | Vercel AI SDK v7（`ai@7` + `@ai-sdk/openai-compatible@3` + `@ai-sdk/react@4`）;provider 名 `qiniu` |
| 思考开关 | 翻译/分析/Agent 一律 `enable_thinking: false`(经 `transformRequestBody` 注入);供应商仍可能发 reasoning 字段,服务端流显式设置 `sendReasoning: false` 且客户端忽略 |
| Agent | `ToolLoopAgent` + `createAgentUIStreamResponse`;`stopWhen: stepCountIs(15)`、`safeValidateUIMessages`、`onError`（`mapLlmError`）、`sendReasoning: false`、超时保护 |
| 翻译 | `streamText` + 迭代 `result.fullStream`（传静默 `onError`）;显式处理 `"error"` 与 `"abort"` 分片;HTTP 发翻译专用 `delta/done/error`,且**仅在正常完成且译文非空时写入 `translations/` 缓存** |
| 分析 | `generateText` + `Output.object({ schema })`;由于 OpenAI 兼容 JSON mode + `enable_thinking: false` 约束,系统与用户提示词**必须**包含显式 `"JSON"` 关键词与目标 Schema 结构说明;`runAnalyze` 保留 `not-configured` 失败码,失败绝不编造结论 |
| 错误码 | 400 格式 / 401 认证 / 402 余额 / 422 参数 / 429 限流 / 500 服务端 / 503 过载 |

## 2. 密钥铁律与错误映射

- **环境变量与 `.env` 加载**:密钥只从环境变量读取（`QINIU_API_KEY`）。`loadEnvFile()` 优先加载当前工作目录 `.env`,并回落 `~/.skills-hub/.env`;只填充进程尚无的键,**绝不覆盖已有环境变量**。
- **凭据脱敏**:密钥绝不写入源码、日志或任何发往前端的响应。`packages/cli/src/llm/errors.ts` 的 `scrub()` 同时遮蔽 `sk-*` 模式及非空 `process.env.QINIU_API_KEY` / `process.env.GITHUB_TOKEN` 字面量（替换为 `[redacted]`）。
- **未配置密钥**:返回 `not-configured` 可读提示（功能不可用但不崩溃、不静默）。Agent 在建流前返回 HTTP `503` JSON;分析在 CLI 保留 `not-configured`（退出码 2）并在 HTTP 返回 `503`;翻译在流内发 `error` 事件。
- **统一失败分类（`mapLlmError`）**:
  - 先用 `RetryError.isInstance(err)` 解包 `err.lastError`,再判定 `APICallError.isInstance(...)`,确保重试耗尽后的 429 / 500 / 503 仍命中中文错误提示（`api`）;
  - 区分 `TimeoutError`（`timeout`）与 `AbortError`（`aborted`）,不再把用户主动取消吞并成超时;
  - 将 `NoObjectGeneratedError`、`JSONParseError`、`TypeValidationError` 映射为 `invalid-response`（HTTP `502` / CLI 退出码 2）;
  - 其余网络异常映射为 `network`（经 `scrub()` 脱敏）。

## 3. 边界

- 调用封装在 `packages/cli/src/llm/`(外部调用属于 cli,core 禁止网络访问——project-structure §2)
- 三个出口:`streamText`(翻译)、`generateText`+`Output.object`(分析)、`ToolLoopAgent`(Agent)
- 测试用 `MockLanguageModelV3` 等 `LanguageModel` 替身隔离,不触达真实网络;密钥不出现在测试断言文本里
- web 只通过 `/api` 消费,可依赖 `@ai-sdk/react` 与 `ai` 的 UI 类型,**不得** import `@ai-sdk/openai-compatible` 或 cli 的 provider
