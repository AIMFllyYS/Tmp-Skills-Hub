# Skills Hub 宣传片（promo/）

> 57 秒卡点宣传片 + 片中那套「从 0 到 1 重做的前端」。
> 成片：[`film/skills-hub-promo.mp4`](film/skills-hub-promo.mp4)（1920×1080 · 60fps · H.264 + AAC · 浅色版）

这个目录**不属于 pnpm workspace**，不影响 `pnpm lint / typecheck / build`。它做两件事：

1. **片子本身**：一个 1920×1080 的 HTML 舞台，画面是时间 `t` 的纯函数；渲染器逐帧 `seek(t)` 截图，管道喂给 ffmpeg，混入同一张节拍网格合成出来的配乐。所以每一刀都精确落在拍点上。
2. **新前端的底稿**：片里出现的总览页、库存面板、分享对话框、Agent 对话、排行榜，都是用 `src/styles/tokens.css` + `src/styles/ui.css` 这套组件真实排出来的 DOM，不是贴图。片子做完之后，要不要把它迁回 `apps/web`，见文末。

## 叙事：从一个文件夹到连接一切

节拍网格：F 小调，120 BPM（一拍 0.5s，一小节 2s），共 114 拍。段落口径在 [`src/cues.json`](src/cues.json)，画面和配乐读的是同一份。

| 时间 | 拍 | 段落 | 画面 | 素材依据 |
|---|---|---|---|---|
| 0:00 | b0 | 起初 | 信箱画幅 + 时间码（「过去」的影像感）；光标键入 `~/.claude/skills/pptx`，SKILL.md 展开：`name` + `description` | 会议纪要：skill 本质是一个文件夹，name + description 大家都能读 |
| 0:04 | b8 | 生长 | 卡片每两拍翻倍 1→128，计数滚到 213；「有人写了一个 / 大家都开始写 / 装进每一个 Agent / 越来越多」 | 真实 skill 名（见下） |
| 0:12 | b24 | 混乱 | 卡片炸开，27 个客户端目录瀑布；**27 个目录 → 581 份副本**；`demo-init` ×26 扇形牌堆、两个内容变体；黑白反相四连问；「很多。很怪。没人知道。」故障大字 | `docs/audits/skills-full-scan-2026-08-16.md` 的真机数字 |
| 0:19.75 | b39.5 | 静默 | 半拍黑场 + 吸气 | |
| 0:20 | b40 | 定名 | 冲击、信箱打开、Logo 从爆点收束：**Skills Hub**，「把团队散落的 Skills，收成一个系统。」 | |
| 0:22 | b44 | 01 收 | 副本被吸进统一库存，581 → 213，列表逐行给出 sha256 与「N 份副本 → 1」，demo-init 两个变体分开保留 | Step 1：按整个文件夹内容哈希去重，不按文件名 |
| 0:26 | b52 | 02 链 | 库存居中，逐拍把符号链接挂到 8 个 Agent；改 `version: 1 → 2`，一道光同时冲到所有节点「✓ 已同步」 | Step 3–5：改的是原件，全局改、不漂移 |
| 0:30 | b60 | 03 看 | 重做的总览页从透视里落定；KPI 计数、用量 Top 8 柱图生长、近期收录开关逐拍打开 | Step 6：一个地方统一看 |
| 0:34 | b68 | 04 享 | 分享对话框推到 `club/skills`，链接分发到成员；**甩镜**到 Agent：「帮我找一个做 PPT 的 skill」→ `enable_links` 待批准 → 批准 → 已启用 | 共享层：授信成员直接写、链接分发、零服务器；Agent 写策略先批准 |
| 0:38 | b76 | 05 扩 | 确定性内核居中，`StorageProvider / SourceProvider / ClientAdapter / IdentityProvider` 四个模块逐拍「咔」进来；收成 A→B/C→D 工程 DAG；「为团队而生，为扩展而建。」 | `packages/core/src/interfaces.ts`、架构规范 DAG |
| 0:44 | b88 | 06 人 | 成员主页卡（在用多少、置顶什么）→ 社团精选本周排行 | 社区玩法：个人主页 → 置顶 → 全站精选 |
| 0:48 | b96 | 跨次元 | 曲速星空，界面坍缩成点，长成 skill 点阵星球，拉远成「前端组 / 设计组 / 社团 / 企业团队 / 开源世界」星系；**Skills · 连接 · 一切** | |
| 0:52 | b104 | 定版 | Logo 锁定：「团队的 Skill 中枢 · Skills 连接一切」+ `$ skills-hub ui` | |

片中出现的 skill 名全部真实存在：`anthropics/skills`（pptx、docx、xlsx、pdf、skill-creator、mcp-builder、frontend-design、webapp-testing、canvas-design…）、`obra/superpowers`（brainstorming、systematic-debugging、test-driven-development、writing-plans…）、`vercel-labs`（vercel-react-best-practices、web-design-guidelines、find-skills…）、`remotion-dev/skills`（remotion-best-practices），以及本仓库真机扫描报告里的 hyperframes、demo-init、concept-keeper 等。成员主页里的 `@mio` 等是演示用的占位账号。

## 手法清单

