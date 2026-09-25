// b76–88 为扩展而建：四个接口模块逐拍「咔」进确定性内核，再收成工程 DAG。
import { T } from "../theme.js";
import { E, clamp, css, el, hit, kf, prog, svg, toggle } from "../engine.js";
import { drawBurst, makeBurst } from "../fx.js";
import { chapter, updateChapter } from "./chapter.js";

const CX = 960;
const CY = 560;
const MODULES = [
  { at: 77, name: "StorageProvider", cn: "换介质", desc: "文件目录 → SQLite → 云端", x: CX, y: 250, from: [0, -900] },
  { at: 79, name: "SourceProvider", cn: "接来源", desc: "本地 · GitHub · skills.sh · 浏览器插件", x: 1490, y: CY, from: [1000, 0] },
  { at: 81, name: "ClientAdapter", cn: "接客户端", desc: "任何读 SKILL.md 的 Agent", x: CX, y: 870, from: [0, 900] },
  { at: 83, name: "IdentityProvider", cn: "接账号", desc: "统一登录 · 团队权限", x: 430, y: CY, from: [-1000, 0] },
];
const DAG = [
  { id: "A", cn: "库存与镜像层", en: "STORE · LINKS", x: 430, y: 560 },
  { id: "B", cn: "App 壳", en: "SEE", x: 960, y: 400 },
  { id: "C", cn: "分享层", en: "SHARE", x: 960, y: 720 },
  { id: "D", cn: "社区与统计层", en: "TEAM · STATS", x: 1490, y: 560 },
];
const EDGES = [["A", "B", 84.5], ["A", "C", 85], ["B", "D", 85.5], ["C", "D", 86]];
let s;

function hexPath(r) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = (30 + k * 60) * (Math.PI / 180);
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

