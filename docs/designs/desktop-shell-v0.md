# 桌面端外壳设计（v0）：Electron 封装方案

> Created: 2026-11-20
> Updated: 2026-11-20
> Status: accepted
> Source: [architecture-initial-spec.md](./architecture-initial-spec.md) §1 · [tech-stack-decision.md](./tech-stack-decision.md) · [app-shell-v2.md](./app-shell-v2.md)

## 一、问题陈述与架构三问开场

随着 Web 人用壳（`apps/web`）与本地 CLI 服务（`packages/cli`）功能完整，社团非终端重度成员希望「双击桌面图标直接打开」，而不必每次手动启动终端运行 `skills-hub ui`、排查 Node 版本或手动打开浏览器。

按 [architecture-initial-spec.md](./architecture-initial-spec.md) §1.1 的**三问开场**先校准定位：

1. **服务谁？** —— 社团成员（人）。需要零终端门槛的一键桌面打开体验；同时不能破坏 AI Agent 与脚本继续通过 `skills-hub` CLI 调用的能力。
2. **管什么资产？** —— 依然是 **Skill**（文件夹）与客户端链接集合；桌面端不定义任何新资产类型。
3. **CRUD 在哪？** —— 桌面端本身**不实现业务逻辑与文件系统 CRUD**。全部存储、哈希、链接、备份、AI 调用与 `/api/*` 契约仍留在 `packages/core` 与 `packages/cli` 中。

## 二、方案对比：Electron vs Tauri

依据 [architecture-initial-spec.md](./architecture-initial-spec.md) §1.2（决策甬道）与 [tech-stack-decision.md](./tech-stack-decision.md)，桌面封装仅评估两条主流路线：

| 对比维度 | 方案 A：Electron（`apps/desktop`） | 方案 B：Tauri（Rust 主进程） |
|---|---|---|
| **内核复用** | 主进程直接运行 Node.js ≥22，进程内调用 `packages/cli` 导出的编程接口（`createUiApp` / `startUiServer`），100% 复用既有 `core` + `cli` TS 代码 | 要么用 Rust 重写 `core` + `cli`（双语言逻辑漂移，直接违背 [tech-stack-decision.md](./tech-stack-decision.md) §2.2），要么打包 Node sidecar 二进制并通过 stdout/HTTP IPC 通信 |
| **进程与生命周期** | 单进程托管 Hono 本地服务，窗口关闭即可干净关闭服务，无孤儿 sidecar 进程风险 | sidecar 需自行管理子进程生命周期、异常退出回收、Windows 杀软拦截与跨平台二进制打包 |
| **渲染一致性** | 内置固定版本 Chromium，不依赖用户本机是否安装 Chrome 或 WebView2 运行时，彻底消除跨环境 CSS/JS 兼容差异 | 依赖系统 WebView2 / WebKit，跨平台渲染与现代 CSS 特性需额外兜底测试 |
| **安装体积与资源** | 包体约 90–120 MB（社团内部分发可接受） | 包体小（~10 MB），但在本场景下无法抵消 sidecar 与双技术栈维护成本 |
| **构建工具链** | 全仓统一 TypeScript + `esbuild` + `electron-builder`，零新增语言工具链 | 需引入 Rust toolchain + Cargo 构建矩阵，大幅提高 CI 与成员贡献门槛 |

## 三、最终决策与依赖 DAG

采用 **Electron（`apps/desktop`）** 作为人用桌面封装壳，定位于 [architecture-initial-spec.md](./architecture-initial-spec.md) §2 中的 **Block B（App 壳扩展）**。

### 3.1 分层与依赖方向（硬约束）

```text
apps/desktop ──(import 编程接口)──→ packages/cli ──(import)──→ packages/core
      │                                  ▲
      └──(BrowserWindow 加载 web/dist)──→┴──(HTTP 127.0.0.1 /api/*)── apps/web
```

- `apps/desktop` 归属 B 块，仅依赖 `packages/cli` 导出的编程接口（`packages/cli/src/exports.ts`）以及 `apps/web/dist` 构建产物。
- **严禁 `apps/desktop` 直接 import `packages/core` 去拼私有业务流**，也严禁在 Electron 主进程里重写扫描、链接或备份逻辑——全部通过 CLI 服务边界完成。
- **严禁 `apps/web` 感知或直接调用 Electron API**（不引入 `window.electron` 专属业务分支）：`apps/web` 依然只认 `/api/*` HTTP 契约，保证浏览器模式（`skills-hub ui`）与桌面端体验 100% 同构。
- **DAG 位置**：不阻塞 A 块与 C 块；不依赖 D 块（账号与社区统计）。

