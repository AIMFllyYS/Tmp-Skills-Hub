# Agent v0——面板内对话式库存管家

> 状态:生效 | AI 调用口径见 [ai-integration-v1.md](ai-integration-v1.md);HTTP 端点登记见 [http-api-v0.md](http-api-v0.md)

## 1. 定位

面板内的对话式 Agent,通过工具调用操作本机 skills-hub 库存。服务端无状态:前端每轮请求携带全量对话历史,服务端不保存会话。

## 2. 执行环境

与 ui-server 同一 home / storeRoot(真实库存),不做会话沙箱。安全由 CLI 本身的铁律兜底(软删除、原子切换、库存不可变)。库存未配置时 Agent 仍可对话,工具返回「库存未配置」文本。

## 3. 工具面(两个)

| 工具 | 参数 | 行为 |
| --- | --- | --- |
| `run_cli` | `{ args: string[] }` | 执行 `skills-hub <args>`;服务端统一追加 `--home <home>`;禁止子命令 `ui` / `bootstrap` / `reset`;禁止模型自带 `--home`;超时 60s;stdout+stderr 合并截断 24000 字符 |
| `read_skill_file` | `{ target: string, path: string }` | 读库存中某 skill 的文件;target 为 dirName 或唯一 hash 前缀(与 `resolveSkill` 同口径),path 为 skill 内相对路径;内容截断 24000 字符 |

工具执行的一切失败都以 `{ ok: false, output: "原因" }` 文本回给模型,绝不抛异常中断对话循环。

## 4. SSE 事件契约(translate 与 agent/chat 共用帧格式)

每帧 `event: <name>\ndata: <JSON>\n\n`:

| event | data | 说明 |
| --- | --- | --- |
| `delta` | `{ text: string }` | 正文 Markdown 增量 |
| `tool_call` | `{ callId, name, args }` | args 为 JSON 字符串;工具开始执行 |
| `tool_result` | `{ callId, ok, output, durationMs }` | 工具执行完毕 |
| `done` | translate:`{}`;agent/chat:`{ messages: WireMessage[] }` | 本轮结束;agent/chat 携带结束后的全量对话(不含 system),前端以此替换本地 wire |
| `error` | `{ code, message }` | 发出后流结束 |

进流前的 HTTP 失败仍是 JSON 信封(400 bad-usage;503 not-configured 仅 agent/chat——translate 的 not-configured 走流内 error)。

## 5. WireMessage(OpenAI 格式子集)

```ts
{ role: "user" | "assistant" | "tool",
  content: string | null,
  tool_calls?: { id, type: "function", function: { name, arguments } }[],
  tool_call_id?: string }
```

system 由服务端注入,前端不发送;请求中出现 `role: "system"` 直接 400。

## 6. 循环上限

单轮请求最多 15 次模型调用;超限发 `error`(code `agent-loop-limit`)。

## 7. 模型白名单

`packages/cli/src/agent/models.ts` 的 `AGENT_MODELS` 常量:默认 `deepseek/deepseek-v4-flash-20260731`(用户指定),另列能力旗舰 / 编程强 / 最便宜三档。`model` 参数不在白名单时回落默认模型。白名单 ID 以七牛云 `/v1/models` 实际返回为准校准。

## 8. 输出契约(系统提示词承诺)

- 正文一律简体中文 Markdown 流式输出;调用工具时不额外解释格式(前端渲染工具卡片)。
- 先查再动:不确定库存状态时先 list/show/scan 查询。
- 破坏性操作(archive、批量 disable、含 `--yes` 的写操作)必须先向用户说明影响并得到明确同意再执行。
- 工具返回 ok:false 时如实转述错误,不编造结果。
- 收录用户已有 skill 前必须明确告知并获得授权(产品红线)。
