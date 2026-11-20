# docs/specs/

技术规格说明。

## 用途

存放功能和技术规格文档，各模块的唯一实现口径：
- 功能规格（库存布局、CLI 命令面、Agent 工具与审批）
- API 规格（HTTP 端点、JSON 契约）
- 外部 AI 服务集成规格

## 现有文档

- [store-and-paths-v0.md](./store-and-paths-v0.md) — 库存位置、目录布局（含 `backups/` / `translations/` / `archive/`）、客户端发现规则与沙箱边界
- [cli-commands-v0.md](./cli-commands-v0.md) — CLI 命令面、授权分级与渐进式披露机制
- [http-api-v0.md](./http-api-v0.md) — 本地 HTTP 服务全部端点、安全中间件与状态码映射
- [json-contract-v0.md](./json-contract-v0.md) — `--json` 输出信封、各命令字段形状、错误 code 与退出码 `0|1|2`
- [ai-integration-v1.md](./ai-integration-v1.md) — 七牛云聚合推理集成（Vercel AI SDK v7、`enable_thinking: false`、流式与错误脱敏）
- [agent-v0.md](./agent-v0.md) — 面板内对话式库存管家（一等工具、`writePolicy`、UI message stream）
- [single-source-sync-and-versioning/](./single-source-sync-and-versioning/PRD.md) — v0.3 单一真源纯软链接接管、冲突解决中心、开机巡检与 Git 云端备份详细 PRD 与 [task.md](./single-source-sync-and-versioning/task.md)
- [deepseek-integration-v0.md](./deepseek-integration-v0.md) — *历史归档*（已被 [ai-integration-v1.md](./ai-integration-v1.md) 取代）

## 文档结构模板

```markdown
# [Spec Name]

> Created: YYYY-MM-DD
> Updated: YYYY-MM-DD
> Status: draft | review | approved

## 背景
[为什么需要这个规格]

## 目标
[要达成什么]

## 方案
[具体技术方案]

## 风险
[潜在风险与应对]
```
