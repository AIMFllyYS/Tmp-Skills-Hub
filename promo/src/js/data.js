// 片中出现的真实数据。
// skill 名：公开仓库里真实存在的技能（anthropics/skills、obra/superpowers、vercel-labs、remotion-dev），
// 以及项目自己的真机扫描报告 docs/audits/skills-full-scan-2026-08-16.md 里出现的名字。
// 数字：同一份扫描报告（27 个目录 / 581 份副本 / 213 个唯一 skill / demo-init ×26）。

export const SOURCES = {
  anthropic: { label: "anthropics/skills", color: "#e0845e" },
  superpowers: { label: "obra/superpowers", color: "#a293ff" },
  vercel: { label: "vercel-labs/agent-skills", color: "#d4d4d8" },
  remotion: { label: "remotion-dev/skills", color: "#5ad7ff" },
  local: { label: "本机自建", color: "#c8f53c" },
  club: { label: "club/skills", color: "#ffb547" },
};

export const SKILLS = [
  ["pptx", "anthropic", "创建、编辑和分析 PowerPoint 演示文稿"],
  ["frontend-design", "anthropic", "做出有设计感、不像模板的前端界面"],
  ["systematic-debugging", "superpowers", "先找根因，再动手修 bug"],
  ["skill-creator", "anthropic", "创建、评测、迭代新的 skill"],
  ["vercel-react-best-practices", "vercel", "React / Next.js 性能最佳实践"],
  ["brainstorming", "superpowers", "动手之前先把需求聊透"],
  ["docx", "anthropic", "读写 Word 文档与修订"],
  ["mcp-builder", "anthropic", "构建高质量的 MCP 服务器"],
  ["test-driven-development", "superpowers", "先写失败的测试，再写实现"],
  ["web-design-guidelines", "vercel", "按界面规范审查页面"],
  ["xlsx", "anthropic", "表格读写、公式与清洗"],
  ["find-skills", "vercel", "在 skills.sh 上找现成的 skill"],
  ["pdf", "anthropic", "PDF 提取、合并、填表"],
  ["writing-plans", "superpowers", "把需求拆成可执行的计划"],
  ["remotion-best-practices", "remotion", "用 Remotion 写视频的最佳实践"],
  ["webapp-testing", "anthropic", "用 Playwright 测本地 Web 应用"],
  ["canvas-design", "anthropic", "海报与静态视觉设计"],
  ["executing-plans", "superpowers", "按计划分批执行并回报"],
  ["using-git-worktrees", "superpowers", "隔离的 git worktree 工作区"],
  ["algorithmic-art", "anthropic", "p5.js 生成艺术"],
  ["requesting-code-review", "superpowers", "提交前请求代码审查"],
  ["theme-factory", "anthropic", "给产物套主题"],
  ["subagent-driven-development", "superpowers", "子代理并行推进开发"],
  ["brand-guidelines", "anthropic", "品牌色与字体规范"],
  ["vercel-composition-patterns", "vercel", "React 组合模式"],
  ["verification-before-completion", "superpowers", "宣布完成之前先验证"],
  ["web-artifacts-builder", "anthropic", "多组件 Web 产物"],
  ["slack-gif-creator", "anthropic", "为 Slack 做动图"],
  ["internal-comms", "anthropic", "内部沟通文稿"],
  ["doc-coauthoring", "anthropic", "结构化协作写文档"],
  ["dispatching-parallel-agents", "superpowers", "把独立任务分派给并行代理"],
  ["writing-skills", "superpowers", "写出好用的 skill"],
  ["hyperframes", "local", "HTML 视频合成"],
  ["faceless-explainer", "local", "无出镜讲解视频"],
  ["concept-keeper", "local", "概念与术语看护"],
  ["demo-init", "local", "演示项目初始化"],
  ["distributing-skills-across-local-agents", "local", "把 skill 分发到本机各 Agent"],
  ["creating-formal-reports-from-software-products", "local", "从软件产品生成正式报告"],
  ["react-native-skills", "vercel", "React Native 开发"],
  ["finishing-a-development-branch", "superpowers", "收尾一个开发分支"],
];

export const CLIENTS = [
  { id: "claude", name: "Claude Code", path: "~/.claude/skills", color: "#e0845e" },
  { id: "codex", name: "Codex", path: "~/.codex/skills", color: "#3f3f46" },
  { id: "cursor", name: "Cursor", path: "~/.cursor/skills", color: "#8b919b" },
  { id: "gemini", name: "Gemini CLI", path: "~/.gemini/skills", color: "#5ad7ff" },
  { id: "trae", name: "Trae", path: "~/.trae/skills", color: "#ff6f91" },
  { id: "windsurf", name: "Windsurf", path: "~/.windsurf/skills", color: "#6ee7a8" },
  { id: "kiro", name: "Kiro", path: "~/.kiro/skills", color: "#a293ff" },
  { id: "opencode", name: "OpenCode", path: "~/.config/opencode/skills", color: "#ffb547" },
];

// 扫描报告里的 27 个 root（按报告出现的客户端 id 还原成路径）
export const ROOTS = [
  "~/.agents/skills", "~/.claude/skills", "~/.codex/skills", "~/.cursor/skills", "~/.gemini/skills",
  "~/.trae/skills", "~/.trae-cn/skills", "~/.windsurf/skills", "~/.kiro/skills", "~/.qoder/skills",
  "~/.qoder-cn/skills", "~/.qoderworkcn/skills", "~/.cline/skills", "~/.codebuddy/skills", "~/.continue/skills",
  "~/.copilot/skills", "~/.devin/skills", "~/.grok/skills", "~/.openclaw/skills", "~/.quickwork/skills",
  "~/.workbuddy/skills", "~/.0-1-cli/skills", "~/.hub/skills", "~/.config/opencode/skills",
  "~/.cursor/skills-cursor", "~/.gemini/antigravity/skills", "~/.codeium/windsurf/skills",
];

export const SCAN = { roots: 27, copies: 581, unique: 213, demoInit: 26 };

export const TEAM = [
  { handle: "@mio", role: "前端", color: "#c8f53c", n: 34, pins: ["frontend-design", "vercel-react-best-practices", "web-design-guidelines"] },
  { handle: "@kaze", role: "后端", color: "#5ad7ff", n: 27, pins: ["systematic-debugging", "mcp-builder", "test-driven-development"] },
  { handle: "@yuki", role: "设计", color: "#ffb547", n: 22, pins: ["canvas-design", "theme-factory", "brand-guidelines"] },
  { handle: "@sora", role: "算法", color: "#a293ff", n: 31, pins: ["xlsx", "writing-plans", "pdf"] },
];

export function glyphOf(name) {
  const parts = name.split("-");
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}
