# scripts/

项目脚本目录，存放开发、构建、环境初始化等各类辅助脚本。

## 目录结构

| 目录 | 用途 |
|---|---|
| [`setup/`](./setup/) | 环境初始化、依赖安装、配置生成 |
| [`build/`](./build/) | 构建辅助、产物检查、bundle 分析 |
| [`dev/`](./dev/) | 开发辅助工具、mock 数据生成、调试脚本 |
| [`smoke-panel.mjs`](./smoke-panel.mjs) | 面板真机冒烟（Chrome CDP；`pnpm smoke`） |

## 脚本规范

- Shell 脚本使用 `.sh` 后缀，Node 脚本使用 `.mjs` 或 `.ts` 后缀
- 脚本文件名使用 kebab-case（如 `check-bundle-size.sh`）
- 每个脚本开头用注释说明用途、参数、退出码含义
- 脚本应支持 `--help` 参数或包含使用说明注释
- 危险操作（删除、覆盖）前必须确认提示
