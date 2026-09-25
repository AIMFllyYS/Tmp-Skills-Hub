// b52–60 链：库存居中，逐拍把符号链接挂到 8 个 Agent；改一处，全局同步。
import { T } from "../theme.js";
import { CLIENTS } from "../data.js";
import { E, css, el, hit, kf, prog, svg, toggle } from "../engine.js";
import { logoSVG } from "../ui.js";
import { caption, chapter, updateCaption, updateChapter } from "./chapter.js";

const CX = 960;
const CY = 560;
let s;

export default {
  id: "link",
  start: 52,
  end: 60,
  mount(root) {
    s = {};
    s.cam = el("div", "abs", root);
    s.cam.style.cssText = "inset:0;transform-origin:960px 560px;";
    s.svg = svg("svg", { width: 1920, height: 1080, viewBox: "0 0 1920 1080", style: "position:absolute;inset:0;overflow:visible" }, s.cam);
    s.nodes = CLIENTS.map((c, i) => {
      const a = (-90 + 22.5 + i * 45) * (Math.PI / 180);
      const x = CX + Math.cos(a) * 640;
      const y = CY + Math.sin(a) * 320;
      const len = Math.hypot(x - CX, y - CY);
      const line = svg("line", { x1: CX, y1: CY, x2: x, y2: y, stroke: `rgba(${T.accentRGB},.85)`, "stroke-width": 2, "stroke-dasharray": len, "stroke-dashoffset": len }, s.svg);
      const dot = svg("circle", { r: 5, fill: T.accent, opacity: 0 }, s.svg);
      const n = el("div", "node", s.cam);
      n.style.left = `${x}px`;
      n.style.top = `${y}px`;
      el("i", "sh-client-dot", n).style.cssText = `width:12px;height:12px;border-radius:4px;background:${c.color}`;
      el("div", "", n, `<div class="n-name">${c.name}</div><div class="n-path">${c.path}/pptx <span class="volt">→</span></div>`);
      const ok = el("div", "sh-chip is-volt", n, "✓ 已同步");
      ok.style.cssText += "margin-left:6px;opacity:0;";
      return { n, line, dot, len, x, y, ok, at: 52 + i };
    });

    s.hub = el("div", "abs", s.cam);
    s.hub.style.cssText = `left:${CX - 90}px;top:${CY - 90}px;width:180px;height:180px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(closest-side,rgba(${T.glowRGB},.22),transparent);`;
    el("div", "", s.hub, logoSVG(110));
    s.hubLabel = el("div", "abs", s.cam, "<div style='font-size:18px;font-weight:600'>skills-hub</div><div class='sh-hash' style='margin-top:4px'>~/.skills-hub/skills/pptx</div>");
    s.hubLabel.style.cssText += `left:${CX - 200}px;width:400px;top:${CY + 88}px;text-align:center;`;

    s.edit = el("div", "abs sh-card", s.cam);
    s.edit.style.cssText += `left:${CX - 190}px;top:${CY - 200}px;width:380px;padding:12px 16px;font-family:var(--sh-mono);font-size:14px;`;
    s.edit.innerHTML = "<div class='dim'>pptx/SKILL.md · 修改</div><div style='margin-top:6px'><span style='color:var(--sh-err)'>- version: 1</span></div><div><span class='volt'>+ version: 2</span></div>";

    s.ch = chapter(root, "02", "链", "LINK");
    s.cap = caption(root, "改一处，全局生效。不漂移。", "ONE SOURCE · SYMLINKED INTO EVERY AGENT");
  },
  update(b) {
    updateChapter(s.ch, b, 52, 60);
    css(s.cam, { transform: `scale(${kf(b, [[52, 1.12, E.outExpo], [53.5, 1], [60, 0.96]]).toFixed(4)}) rotate(${kf(b, [[52, -1.5], [60, 1.5]]).toFixed(2)}deg)` });
    css(s.hub, { transform: `scale(${(prog(b, 52, 52.4, E.outBack) * (1 + 0.12 * hit(b, 58.5, 0.3))).toFixed(3)})` });
    css(s.hubLabel, { opacity: prog(b, 52.2, 52.6).toFixed(2) });

    const wave = hit(b, 58.5, 0.5);
    s.nodes.forEach((nd, i) => {
      const draw = prog(b, nd.at - 0.2, nd.at + 0.15, E.outExpo);
      nd.line.setAttribute("stroke-dashoffset", (nd.len * (1 - draw)).toFixed(1));
      nd.line.setAttribute("stroke-width", (2 + 3 * wave).toFixed(2));
      nd.line.setAttribute("stroke", `rgba(${T.accentRGB},${(0.55 + 0.45 * Math.max(wave, hit(b, nd.at, 0.3))).toFixed(3)})`);
      const appear = prog(b, nd.at - 0.35, nd.at, E.outBack);
      css(nd.n, { opacity: appear.toFixed(3), transform: `translate(-50%,-50%) scale(${(0.7 + 0.3 * appear + 0.06 * hit(b, nd.at + 0.15, 0.2)).toFixed(3)})` });
      toggle(nd.n, "is-lit", b >= nd.at + 0.1);
      // 链上流动的光点；改动时一起冲向外侧
      const cycle = b >= 58.5 ? prog(b, 58.5, 59.2, E.outCubic) : ((b - nd.at) * 0.8 + i * 0.13) % 1;
      const on = b >= nd.at + 0.15;
      nd.dot.setAttribute("cx", (CX + (nd.x - CX) * cycle).toFixed(1));
      nd.dot.setAttribute("cy", (CY + (nd.y - CY) * cycle).toFixed(1));
      nd.dot.setAttribute("opacity", on ? (b >= 58.5 ? 1 - cycle * 0.3 : 0.8).toFixed(2) : "0");
      nd.dot.setAttribute("r", b >= 58.5 ? "7" : "4.5");
      css(nd.ok, { opacity: prog(b, 59 + i * 0.03, 59.2 + i * 0.03).toFixed(2) });
    });
    const e = prog(b, 57.8, 58.2, E.outBack);
    css(s.edit, { opacity: (e * (1 - prog(b, 59.4, 59.8))).toFixed(3), transform: `translateY(${(20 * (1 - e)).toFixed(1)}px) scale(${(0.9 + 0.1 * e).toFixed(3)})` });
    updateCaption(s.cap, b, 55.8, 60);
  },
};
