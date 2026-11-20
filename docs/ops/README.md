# docs/ops/

运维与操作指南。

## 用途

存放本地运行、环境配置、CI 治理与运维相关的操作文档，包括：
- 本地运行教程（环境搭建、开发服务器启动、桌面端打包验证）
- 环境配置指南（Node ≥22、pnpm、`.env` / `~/.skills-hub/.env` 环境变量配置）
- 无人值守执行规范与故障排查指南

## 现有文档

- [goal-mode-prompt.md](./goal-mode-prompt.md) — *阶段性执行档案*（批 7–11 无人值守模式提示词与事实核验记录）

## 相关治理与环境配置

- 环境变量模板：[`.env.example`](../../.env.example)（配置 `QINIU_API_KEY`、`GITHUB_TOKEN`、`SKILLS_HUB_HOME`）
- CI 工作流：[ci.yml](../../.github/workflows/ci.yml)（Ubuntu/Windows 双平台四检 + Chrome 冒烟强制门禁）
- 测试与安全规范：[testing-and-security.md](../conventions/testing-and-security.md) · [pr-and-git-workflow.md](../conventions/pr-and-git-workflow.md)

## 文件命名

- `local-setup.md` — 本地环境搭建
- `env-config.md` — 环境变量配置
- `troubleshooting.md` — 故障排查
