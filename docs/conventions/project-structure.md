# 目录结构与分层规则

> 本文档是 `AGENTS.md` 中 "Project Structure" 与依赖方向条款的完整版。
> 技术选型的论证见 [tech-stack-decision.md](../designs/tech-stack-decision.md) 与 [desktop-shell-v0.md](../designs/desktop-shell-v0.md)。

## 一、总体形态

skill-hub 是 pnpm monorepo。确定性本体是「核心库 + CLI」；**Web 与桌面壳是人用主界面**，CLI 给 Agent 与脚本：

```
.
├── packages/
│   ├── core/                       # 确定性内核（纯 TS，零框架依赖）
│   │   ├── tsconfig.json
│   │   ├── tsconfig.test.json      # 测试文件类型检查
│   │   └── src/
│   │       ├── types.ts            # 资产模型（SkillMeta / SkillRecord / …）
│   │       ├── interfaces.ts       # 换介质时的类型登记（无 implements；见架构 §5）
│   │       ├── hash.ts             # 文件夹内容哈希
│   │       ├── skill-md.ts         # SKILL.md 通用层解析
│   │       ├── clients.ts          # 按目录形状发现客户端 root（含 Antigravity 等嵌套惯例）
│   │       ├── store.ts            # 库存 index + 收录
│   │       ├── store-layout.ts     # 目录布局（含 StoreManifest）
│   │       ├── store-location.ts   # 指针 / 库存根解析
│   │       ├── create.ts           # 创建：占位 / 定稿 / 丢弃
│   │       ├── links.ts / link-switch.ts / link-status.ts / link-probe.ts
│   │       ├── archive.ts / zip.ts
│   │       ├── backup.ts / backup-restore.ts
│   │       ├── groups.ts / stats.ts / skill-files.ts / migrate.ts / tmp-id.ts
│   │       └── index.ts            # 唯一公共出口
│   └── cli/                        # 终端外衣 + 本地 HTTP + AI SDK 封装
│       ├── self-skill/             # skills-hub 自身 SKILL.md（随 bootstrap/桌面包分发）
│       ├── tsconfig.json
│       ├── tsconfig.test.json
│       ├── test/                   # json-contract / http-api / llm / agent / 命令测试
│       └── src/
│           ├── index.ts            # citty 入口，只做命令注册与参数解析
│           ├── exports.ts          # 无命令行启动副作用的编程导出（供 apps/desktop 复用）
│           ├── store-cmds.ts / store-*.ts / link-actions.ts / group-cmds.ts / create-cmds.ts
│           ├── scan.ts / bootstrap.ts / backup-cmds.ts / reset-cmds.ts / translations.ts
│           ├── github-source.ts / skills-sh-source.ts / share.ts / analyze.ts / doctor.ts
│           ├── llm/                # 七牛云 AI SDK v7 provider 与错误映射/脱敏
│           ├── agent/              # ToolLoopAgent、一等工具、模型白名单
│           └── ui-server.ts        # Hono 本地服务（安全中间件 + ui-http.ts + ui-*.ts）
├── apps/
│   ├── web/                        # 人用 Web 壳（Vite + React SPA: 总览/统计/Skills/Agent + 设置 Dialog）
│   │   ├── tsconfig.json
│   │   ├── tsconfig.test.json
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx             # React.lazy 路由 + ErrorBoundary + 壳状态
│   │       ├── lib/                # markdown.ts (DOMPurify) / sse.ts / utils.ts
│   │       ├── components/ui/      # 跨页控件（button / dialog / chart / table / input（含 NativeSelect） / scroll-area / skeleton…）
│   │       └── features/           # 按领域聚合（shell / skills / agent / actions；见第三节）
│   └── desktop/                    # Electron 桌面壳（进程内起 CLI 服务 + 内嵌 web/dist + self-skill/）
├── promo/                          # 57s 宣传片与视觉底稿（独立目录，不属于 pnpm workspace）
├── docs/                           # designs / specs / conventions / plans / updates / issues / audits / ops
├── scripts/                        # setup / build / dev / smoke-panel.mjs
├── .github/                        # CI 工作流、PR/Issue 模板、CODEOWNERS、Dependabot
├── pnpm-workspace.yaml
├── tsconfig.base.json              # 全仓共享编译选项
├── tsconfig.json                   # 根 project references(core, cli)
└── eslint.config.mjs               # 全仓统一 flat config
```

