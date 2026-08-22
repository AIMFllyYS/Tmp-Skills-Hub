# scripts/dev/

开发辅助脚本。

## 用途

存放开发过程中的辅助工具脚本，包括：
- Mock 数据生成
- 调试工具
- 代码生成器
- 开发服务器辅助配置
- 一键启动脚本

## 一键启动

`start.ps1` / `start.sh` 把「环境检查 → 安装依赖 → 构建全仓 → `skills-hub bootstrap`」串成一条命令。

### Windows (PowerShell)

```powershell
# 首次运行：全自动安装、构建、备份、收录本机 skills 并启动面板
.\scripts\dev\start.ps1

# 指定沙箱目录与端口（不伤真机）
.\scripts\dev\start.ps1 -Home D:\tmp\skill-hub-sandbox -Port 4322 -Yes

# 跳过 install，只 build + 启动
.\scripts\dev\start.ps1 -SkipInstall
```

### Linux / macOS / Git Bash

```bash
./scripts/dev/start.sh
./scripts/dev/start.sh --home /tmp/skill-hub-sandbox --port 4322 --yes
./scripts/dev/start.sh --skip-install
```

### 参数说明

| 参数 | 说明 |
|---|---|
| `-Home` / `--home` | 库存基座目录，默认 `~/.skills-hub` |
| `-Port` / `--port` | 本地面板端口，默认 `4321` |
| `-Yes` / `--yes` | 非交互环境显式授权全部写操作 |
| `-SkipInstall` / `--skip-install` | 跳过 `pnpm install`，只执行 build + bootstrap |
| `-Help` / `--help` | 显示帮助 |

> 脚本幂等：第二次运行时，若指针文件已存在，`bootstrap` 会直接启动面板，不再重复备份/收录。
