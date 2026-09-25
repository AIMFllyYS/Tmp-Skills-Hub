// 产品界面构件：Logo、图标、完整 App 窗口。样式在 styles/ui.css。
import { CLIENTS, SKILLS, SOURCES, glyphOf } from "./data.js";
import { el, fakeHash } from "./engine.js";

/** Hub 标志：中心库存 + 六条链接到各 Agent。 */
export function logoSVG(size = 64, color = "var(--sh-logo)", core = "var(--sh-logo-core)") {
  const nodes = [];
  const spokes = [];
  for (let k = 0; k < 6; k++) {
    const a = (-90 + k * 60) * (Math.PI / 180);
    const x = 32 + Math.cos(a) * 22;
    const y = 32 + Math.sin(a) * 22;
    spokes.push(`<line class="lg-spoke" x1="32" y1="32" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" />`);
    nodes.push(`<circle class="lg-node" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.6" />`);
  }
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none">
    <g stroke="${color}" stroke-width="3" stroke-linecap="round">${spokes.join("")}</g>
    <g fill="${color}">${nodes.join("")}</g><circle class="lg-core" cx="32" cy="32" r="8.5" fill="${core}" stroke="${color}" stroke-width="3" />
  </svg>`;
}

const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  skills: '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="m2 13 10 5 10-5"/><path d="m2 18 10 5 10-5" opacity=".5"/>',
  agent: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  git: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 3-4 3-9.5 5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

export function glyph(name, source, parent) {
  const g = el("div", "sh-glyph", parent, glyphOf(name));
  g.style.background = SOURCES[source].color;
  return g;
}

/** 整个总览页窗口。返回需要逐帧驱动的引用。 */
export function buildApp(parent) {
  const app = el("div", "sh-app", parent);
  const bar = el("div", "sh-titlebar", app);
  el("div", "sh-dots", bar, "<i></i><i></i><i></i>");
  el("div", "sh-title", bar, "Skills Hub — 总览");
  el("div", "sh-addr", bar, "127.0.0.1:4321");

  const body = el("div", "sh-body", app);
  const side = el("aside", "sh-sidebar", body);
  el("div", "sh-brand", side, `${logoSVG(26)}<span>Skills Hub</span>`);
  const navs = [
    ["overview", "总览", ""],
    ["stats", "统计", ""],
    ["skills", "Skills 管理", "213"],
    ["agent", "Agent", ""],
  ].map(([ic, label, count], i) => el("div", `sh-nav${i === 0 ? " is-active" : ""}`, side, `${icon(ic)}<span>${label}</span><span class="sh-count">${count}</span>`));
  el("div", "sh-nav-label", side, "已发现应用 · 27");
  CLIENTS.slice(0, 6).forEach((c, i) => {
    el("div", "sh-nav", side, `<i class="sh-client-dot" style="background:${c.color}"></i><span>${c.name}</span><span class="sh-count">${[186, 171, 158, 122, 97, 64][i]}</span>`);
  });
  el("div", "sh-spacer", side);
  el("div", "sh-nav", side, `${icon("settings")}<span>设置</span>`);

  const main = el("main", "sh-main", body);
  const head = el("div", "sh-head", main);
  el("div", "", head, "<h1>总览</h1><p>本机库存 <span class='sh-hash'>~/.skills-hub</span> · 上次扫描 2 分钟前</p>");
  const actions = el("div", "sh-actions", head);
  el("div", "sh-btn", actions, `${icon("scan")}扫描`);
  const adopt = el("div", "sh-btn is-primary", actions, `${icon("plus")}收录 Skill`);

  const kpis = el("div", "sh-kpis", main);
  const kpiDefs = [
    ["库存 Skills", 213, "", "去重自 <b>581</b> 份副本"],
    ["已发现应用", 27, "", "<b>8</b> 个常用客户端"],
    ["链接覆盖", 94, "%", "<b>+12%</b> 本周"],
    ["本周收录", 12, "", "来自 <b>GitHub</b> 与 skills.sh"],
  ];
  const kpiRefs = kpiDefs.map(([label, value, unit, foot]) => {
    const card = el("div", "sh-card sh-kpi", kpis);
    el("div", "sh-kpi-label", card, label);
    const v = el("div", "sh-kpi-value", card);
    const num = el("span", "", v, "0");
    if (unit) el("small", "", v, unit);
    el("div", "sh-kpi-foot", card, foot);
    return { card, num, value };
  });

  const grid = el("div", "", main);
  grid.style.cssText = "display:grid;grid-template-columns:1.75fr 1fr;gap:14px;";
  const chartCard = el("div", "sh-card", grid);
  const ch = el("div", "sh-card-head", chartCard, "用量 Top 8");
  el("div", "sh-legend sh-sub", ch, "<span><i style='background:var(--sh-volt-fill)'></i>启用</span><span><i style='background:var(--sh-c-cyan)'></i>查看</span>");
  const chart = el("div", "sh-chart", chartCard);
  const top = [
    ["frontend-design", 62, 30], ["systematic-debugging", 55, 28], ["pptx", 49, 31], ["vercel-react-best-practices", 44, 20],
    ["brainstorming", 40, 22], ["skill-creator", 34, 19], ["test-driven-development", 30, 15], ["find-skills", 26, 14],
  ];
  const bars = top.map(([name, a, v]) => {
    const b = el("div", "sh-bar", chart);
    const num = el("div", "sh-bar-num", b, String(a + v));
    const stack = el("div", "sh-bar-stack", b);
    const bb = el("div", "sh-bar-b", stack);
    const ba = el("div", "sh-bar-a", stack);
    el("div", "sh-bar-name", b, name);
    return { num, ba, bb, a, v };
  });

  const todo = el("div", "sh-card", grid);
  el("div", "sh-card-head", todo, "需要处理<span class='sh-sub'>3 项</span>");
  const todoList = el("div", "", todo);
  todoList.style.paddingTop = "8px";
  [
    ["var(--sh-warn)", "<b>demo-init</b> 有 2 个同名内容变体"],
    ["var(--sh-err)", "<b>10</b> 个目录缺少 name / description"],
    ["var(--sh-volt)", "<b>Codex</b> 还有 5 个 skill 未启用"],
    ["var(--sh-c-cyan)", "<b>club/skills</b> 有 4 个新分享"],
  ].forEach(([c, t]) => el("div", "sh-todo", todoList, `<i class="sh-todo-dot" style="background:${c}"></i><span>${t}</span>`));

  const listCard = el("div", "sh-card", main);
  el("div", "sh-card-head", listCard, "近期收录<span class='sh-sub'>按收录时间</span>");
  const list = el("div", "", listCard);
  list.style.padding = "6px 2px 4px";
  const rows = ["pptx", "frontend-design", "systematic-debugging", "remotion-best-practices"].map((name) => {
    const s = SKILLS.find((x) => x[0] === name);
    const row = el("div", "sh-row", list);
    glyph(name, s[1], row);
    el("div", "sh-row-name", row, name);
    el("div", "sh-row-desc", row, s[2]);
    const cl = el("div", "sh-row-clients", row);
    CLIENTS.slice(0, 4).forEach((c) => el("i", "sh-client-dot", cl).style.background = c.color);
    el("div", "sh-hash", row, `<b>#</b>${fakeHash(name, 8)}`);
    const sw = el("div", "sh-switch", row);
    return { row, sw };
  });

  return { app, navs, kpis: kpiRefs, bars, rows, adopt, chartCard, listCard, kpiWrap: kpis };
}
