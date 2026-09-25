// b44–52 收：散落的副本被吸进统一库存，581 → 213，按内容哈希去重。
import { ROOTS, SCAN, SKILLS } from "../data.js";
import { E, clamp, css, el, fakeHash, hit, kf, lerp, prog, rng, rollNum } from "../engine.js";
import { glyph, logoSVG } from "../ui.js";
import { caption, chapter, updateCaption, updateChapter } from "./chapter.js";

const SX = 700;
const SY = 560;
let s;

export default {
  id: "store",
  start: 44,
  end: 52,
  mount(root) {
    s = {};
    const r = rng(44);
    s.ch = chapter(root, "01", "收", "STORE");

    s.tiles = Array.from({ length: 64 }, (_, i) => {
      const [name, src] = SKILLS[i % SKILLS.length];
      const t = el("div", "tile", root);
      glyph(name, src, t);
      const m = el("div", "t-meta", t);
      el("div", "t-name", m, name);
      el("div", "t-src", m, ROOTS[(i * 5) % ROOTS.length]);
      const a = r() * Math.PI * 2;
      const d = 700 + r() * 700;
      return { t, x0: SX + Math.cos(a) * d * 1.3, y0: SY + Math.sin(a) * d * 0.7, s0: 0.5 + r() * 0.8, rot: (r() - 0.5) * 50, at: 44 + r() * 2.6, dur: 0.7 + r() * 0.5 };
    });

    // 库存面板：先是一个小盒子，收完后展开成列表
    s.panel = el("div", "abs sh-card", root);
    s.panel.style.cssText += `left:${SX}px;top:${SY}px;overflow:hidden;border-radius:18px;background:var(--sh-bg-2);`;
    s.head = el("div", "", s.panel);
    s.head.style.cssText = "display:flex;align-items:center;gap:14px;height:84px;padding:0 24px;border-bottom:1px solid var(--sh-line);white-space:nowrap;";
    el("div", "", s.head, logoSVG(34));
    el("div", "", s.head, "<div style='font-size:18px;font-weight:600'>统一库存</div><div class='sh-hash' style='margin-top:4px'>~/.skills-hub/skills</div>");
    s.headCount = el("div", "sh-chip is-volt", s.head, "213 个 skill");
    s.headCount.style.marginLeft = "auto";

    const rows = [
      ["pptx", "anthropic", 17], ["frontend-design", "anthropic", 25], ["systematic-debugging", "superpowers", 17],
      ["demo-init", "local", 26, "A"], ["demo-init", "local", 26, "B"], ["skill-creator", "anthropic", 14], ["remotion-best-practices", "remotion", 10],
    ];
    s.rows = rows.map(([name, src, copies, variant]) => {
      const row = el("div", "", s.panel);
      row.style.cssText = "display:grid;grid-template-columns:36px 1fr 150px 180px;align-items:center;gap:14px;height:58px;padding:0 24px;border-bottom:1px solid var(--sh-line);white-space:nowrap;";
      glyph(name, src, row);
      el("div", "sh-row-name", row, `${name}${variant ? ` <span class='sh-chip' style='height:20px;margin-left:8px;color:var(--sh-c-amber);border-color:rgba(255,181,71,.4)'>变体 ${variant}</span>` : ""}`);
      el("div", "sh-hash", row, `<b>sha256</b> ${fakeHash(name + (variant ?? ""), 8)}`);
      el("div", "", row, `<span class='dim' style='font-family:var(--sh-mono);font-size:13px'>${variant ? 13 : copies} 份副本 → </span><span class='volt' style='font-family:var(--sh-mono);font-size:13px'>1</span>`);
      return row;
    });

    s.counter = el("div", "abs", root);
    s.counter.style.cssText = "left:1340px;top:330px;";
    s.num = el("div", "kt-en", s.counter);
    s.num.style.cssText = "font-size:200px;font-family:var(--sh-font);font-weight:600;letter-spacing:-0.05em;font-variant-numeric:tabular-nums;";
    s.numLabel = el("div", "kt", s.counter);
    s.numLabel.style.cssText = "margin-top:10px;font-size:44px;font-weight:700;";
    s.numEn = el("div", "cap", s.counter);
    s.numEn.style.marginTop = "14px";

    s.cap = caption(root, "按整个文件夹的内容哈希去重，不按文件名。", "DEDUPED BY CONTENT HASH · NOT BY FILE NAME");
  },
  update(b, ctx) {
    updateChapter(s.ch, b, 44, 52);
    const g = ctx.fx;
    let pulse = 0;
    s.tiles.forEach((tl) => {
      const p = prog(b, tl.at, tl.at + tl.dur, E.inCubic);
      const pb = prog(b - 0.07, tl.at, tl.at + tl.dur, E.inCubic);
      if (p >= 1) {
        css(tl.t, { opacity: "0" });
        pulse += hit(b, tl.at + tl.dur, 0.25);
        return;
      }
      const x = lerp(tl.x0, SX, p);
      const y = lerp(tl.y0, SY, p);
      const sc = lerp(tl.s0, 0.15, p);
      css(tl.t, { opacity: (clamp(prog(b, 44, 44.3)) * (1 - p * p)).toFixed(3), transform: `translate(${(x - 116).toFixed(1)}px,${(y - 36).toFixed(1)}px) rotate(${(tl.rot * (1 - p)).toFixed(1)}deg) scale(${sc.toFixed(3)})` });
      if (p > 0.05) {
        const xb = lerp(tl.x0, SX, pb);
        const yb = lerp(tl.y0, SY, pb);
        const grad = g.createLinearGradient(xb, yb, x, y);
        grad.addColorStop(0, "rgba(200,245,60,0)");
        grad.addColorStop(1, `rgba(200,245,60,${(0.55 * p).toFixed(3)})`);
        g.strokeStyle = grad;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(xb, yb);
        g.lineTo(x, y);
        g.stroke();
      }
    });

    const open = prog(b, 47.6, 48.6, E.outExpo);
    const pw = lerp(380, 820, open);
    const ph = lerp(86, 86 + 58 * 7, open);
    const px = kf(b, [[47.6, SX], [48.6, 660, E.outExpo]]);
    css(s.panel, {
      width: `${pw.toFixed(1)}px`,
      height: `${ph.toFixed(1)}px`,
      transform: `translate(${(px - SX - pw / 2).toFixed(1)}px,${(-ph / 2).toFixed(1)}px) scale(${(kf(b, [[44, 0.6, E.outBack], [44.5, 1]]) * (1 + 0.04 * Math.min(1, pulse)) * lerp(1, 1.2, open)).toFixed(4)})`,
      opacity: prog(b, 44, 44.3).toFixed(2),
      boxShadow: `0 0 0 1px rgba(200,245,60,${(0.2 + 0.5 * Math.min(1, pulse)).toFixed(3)}), 0 0 ${(30 + 60 * Math.min(1, pulse)).toFixed(0)}px -6px rgba(200,245,60,${(0.2 + 0.5 * Math.min(1, pulse)).toFixed(3)})`,
    });
    css(s.headCount, { opacity: prog(b, 48.2, 48.6).toFixed(2) });
    s.rows.forEach((row, i) => {
      const p = prog(b, 48.4 + i * 0.25, 48.9 + i * 0.25, E.outCubic);
      css(row, { opacity: p.toFixed(3), transform: `translateY(${(14 * (1 - p)).toFixed(1)}px)`, background: i >= 3 && i <= 4 && b > 50 ? "rgba(255,181,71,.06)" : "transparent" });
    });

    const n = rollNum(b, 45, 48, SCAN.copies, SCAN.unique, E.inOutCubic);
    s.num.textContent = String(n);
    const done = b >= 48;
    s.numLabel.textContent = done ? "个真正不同的 skill" : "份副本";
    s.numEn.textContent = done ? "UNIQUE BY CONTENT" : "COPIES FLOWING IN";
    css(s.counter, { opacity: prog(b, 44.4, 44.9).toFixed(2), transform: `scale(${(1 + 0.08 * hit(b, 48, 0.2)).toFixed(3)})`, transformOrigin: "left center" });
    css(s.num, { color: done ? "var(--sh-volt)" : "var(--sh-ink)" });

    updateCaption(s.cap, b, 48.8, 52);
  },
};