- **卡点**：所有冲击、切镜、计数翻页都按拍号写死（`kf / hit / prog` 以拍为单位），配乐由 `audio/make-track.py` 在同一网格上合成（底鼓、军鼓、reese 低音、拨弦琶音、铺底、上升音、反向镲、冲击低频、故障切片），无采样、无版权素材。
- **拉片感**：前 40 拍是 2.39:1 信箱 + 时间码 + REC（「过去」），冲击时信箱打开进入产品时代；颗粒、暗角、变形宽银幕光斑、震屏、闪白。
- **明暗节奏**：全片纸白基底；混乱段的反相问句和「很多。很怪。没人知道。」切到墨色底，是全片最暗的一刻，接半拍黑场，再闪白进入定名。
- **MG / 转场**：逐字模糊显影、遮罩升字、弹簧回弹、甩镜动态模糊、推拉镜、3D 透视落定、SVG 描边生长、粒子爆发与冲击环、红青色散 + 横切片故障字、黑白反相快切、点阵星球与星系拉远。

## 渲染

```bash
cd promo
npm install                  # playwright-core + 字体（Geist / Geist Mono / Noto Sans SC）
pip install numpy scipy imageio-ffmpeg
npm run audio                # → out/track.wav
node render.mjs              # 全片 60fps → out/skills-hub-promo.mp4（约 10 分钟）
node render.mjs --fps 30 --from 20 --to 30 --preset veryfast   # 局部草稿
node render.mjs --stills 12.5,20.1,33 --dir out/review        # 审片静帧
node render.mjs --theme dark --out out/promo-dark.mp4          # 深色版
```

实时预览：`npx http-server . -c-1` 后打开 `/src/index.html?play`（点一下画面开始，跟随音频播放）；`?t=21.5` 定格到某一秒；`?theme=dark` 切深色。

需要 Chromium（默认找 `/opt/pw-browsers/chromium-1194`，或设 `CHROME_PATH`）和带 libx264 的 ffmpeg（默认用 imageio-ffmpeg 的静态版，或设 `FFMPEG`）。

## 目录

```
promo/
  src/
    cues.json            节拍网格与段落（画面 + 配乐共用）
    index.html           舞台
    styles/tokens.css    ★ 设计令牌（新前端的视觉语言；:root 浅色，[data-theme="dark"] 深色）
    styles/ui.css        ★ 产品组件（侧栏、KPI、柱图、行、开关、对话框、Toast、Agent 对话）
    styles/stage.css     片子专用：分层、大字、章节题签、后期
    js/engine.js         时间线引擎：缓动、关键帧、冲击包络、确定性随机
    js/theme.js          画布 / 特效用的主题色（粒子、星空、点阵球、故障色散的混合模式）
    js/ui.js             ★ 产品界面构件：Logo、图标、完整总览页
    js/fx.js             故障字、粒子、冲击环、星空、颗粒
    js/data.js           片中数据（真实 skill 名、扫描数字、客户端路径）
    js/scenes/*.js       12 个场景
    js/main.js           挂载、后期、__seek(t) 渲染接口、预览
  audio/make-track.py    配乐合成
  render.mjs             逐帧渲染 + ffmpeg 合成
  film/                  成片
```

## 新前端：设计语言摘要，以及要不要迁回 apps/web

片里的界面遵循 `app-shell-v2` 的信息架构（左侧 总览 / 统计 / Skills 管理 / Agent，左下角设置），但视觉是重新定的：

| | 现行 `ui-design-v1` | 片中新语言 |
|---|---|---|
| 基底 | 浅色、白底灰阶 | 浅色纸白 `#f6f6f3` + 白色卡面（默认）；同名令牌另有一套深色 |
| 品牌色 | 控件与导航禁止品牌色 | 一支信号色 Volt：面用 `#c8f53c`（主按钮、柱、开关、Logo 核心），线与字用加深的 `#4d7c0f`，只给「当前 / 主动作 / 已链接」 |
| 系列色 | 图表蓝 / 青 / 琥珀 / 紫 | 图表 Volt + 青，来源标记 clay / violet / cyan / amber |
| 字体 | 系统栈 + 等宽 | Geist + Geist Mono，中文回落 Noto Sans SC |
| 高度 | 无阴影，仅两档极弱 | 两档极弱阴影 + 一档信号光（只在「刚发生」时出现） |
| 动效 | 分层 token + spring / smooth | 沿用同一套缓动口径 |

**建议**：浅色基底、信息架构、组件清单、动效口径与现行规范一致，可以直接复用；真正的冲突只剩「品牌信号色进入控件」这一条（外加可选的深色模式），它正是 `ui-design-v1` 明文禁止的。按 AGENTS.md「遇到架构矛盾先修文档」，迁回的顺序应当是：

1. 先提一版 `ui-design-v2`（或 v1 修订），写明为什么要引入唯一信号色、面 / 线两种用法的边界，以及深色模式是否进入范围；
2. 再把 `tokens.css` 的变量映射进 `apps/web/src/index.css` 的 `@theme`，把 `ui.css` 里的组件逐个落到 `components/ui/` 现有组件上（Button / Card / Switch / Badge / Tabs…），不新开第三套控件；
3. 统计页的柱图、Skills 的行、Agent 的工具卡片按片中样式改，逐页替换、各自走 PR。

这一步需要团队拍板，片子本身不改动 `apps/web`。
