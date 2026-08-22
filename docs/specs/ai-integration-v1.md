# AI 集成 v1——七牛云推理服务

> 状态:生效 | 取代 [deepseek-integration-v0.md](deepseek-integration-v0.md)
> 修订理由:供应商从 DeepSeek 官方切换为七牛云聚合推理——统一多模型入口、更便宜、支持 `enable_thinking` 开关、流式与工具调用(function calling),满足翻译流式化与新增 Agent 模块的需求。

## 1. 事实清单

| 项 | 值 |
| --- | --- |
| 端点 | `POST {QINIU_BASE_URL:-https://api.qnaigc.com/v1}/chat/completions`(OpenAI 兼容格式) |
| 认证 | `Authorization: Bearer <QINIU_API_KEY>` |
| 默认模型 | `deepseek/deepseek-v4-flash-20260731`;`QINIU_MODEL` 环境变量可覆盖(只影响翻译/分析的缺省模型) |
| Agent 模型 | 白名单制,见 [agent-v0.md](agent-v0.md) §7 |
| 请求体(非流式) | `{ model, messages, stream: false, enable_thinking: false }` |
| 请求体(流式) | `{ model, messages, stream: true, enable_thinking: false, tools? }`;SSE,`data: [DONE]` 收尾 |
| 思考开关 | 翻译/分析/Agent 一律 `enable_thinking: false`(直接输出,不深度思考);供应商仍可能发 `delta.reasoning_content`,客户端忽略该字段 |
| 超时 | 非流式总超时(封装默认 30s);流式为空闲超时(每收到 chunk 重置 60s) |
| 错误码 | 400 格式 / 401 认证 / 402 余额 / 422 参数 / 429 限流 / 500 服务端 / 503 过载 |

## 2. 密钥铁律(沿用 v0)

- 密钥只从环境变量读取(`QINIU_API_KEY`),`.env` 仅作为把变量放进进程环境的方式(启动时 `loadEnvFile` 载入,不覆盖已有环境变量)
- 密钥绝不写入:源码、日志、任何发往前端的响应;错误提示只给原因不给 key
- 未配置密钥 → `not-configured` 可读提示(功能不可用但不崩溃、不静默)
- 失败分类:not-configured / timeout / network / api(错误码中文提示表沿用 v0,401 提示指向 `QINIU_API_KEY`)

## 3. 边界

- 调用封装在 `packages/cli/src/llm.ts`(外部调用属于 cli,core 禁止网络访问——project-structure §2)
- 两个出口:`chatCompletion`(非流式,分析用)与 `chatCompletionStream`(async generator,翻译与 Agent 用)
- 测试用 fetch 替身隔离,不触达真实网络;密钥不出现在测试断言文本里