export default {
  id: "extend",
  start: 76,
  end: 88,
  mount(root) {
    s = {};
    s.a = el("div", "abs", root);
    s.a.style.cssText = "inset:0;transform-origin:960px 560px;";
    s.svg = svg("svg", { width: 1920, height: 1080, style: "position:absolute;inset:0;overflow:visible" }, s.a);
    s.links = MODULES.map((m) => svg("line", { x1: CX, y1: CY, x2: m.x, y2: m.y, stroke: `rgba(${T.accentRGB},.8)`, "stroke-width": 2, opacity: 0 }, s.svg));
    const g = svg("g", { transform: `translate(${CX} ${CY})` }, s.svg);
    s.ring = svg("path", { d: hexPath(190), fill: "none", stroke: "var(--sh-line-3)", "stroke-width": 1.5, "stroke-dasharray": "6 10" }, g);
    s.hex = svg("path", { d: hexPath(140), fill: "var(--sh-surface)", stroke: `rgba(${T.accentRGB},.9)`, "stroke-width": 2.5 }, g);
    s.core = el("div", "abs", s.a, "<div style='font-family:var(--sh-mono);font-size:30px;font-weight:500'>core</div><div class='dim' style='margin-top:8px;font-size:17px'>确定性内核</div><div class='sh-hash' style='margin-top:6px'>@skills-hub/core</div>");
    s.core.style.cssText += `left:${CX - 150}px;width:300px;top:${CY - 58}px;text-align:center;`;

    s.mods = MODULES.map((m) => {
      const n = el("div", "node", s.a);
      n.style.left = `${m.x}px`;
      n.style.top = `${m.y}px`;
      n.style.padding = "18px 22px";
      n.innerHTML = `<div><div style="display:flex;gap:10px;align-items:baseline"><span class="volt" style="font-size:22px;font-weight:700;font-family:var(--sh-font-cn)">${m.cn}</span><span style="font-family:var(--sh-mono);font-size:16px;color:var(--sh-ink-2)">${m.name}</span></div><div class="dim" style="margin-top:8px;font-size:15px">${m.desc}</div></div>`;
      return { ...m, n, burst: makeBurst(m.at * 10, 60, { speed: 600, life: 0.9 }) };
    });

    s.title = el("div", "abs", root);
    s.title.style.cssText = "right:96px;top:92px;text-align:right;";
    el("div", "kt", s.title, "接口先抽象，介质随时换。").style.cssText = "font-size:34px;font-weight:700;";
    el("div", "cap", s.title, "ABSTRACT FIRST · SWAP ANYTIME").style.marginTop = "10px";

    // DAG
    s.b = el("div", "abs", root);
    s.b.style.cssText = "inset:0;";
    s.dsvg = svg("svg", { width: 1920, height: 1080, style: "position:absolute;inset:0;overflow:visible" }, s.b);
    const pos = Object.fromEntries(DAG.map((d) => [d.id, d]));
    s.edges = EDGES.map(([a, z, at]) => {
      const A = pos[a];
      const Z = pos[z];
      const dpath = `M ${A.x + 130} ${A.y} C ${(A.x + Z.x) / 2} ${A.y}, ${(A.x + Z.x) / 2} ${Z.y}, ${Z.x - 130} ${Z.y}`;
      return { p: svg("path", { d: dpath, fill: "none", stroke: `rgba(${T.accentRGB},.85)`, "stroke-width": 2, "stroke-dasharray": 700, "stroke-dashoffset": 700 }, s.dsvg), at };
    });
    s.dnodes = DAG.map((d, i) => {
      const n = el("div", "node", s.b);
      n.style.left = `${d.x}px`;
      n.style.top = `${d.y}px`;
      n.style.minWidth = "250px";
      n.innerHTML = `<span style="font-family:var(--sh-mono);font-size:26px;color:var(--sh-volt);width:30px">${d.id}</span><div><div class="n-name">${d.cn}</div><div class="n-path">${d.en}</div></div>`;
      if (d.id === "D") n.style.borderStyle = "dashed";
      return { n, at: [84.2, 84.7, 85.2, 85.7][i] };
    });
    s.big = el("div", "abs", root);
    s.big.style.cssText = "left:0;right:0;top:880px;text-align:center;";
    el("div", "kt", s.big, "为团队而生，为扩展而建。").style.cssText = "font-size:52px;";
    el("div", "cap", s.big, "BUILT FOR TEAMS · BUILT TO EXTEND").style.marginTop = "16px";

    s.ch = chapter(root, "05", "扩", "EXTEND");
  },
  update(b, ctx) {
    updateChapter(s.ch, b, 76, 88);
    const toDag = prog(b, 83.8, 84.4, E.inOutCubic);
    css(s.a, { opacity: (1 - toDag).toFixed(3), transform: `scale(${(kf(b, [[76, 1, E.outExpo], [77, 1.1], [83.8, 1.14]]) * (1 - 0.3 * toDag)).toFixed(4)})`, display: toDag >= 1 ? "none" : "block" });
    css(s.title, { opacity: (prog(b, 76.5, 77) * (1 - toDag)).toFixed(3) });
    const hx = prog(b, 76, 76.6, E.outBack);
    s.hex.setAttribute("transform", `scale(${(hx * (1 + 0.05 * Math.max(...MODULES.map((m) => hit(b, m.at, 0.2))))).toFixed(4)})`);
    s.ring.setAttribute("transform", `rotate(${((b - 76) * 12).toFixed(2)}) scale(${hx.toFixed(3)})`);
    css(s.core, { opacity: prog(b, 76.3, 76.7).toFixed(2) });

    const g = ctx.fx;
    s.mods.forEach((m, i) => {
      const p = prog(b, m.at - 0.5, m.at, E.inCubic);
      const settle = hit(b, m.at, 0.15);
      const ox = m.from[0] * (1 - p);
      const oy = m.from[1] * (1 - p);
      const bump = settle * 10;
      css(m.n, {
        opacity: p > 0 ? "1" : "0",
        transform: `translate(calc(-50% + ${(ox - Math.sign(m.from[0]) * bump).toFixed(1)}px), calc(-50% + ${(oy - Math.sign(m.from[1]) * bump).toFixed(1)}px)) scale(${(1 + 0.05 * settle).toFixed(3)})`,
      });
      toggle(m.n, "is-lit", b >= m.at && b < m.at + 1.2);
      s.links[i].setAttribute("opacity", b >= m.at ? (0.35 + 0.65 * hit(b, m.at, 0.5)).toFixed(3) : "0");
      g.globalCompositeOperation = T.blend;
      const mx = CX + (m.x - CX) * 0.55;
      const my = CY + (m.y - CY) * 0.55;
      drawBurst(g, m.burst, b, m.at, mx, my);
      g.globalCompositeOperation = "source-over";
    });

    const dagOn = b >= 84;
    css(s.b, { display: dagOn ? "block" : "none" });
    if (dagOn) {
      s.dnodes.forEach((d) => {
        const p = prog(b, d.at, d.at + 0.4, E.outBack);
        css(d.n, { opacity: clamp(p).toFixed(3), transform: `translate(-50%,-50%) scale(${(0.7 + 0.3 * p).toFixed(3)})` });
        toggle(d.n, "is-lit", b >= d.at + 0.2 && b < d.at + 0.9);
      });
      s.edges.forEach((e) => e.p.setAttribute("stroke-dashoffset", (700 * (1 - prog(b, e.at, e.at + 0.5, E.outExpo))).toFixed(1)));
      const out = prog(b, 87.5, 88, E.inCubic);
      css(s.b, { opacity: (1 - out).toFixed(3), transform: `translateY(${(-60 * prog(b, 86.2, 87, E.outExpo)).toFixed(1)}px)` });
    }
    const bg = prog(b, 86.3, 86.9, E.outExpo);
    css(s.big, { opacity: (bg * (1 - prog(b, 87.6, 88))).toFixed(3), transform: `translateY(${(30 * (1 - bg)).toFixed(1)}px)`, filter: bg < 1 ? `blur(${(10 * (1 - bg)).toFixed(1)}px)` : "none" });
  },
};