上表列的是**领域模块**，不是「每个新文件都必须出现在这份树里」。放置仍走第三节决策树。

## 二、分层与依赖方向（硬规则）

```text
apps/desktop ──(import 编程接口)──→ packages/cli ──(import)──→ packages/core
                                         ▲
apps/web ────────(HTTP /api)─────────────┘
```

- **core 不依赖任何 workspace 包，不 import 任何框架**。允许 Node 标准库；网络、进程管理、终端交互与 `console.*` 一律不进 core。
- **cli 依赖 core**，负责：命令行为、本机安全 HTTP 服务、AI SDK 封装、把 core 的产出序列化成 JSON，并通过 `exports.ts` 为桌面壳提供编程入口。
- **web 不 import core、不 import cli、不 import Electron**——它只通过 HTTP 消费 CLI 的 `/api`。这保证 Web 壳既可由浏览器访问 `skills-hub ui`，也可无缝运行在桌面端容器内，且未来可替换或迁至云端（D 块），而不牵动内核。
- **desktop 只通过 CLI 编程接口与静态产物组装应用**，禁止绕过 CLI 直接调用 core 去拼业务流或改写库存。
- 违反方向的 import 在 ESLint 与 code review 中直接打回，无例外。

### 为什么 web 不直接 import core

core 的能力（扫描、哈希、symlink）依赖本机文件系统，浏览器里跑不了。让 web 依赖 core 只会诱导"在构建期偷偷读文件系统"这类脆弱做法。数据必须经由 CLI 的本地服务这一条通道。

## 三、文件放置决策树

```
这段代码被谁使用？
│
├─ 是确定性操作(文件、哈希、链接、lockfile/台账),将来 CLI 和 Web 数据源都要用
│   └─ packages/core/src/,并从 index.ts 导出
│      ※ 判断标准:错了会破坏数据一致性的逻辑,必须进 core 且可单测
│
├─ 只是某个 CLI 命令的编排/展示逻辑，或本地 HTTP / AI / Agent 封装
│   └─ packages/cli/src/<command>.ts (或 llm/、agent/、ui-*.ts)，入口 index.ts 只注册命令
│
├─ 仅是桌面容器壳、窗口生命周期、打包配置
│   └─ apps/desktop/
│
├─ 只在 Web 壳的一个页面/领域内使用
│   └─ apps/web/src/features/<domain>/(shell / skills / agent / actions)
│      ※ 单处使用的组件不要提前抽到共享目录
│      ※ 人用 IA 是四板块（总览/统计/Skills 管理/Agent）+ 设置 Dialog；不要往已退役的三栏 panel IA 加新代码
│
├─ Web 壳跨领域复用的纯展示组件或通用库
│   └─ apps/web/src/components/ 或 apps/web/src/lib/
│
└─ 文本判断类功能(审查、分类建议、"有用"判定…)
    └─ 不写代码——写成 Skill 交给 Agent(见 core-patterns.md 第五节)
```

## 四、新增包的门槛

默认不加新包。满足以下全部条件才允许新增 workspace 包：

1. 有独立的发布/部署生命周期（如已立项的 `apps/desktop`，以及将来的浏览器插件、云端站点）；
2. 与现有包的依赖方向能画进第二节的图而不产生环；
3. 在 issue 里先立项并引用架构规范 §1 的方法论走过一遍（如 [desktop-shell-v0.md](../designs/desktop-shell-v0.md)）。