## 四、进程内架构与资源打包

### 4.1 进程内 Fetch / 协议桥接与 HTTP 回退

1. `packages/cli` 通过 `package.json` 的 `"exports"` 暴露独立编程入口（`packages/cli/src/exports.ts`，不触发 CLI `runMain` 命令行解析），导出 `createUiApp`、`startUiServer`、`resolveUiStoreRoot`、`loadEnvFile`、`performInit`、`DEFAULT_UI_PORT` 等。
2. Electron 主进程（`apps/desktop/src/main.ts`）启动时：
   - 先执行 `loadEnvFile()`（支持 `~/.skills-hub/.env` 与工作目录 `.env`）载入可选的 `QINIU_API_KEY` / `GITHUB_TOKEN`，并设置 `SKILLSHUB_SELF_SKILL_DIR` 指向打包后的 `resources/self-skill`；
   - **默认模式（`protocol`）**：构造 `createUiApp({ storeRoot, home, webRoot })`，注册受保护的自定义协议 `app://skills-hub/`（`protocol.handle("app", createAppProtocolHandler(honoApp))`），免去本机 TCP 端口占用与跨网页监听暴露面；
   - **回退模式（`SKILLSHUB_DESKTOP_TRANSPORT=http`）**：通过 `startUiServer({ port: 0, home, webRoot })` 在进程内启动 `127.0.0.1` 随机空闲端口 Hono HTTP 服务；
   - 创建 `BrowserWindow` 加载入口（默认 `app://skills-hub/`），开启 `contextIsolation: true`、`sandbox: true`、禁用 `nodeIntegration: false`，并拦截外链跳出系统浏览器。
3. 请求与浏览器访问共用同一套本地安全校验（[http-and-routing.md](../conventions/http-and-routing.md) 的 `Host` 含 `skills-hub`、写请求 `Origin` 含 `app://skills-hub` 与 `Content-Type` 校验）。
4. 首次未初始化库存时，Web 壳引导卡片可直接调用 `POST /api/store/init` 完成库存初始化与指针写入，服务端动态更新 `ctx.storeRoot`，无需重启桌面端。

### 4.2 静态资源与 `extraResources`

- `apps/web/dist` 作为渲染层静态资源打包进桌面应用 `resources/web`，由内置 `createUiApp` / `startUiServer` 托管。
- `packages/cli/self-skill/`（即 `skills-hub` 自身的 `SKILL.md`）随 `extraResources` 打入 `resources/self-skill`，使桌面端触发 `bootstrap` 时也能定位并收录自身 skill。

## 五、与 PATH 上 CLI 的共存策略

桌面端与命令行 CLI 是同一内核的两种入口，必须无缝共存：

1. **共享同一指针与库存**：两者共同读写 `~/.skills-hub/config.json` 指针文件与同一 `<storeRoot>`（以及 `~/.skills-hub/.env`）。在桌面端收录或启用的 skill，终端 CLI 与外部 Agent 立即可见，反之亦然。
2. **不抢占 PATH 命令**：桌面端安装不覆盖、不劫持用户通过包管理器或全局链接安装在 `PATH` 上的 `skills-hub` CLI。外部 Agent（Claude Code、Codex、Cursor 等）继续走终端 CLI + `--json` 契约。
3. **端口共存**：若用户已在终端运行 `skills-hub ui` 占用了默认端口 `4321`，桌面端启动本地内置服务时应优先探测或回落到 `port: 0` 随机空闲端口，绝不静默杀掉用户已有终端进程。

## 六、构建、打包与无签名社团分发权衡

- **打包链路**：使用 `esbuild` 将 Electron 主进程与预加载脚本编译打包为单产物，再通过 `electron-builder` 生成各平台安装包/便携版（`apps/desktop/electron-builder.yml`：Windows `nsis` / `portable`、macOS `dmg`、Linux `AppImage`）。
- **无签名（unsigned）默认策略的权衡**：
  - 现阶段定位是**社团内部试验分发**，购置商业 Windows EV 代码签名证书与 Apple Developer 公证账号会产生持续费用并阻塞自动化打包链路。
  - 因此默认输出**无代码签名**产物；代价是 Windows SmartScreen 或 macOS Gatekeeper 首次运行会提示「未知发布者」，需在社团安装指引中说明首次放行步骤。
  - 若未来面向公开广泛分发，只需在 CI 发布工作流补充签名环境变量与证书密钥即可平滑接入，不牵动应用代码架构。
