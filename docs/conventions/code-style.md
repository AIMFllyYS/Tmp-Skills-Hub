# 代码风格规范

> 本文档是 `AGENTS.md` 中代码风格条款的完整版。
> 代码长度与文件组织规则见 [code-size-and-organization.md](./code-size-and-organization.md)。
> 确定性内核、HTTP 路由与测试安全规范分别见 [core-patterns.md](./core-patterns.md)、[http-and-routing.md](./http-and-routing.md) 与 [testing-and-security.md](./testing-and-security.md)。

## TypeScript（全仓）

- strict mode 全开（`tsconfig.base.json`，含 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）
- 禁止 `any`，用 `unknown` + 类型收窄（ESLint 设为 error）
- 命名导出优先，不用默认导出（web 的 `App`/入口组件除外）
- Node 包（core/cli）用 ESM + `NodeNext`，包内相对导入写 `.js` 后缀
- 公共类型集中从各包入口导出；包外不允许深路径导入（`@skills-hub/core/dist/...` 禁止）

## packages/core

- 零框架依赖，只允许 Node 标准库；禁止网络请求、`child_process` 与 `console.*`
- 函数尽量纯；I/O 集中在明确命名的函数里（`readSkillMeta`、`hashSkillFolder`），便于单测
- 当前运行时是**函数内核**：`interfaces.ts` 仅作未来换介质/换来源时的类型登记（全仓无 `implements`），不要按它编写新的面向对象包装或实现类（见 [architecture-initial-spec.md](../designs/architecture-initial-spec.md) §5）
- 注释只写非显然的意图与约束（如哈希确定性的三条不变量），不复述代码

## packages/cli

- `index.ts` 只做命令注册与参数解析；命令实现按自然接缝拆入独立模块（如 `store-cmds.ts` / `store-adopt.ts` / `store-query.ts` / `store-archive.ts` 等）；`exports.ts` 负责导出无 CLI 启动副作用的编程接口供 `apps/desktop` 复用
- 命令输出面向人类可读，`--json` 下保持纯净 JSON（禁止混入人类文本）；供 Web 消费的数据一律走 `ui-server.ts` / `ui-*.ts` 的 JSON 接口或流式协议
- 本地服务只绑 `127.0.0.1`，强制执行 `Host` / 写请求 `Origin` / `Content-Type` / body 大小上限校验（见 [http-and-routing.md](./http-and-routing.md)）；写操作与 CLI 共用同一套 `perform*` 与 core 函数，面板按钮与确认弹窗即用户显式发起
- `console` 是 CLI 的正常输出通道（ESLint 已对 cli 放开），但禁止打印任何脱敏前的凭据

## apps/web

- 函数组件 + hooks，不引状态管理库（数据流是本地服务取数 + `useState`/`useMemo` 够用；引库需先立 issue 并说明理由）
- Tailwind CSS 写样式，不使用 CSS Modules；条件 className 用 `cn()`（`clsx` + `tailwind-merge`，见 `apps/web/src/lib/utils.ts`）
- 跨页按钮、输入、原生选择框（`NativeSelect`）、对话框、Tab、Toast、开关、侧栏拖条、ScrollArea、Skeleton、Tooltip、折叠、图表容器、表必须来自 `apps/web/src/components/ui/`，服从 [ui-design-v1.md](./ui-design-v1.md)；业务文件不复制第三套控件样式，不手写条形图或 `animate-spin` 装饰动画
- 图标只用 Lucide 线性变体，且仅在能省字或帮助扫读时出现
- 新 UI 文件可用 `@/` 指向 `apps/web/src/`；网络调用统一经 `apiRequest` 封装，Markdown 渲染必须经 `DOMPurify.sanitize()` 净化，翻译请求必须绑定 `AbortController`
- 页面层（总览 / 统计 / Skills 管理 / Agent）按 `React.lazy()` + `Suspense` + `ErrorBoundary` 组织，设置走 Dialog（[app-shell-v2.md](../designs/app-shell-v2.md)）
- 与 CLI 服务的数据契约变更时，同一个 PR 里同步改 `ui-server.ts`（或 `ui-*.ts`）、`http-api-v0.md` 和 web 端 `types.ts`
- 展示层字段（display name 一类）只影响渲染，检索与召回仍按 `name`（架构规范 §3.3）

## apps/desktop

- 主进程仅承担 Electron 窗口生命周期、端口协商与静态资源托管，通过 `packages/cli` 编程入口启停本地服务；不在桌面主进程重写业务规则或文件系统 CRUD

## 测试与质量

- 全仓统一使用 **Vitest**；core 的确定性逻辑、cli 的 `--json` / HTTP 契约与 AI 替身测试、web 的状态模型与 XSS 净化**必须**带有单元测试
- 含测试的包必须配置 `tsconfig.test.json` 并在 `pnpm typecheck` 中执行，保证测试代码同样遵守 strict 与零 `any`
- 改动后运行四检（`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test`）及面板冒烟（`pnpm smoke`）

## 中英文

- 代码标识符、目录、skill `name` 一律英文（Agent 读取与路径稳定性优先）
- 注释与文档用中文；面向用户的 CLI 与面板输出用中文
