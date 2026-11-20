# 测试架构与安全红线规范

> Created: 2026-11-20
> Updated: 2026-11-20
> Status: accepted
> 上游约束：[AGENTS.md](../../AGENTS.md) · [store-and-paths-v0.md](../specs/store-and-paths-v0.md) §5

## 一、测试框架与各包测试布局

全仓统一使用 **Vitest** 作为单元测试与契约测试框架（无待定状态），按包分层组织：

| 包 | 测试位置与命名 | 覆盖重点 |
|---|---|---|
| `packages/core` | `packages/core/src/*.test.ts`（与源码同目录 colocation） | 哈希确定性、`SKILL.md` 解析、客户端发现与去重、链接台账与原子集合切换（含 `kind: "copy"`）、`saveSkillFile` 元数据联动同步、备份/还原及跨卷 EPERM 旁路重试、草稿生命周期、并发文件锁 |
| `packages/cli` | `packages/cli/test/*.test.ts` | 命令行为与错误码、CLI `--json` 契约（`json-contract.test.ts` spawn `dist/index.js` 实测）、HTTP 契约与安全中间件（`http-api.test.ts` 注入沙箱 via `app.request()`）、AI SDK provider/错误处理/分析/Agent 工具与审批替身测试（`LanguageModel` / `fetchImpl` 替身，零真实外网调用） |
| `apps/web` | `apps/web/src/**/*.test.ts`（邻近模块放置） | 动作注册表、catalog 渐进式水合与状态模型、虚拟列表窗口、Markdown `DOMPurify` XSS 净化、SSE 解析与 Agent 错误/消息辅助函数 |
| `apps/desktop` | `apps/desktop` 测试与构建检查 | 主进程入口配置、端口/资源路径解析、本地服务生命周期包装验证 |

## 二、强制 `tsconfig.test.json` 类型检查

生产构建 `tsconfig.json` 通常只包含 `src/` 业务代码（排除 `test/` 或 `*.test.ts`）。若不对测试单独做类型检查，测试文件很容易积攒隐式 `any` 或过期签名。因此：

- 含测试文件的包（`packages/core`、`packages/cli`、`apps/web`）**必须**配置 `tsconfig.test.json`，将测试文件纳入 strict 编译检查范围。
- 根级 `pnpm typecheck` 与各包 `typecheck` 脚本必须同时覆盖生产配置与 `tsconfig.test.json`（如 `tsc -b --force && tsc -p tsconfig.test.json --noEmit`）。
- 测试代码同样遵守全仓 `@typescript-eslint/no-explicit-any: error` 铁律；替身构造不得用 `as any` 绕过类型检查。

## 三、Chrome 面板冒烟门禁（`pnpm smoke`）

[scripts/smoke-panel.mjs](../../scripts/smoke-panel.mjs) 使用原生 Chrome DevTools Protocol（不额外引入 Playwright/Puppeteer 运行时重依赖），在完全隔离的临时沙箱中拉起 `skills-hub ui` 与 headless Chrome，执行端到端功能与性能回归断言：

- **功能断言**：侧栏四个导航（`nav-overview`、`nav-stats`、`nav-skills`、`nav-agent`）与左下角设置（`nav-settings`）全部存在；Skills 内容查看器成功渲染正文（非卡在加载态）；客户端启用开关可渲染；设置弹窗含重置入口。
- **性能与规模门禁**：点击 skill 后 4 秒内 `fetch ≤ 2`；静置 10 秒 CPU 增量 `≤ 0.1s`；单长任务 `≤ 200ms`；写入 1000 条虚拟库存后可见行 `≤ 80` 且文档 DOM 节点 `≤ 3000`。
- **跳过 vs 强制失败策略**：
  - 本地开发运行 `pnpm smoke` 时，若本机未安装 Chrome 且未设置 `CHROME_PATH`，脚本输出提示并退出 `0`。
  - **CI（[ci.yml](../../.github/workflows/ci.yml) `smoke` job）强制传入 `--require-chrome`**：缺失 Chrome 直接以非零退出码失败，防止冒烟门禁在 CI 上静默失效。

## 四、沙箱 `--home` 测试铁律

依据 [store-and-paths-v0.md](../specs/store-and-paths-v0.md) §5：

1. **禁止触达真实用户环境**：任何单元测试、集成测试、冒烟脚本或无人值守 E2E，**严禁**向用户的真实 `~/.claude`、`~/.codex`、`~/.agents`、`~/.gemini` 等客户端目录或真实库存（如 `D:\projects\My-Skills\Hubs`）写入、移动或删除任何文件。
2. **唯一写操作落点**：必须使用 `os.tmpdir()` 临时目录或 `<repo>/.sandbox/home-<时间戳>/`（已在 `.gitignore` 中），通过 `--home` 或 `SKILLS_HUB_HOME` 重定向全部读写路径。
3. **内核禁调用 `os.homedir()`**：`packages/core` 内所有函数必须显式接收 `home` 或 `storeRoot` 参数，禁止在内核函数内部偷调 `os.homedir()`。
4. **Windows 真机语义**：禁止用 WSL / Docker 替代 Windows 沙箱来回避 junction 测试；junction 与跨卷目录旁路（如 `#159` `EPERM` 回退路径）必须在本地 Windows 环境真实可测。

## 五、凭据脱敏与安全红线

1. **环境变量与 `.env` 加载**：
   - `QINIU_API_KEY`、`GITHUB_TOKEN` 等凭据只从进程环境变量或 `.env`（优先工作目录 `.env`，其次 `~/.skills-hub/.env` 兜底，且**不覆盖**已有环境变量）读取。
   - 严禁把 `.env`、真实 token 或含密钥的抓包文件提交进 Git，严禁写入源码或前端响应。
2. **异常日志与响应脱敏**：
   - 所有外部 LLM / HTTP 异常进入返回信息前必须经过 `scrub()`（`packages/cli/src/llm/errors.ts`）脱敏，同时掩码 `sk-*` 模式以及非空的 `process.env.QINIU_API_KEY` / `process.env.GITHUB_TOKEN` 环境变量字面量（替换为 `[redacted]`）。
   - Hono 全局 `onError` 返回通用结构化信息，不向客户端暴露底层凭据或完整堆栈。
3. **零静默写入与零真删除红线**：
   - 未经用户显式授权（终端交互确认 / 非交互 `--yes` / Web 面板或 Agent 审批明确动作），**绝不**搬动或改写用户本地客户端目录里的已有 skill。
   - `links.json` 台账是受管条目的唯一凭证：删除或覆盖 `kind: "copy"` 目录**仅限**台账明确登记为 `kind === "copy"` 的受管条目，绝不删除未登记的用户真实目录；所有移除/放弃操作一律走 `archive`、`archive/drafts/` 或 `.pre-reinit` 旁路，代码库内不存在真删除 skill 资产的路径。
