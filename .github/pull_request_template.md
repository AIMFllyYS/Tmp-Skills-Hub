## 变更摘要

<!-- 简述本 PR 解决的问题、改动范围及关键实现说明。若新增依赖，请在此说明理由（遵循 AGENTS.md 与 plan-batches-v1.md）。 -->

Closes #

## 所属系统分块（architecture-initial-spec §2 / §7）

- [ ] Block A：库存与镜像层（`packages/core`、`packages/cli` 确定性动作）
- [ ] Block B：App 壳 / 桌面壳（`apps/web`、`apps/desktop`、HTTP `/api`）
- [ ] Block C：分享层（授信仓库 `share` / `adopt`）
- [ ] Block D：社区与统计层（账号 / 主页 / 排行）
- [ ] Docs / Ops / CI（跨分块治理与文档）

## 依赖方向与契约一致性

- [ ] 单向依赖未破坏：`apps/desktop -> packages/cli -> packages/core`，`apps/web -> (HTTP /api) -> packages/cli -> packages/core`
- [ ] `packages/core` 未引入框架、网络请求、`child_process` 或 `console.*`
- [ ] `apps/web` 未直接 import `@skills-hub/core` 或 `@skills-hub/cli`
- [ ] 如变更了 CLI `--json` / HTTP `/api` / 工具面，已同步更新对应契约文档与测试

## 安全、沙箱与文档同步

- [ ] 未向真实用户客户端目录（`~/.claude`、`~/.codex`、`~/.agents`、`~/.gemini` 等）写入或移动文件，写测试仅使用沙箱 `--home` / 临时目录
- [ ] 未提交 `.env*` 或硬编码任何密钥（`QINIU_API_KEY`、`GITHUB_TOKEN` 等），异常日志与前端响应已做脱敏
- [ ] 不存在真删除路径（所有移除走 `archive` / `archive/drafts/` / `.pre-reinit` 旁路）
- [ ] 已同步更新相关规范（`docs/specs/`、`docs/conventions/`、`AGENTS.md` 等）

## 验证清单

- [ ] `pnpm lint` 通过
- [ ] `pnpm typecheck` 通过（含 `tsconfig.test.json`）
- [ ] `pnpm build` 通过
- [ ] `pnpm test` 通过
- [ ] 涉及面板改动时已运行 `pnpm smoke`（CI 跑 `--require-chrome`）
- [ ] 本地沙箱 `--home` 验证结果（附命令与实测摘要）：
