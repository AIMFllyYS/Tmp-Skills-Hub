// b88–96 每个人在用什么：成员主页卡逐拍滑入，接社团精选排行。
import { T } from "../theme.js";
import { SKILLS, TEAM } from "../data.js";
import { E, clamp, css, el, hit, kf, prog, toggle } from "../engine.js";
import { glyph } from "../ui.js";
import { chapter, updateChapter } from "./chapter.js";

const BOARD = [
  ["frontend-design", 18], ["systematic-debugging", 15], ["pptx", 13], ["vercel-react-best-practices", 11], ["brainstorming", 9],
];
let s;

export default {
  id: "team",
  start: 88,
  end: 96,
  mount(root) {
    s = {};
    s.head = el("div", "abs", root);
    s.head.style.cssText = "right:96px;top:92px;text-align:right;";
    el("div", "kt", s.head, "每个人在用什么，一目了然。").style.cssText = "font-size:34px;font-weight:700;";
    el("div", "cap", s.head, "PROFILES · PINS · CLUB PICKS").style.marginTop = "10px";

    s.cards = TEAM.map((m, i) => {
      const c = el("div", "abs sh-card", root);
      c.style.cssText += `left:${150 + i * 420}px;top:250px;width:380px;padding:26px;border-radius:20px;`;
      const top = el("div", "", c);
      top.style.cssText = "display:flex;align-items:center;gap:16px;";
      el("div", "sh-avatar", top, m.handle[1].toUpperCase()).style.cssText = `width:64px;height:64px;font-size:24px;background:${m.color}`;
      el("div", "", top, `<div style="font-family:var(--sh-mono);font-size:20px">${m.handle}</div><div style="margin-top:8px"><span class="sh-chip">${m.role}</span></div>`);
      el("div", "", c, `<div style="margin-top:24px;font-size:14px;color:var(--sh-ink-3)">在用</div><div style="font-size:48px;font-weight:600;letter-spacing:-0.04em;margin-top:4px">${m.n}<span style="font-size:18px;color:var(--sh-ink-3);margin-left:6px">个 skill</span></div>`);
      el("div", "", c, "<div style='margin:20px 0 10px;padding-top:18px;border-top:1px solid var(--sh-line);font-size:12px;letter-spacing:.12em;color:var(--sh-ink-3)'>置顶</div>");
      m.pins.forEach((p) => {
        const src = SKILLS.find((x) => x[0] === p)[1];
        const row = el("div", "", c);
        row.style.cssText = "display:flex;align-items:center;gap:12px;height:48px;";
        glyph(p, src, row);
        el("div", "sh-row-name", row, p).style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--sh-mono);font-size:14px;";
      });
      return { c, at: 88 + i * 0.5 };
    });

    s.board = el("div", "abs sh-card", root);
    s.board.style.cssText += "left:460px;top:290px;width:1000px;padding:28px 32px;border-radius:22px;";
    el("div", "", s.board, "<div style='display:flex;align-items:center'><div style='font-size:24px;font-weight:600'>社团精选 · 本周</div><span class='sh-chip is-volt' style='margin-left:auto'>全站排行</span></div>");
    s.rows = BOARD.map(([name, n], i) => {
      const src = SKILLS.find((x) => x[0] === name)[1];
      const row = el("div", "", s.board);
      row.style.cssText = "display:grid;grid-template-columns:44px 40px 1fr 300px 90px;align-items:center;gap:16px;height:84px;border-bottom:1px solid var(--sh-line);";
      el("div", "", row, String(i + 1)).style.cssText = `font-family:var(--sh-mono);font-size:30px;color:${i === 0 ? "var(--sh-volt)" : "var(--sh-ink-3)"}`;
      glyph(name, src, row);
      el("div", "sh-row-name", row, name).style.fontSize = "18px";
      const track = el("div", "", row);
      track.style.cssText = "height:10px;border-radius:5px;background:var(--sh-surface-3);overflow:hidden;";
      const fill = el("div", "", track);
      fill.style.cssText = `height:100%;border-radius:5px;background:${i === 0 ? "var(--sh-volt-fill)" : "var(--sh-c-cyan)"};`;
      el("div", "", row, `${n} 人启用`).style.cssText = "font-family:var(--sh-mono);font-size:14px;color:var(--sh-ink-2);text-align:right;";
      return { row, fill, n, at: 92.2 + i * 0.25 };
    });

    s.ch = chapter(root, "06", "人", "TEAM");
  },
  update(b) {
    updateChapter(s.ch, b, 88, 96);
    css(s.head, { opacity: (prog(b, 88.3, 88.8) * (1 - prog(b, 95.5, 96))).toFixed(3) });
    const leave = prog(b, 91.6, 92.1, E.inExpo);
    s.cards.forEach((c, i) => {
      const p = prog(b, c.at, c.at + 0.5, E.outExpo);
      const y = -900 * prog(b, 91.6 + i * 0.05, 92.1 + i * 0.05, E.inExpo);
      css(c.c, { opacity: (clamp(p) * (1 - leave * 0.3)).toFixed(3), transform: `translate(${(700 * (1 - p)).toFixed(1)}px,${y.toFixed(1)}px) rotate(${(6 * (1 - p)).toFixed(2)}deg)`, display: b > 92.3 ? "none" : "block" });
      toggle(c.c, "is-lit", b >= c.at + 0.3 && b < c.at + 0.9);
    });
    const bIn = prog(b, 92, 92.5, E.outExpo);
    const zoom = kf(b, [[94.5, 1, E.inOutCubic], [95.6, 1.12], [96, 0.2, E.inExpo]]);
    css(s.board, { display: b >= 92 ? "block" : "none", opacity: (bIn * (1 - prog(b, 95.6, 96))).toFixed(3), transform: `translateY(${(80 * (1 - bIn)).toFixed(1)}px) scale(${(zoom * 1.2).toFixed(4)})` });
    s.rows.forEach((r, i) => {
      const p = prog(b, r.at, r.at + 0.35, E.outCubic);
      css(r.row, { opacity: p.toFixed(3), transform: `translateX(${(-30 * (1 - p)).toFixed(1)}px)` });
      css(r.fill, { width: `${(prog(b, r.at + 0.1, r.at + 0.9, E.outExpo) * (r.n / 18) * 100).toFixed(1)}%` });
      if (i === 0) css(r.row, { background: `rgba(${T.glowRGB},${(0.14 * prog(b, 94, 94.5) + 0.1 * hit(b, 94, 0.3)).toFixed(3)})` });
    });
  },
};
