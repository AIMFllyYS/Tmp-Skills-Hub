// b8–24 一个、十个、一百个：卡片每两拍翻倍，从中心向外长。
import { ROOTS, SKILLS } from "../data.js";
import { E, clamp, css, el, kf, lerp, life, prog, revealChars, rng, split, toggle } from "../engine.js";
import { glyph } from "../ui.js";

const CW = 252;
const CH = 92;
const COUNT = 128;
let s;

function batchOf(i) {
  return i === 0 ? 0 : Math.ceil(Math.log2(i + 1));
}

export default {
  id: "growth",
  start: 8,
  end: 24,
  mount(root) {
    s = {};
    const r = rng(8);
    const cells = [];
    for (let row = -4; row < 4; row++) for (let col = -8; col < 8; col++) {
      const x = (col + 0.5) * CW;
      const y = (row + 0.5) * CH;
      cells.push({ x, y, d: Math.hypot(x / 1.6, y) + r() * 30 });
    }
    cells.sort((a, b) => a.d - b.d);
    // 第一张固定在正中
    cells[0] = { x: 0, y: 0, d: 0 };

    s.plane = el("div", "abs", root);
    s.plane.style.cssText = "left:960px;top:540px;width:0;height:0;transform-style:preserve-3d;";
    s.tiles = cells.slice(0, COUNT).map((c, i) => {
      const [name, src] = i === 0 ? SKILLS[0] : SKILLS[Math.floor(r() * SKILLS.length)];
      const t = el("div", "tile", s.plane);
      glyph(name, src, t);
      const meta = el("div", "t-meta", t);
      el("div", "t-name", meta, name);
      el("div", "t-src", meta, i === 0 ? "~/.claude/skills" : ROOTS[Math.floor(r() * ROOTS.length)]);
      return { t, x: c.x - 116, y: c.y - 36, at: 8 + batchOf(i) * 2 + (i === 0 ? 0 : r() * 0.45), jx: r() - 0.5, jy: r() - 0.5, ph: r() * 6.28 };
    });
    // 每一批完成后的取景：把已出现的卡装进画面
    s.fit = [];
    for (let k = 0; k <= 7; k++) {
      const n = Math.min(COUNT, 2 ** k);
      let mx = 0;
      let my = 0;
      for (let i = 0; i < n; i++) {
        mx = Math.max(mx, Math.abs(cells[i].x) + 126);
        my = Math.max(my, Math.abs(cells[i].y) + 46);
      }
      s.fit.push(Math.min(1.7, 1560 / (2 * mx), 700 / (2 * my)));
    }

    s.counter = el("div", "abs", root);
    s.counter.style.cssText = "left:96px;top:176px;";
    el("div", "cap", s.counter, "SKILLS · 本机").style.letterSpacing = "0.2em";
    s.num = el("div", "kt-en", s.counter);
    s.num.style.cssText = "margin-top:10px;font-size:84px;font-family:var(--sh-mono);font-weight:500;letter-spacing:-0.02em;";

    const phrases = [
      [8.6, "有人写了一个。", "SOMEONE WROTE ONE"],
      [12.5, "大家都开始写。", "THEN EVERYONE DID"],
      [16.5, "装进每一个 Agent。", "INSTALLED INTO EVERY AGENT"],
      [20.5, "越来越多。", "MORE. AND MORE."],
    ];
    s.phrases = phrases.map(([at, cn, en]) => {
      const box = el("div", "abs", root);
      box.style.cssText = "left:0;right:0;top:806px;text-align:center;";
      const glow = el("div", "abs", box);
      glow.style.cssText = "left:50%;top:40%;width:900px;height:220px;transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(5,6,7,.92),transparent);";
      const t = el("div", "kt", box);
      t.style.cssText = "position:relative;font-size:60px;";
      const chars = split(t, cn);
      const e = el("div", "cap", box, en);
      e.style.cssText += "position:relative;margin-top:14px;";
      return { at, box, chars, e };
    });
  },
  update(b, ctx) {
    const k = clamp(Math.floor((b - 8) / 2), 0, 7);
    const since = b - (8 + k * 2);
    const prev = s.fit[Math.max(0, k - 1)];
    let scale = k === 0 ? kf(b, [[8, 2.2, E.outExpo], [9.2, s.fit[0]]]) : lerp(prev, s.fit[k], E.outExpo(clamp(since / 1.2)));
    scale *= 1 + 0.03 * Math.exp(-since * 5);
    const rx = kf(b, [[8, 0], [24, 22]]);
    const rz = kf(b, [[8, 0], [24, -6]]);
    const shakeIn = prog(b, 21.5, 24, E.inCubic);
    css(s.plane, { transform: `perspective(1600px) rotateX(${rx.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${scale.toFixed(4)})` });

    for (let i = 0; i < s.tiles.length; i++) {
      const tl = s.tiles[i];
      const p = prog(b, tl.at, tl.at + 0.5, E.outBack);
      const o = prog(b, tl.at, tl.at + 0.2);
      if (o <= 0) {
        css(tl.t, { opacity: "0" });
        continue;
      }
      const jit = shakeIn * 14;
      const x = tl.x + tl.jx * jit * Math.sin(b * 9 + tl.ph);
      const y = tl.y + tl.jy * jit * Math.cos(b * 11 + tl.ph);
      css(tl.t, {
        opacity: o.toFixed(3),
        transform: `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${(0.55 + 0.45 * p).toFixed(3)})`,
      });
      toggle(tl.t, "is-hot", b - tl.at < 0.6 && b >= tl.at);
    }

    const n = Math.min(COUNT, 2 ** k);
    const shown = b < 22 ? n : Math.round(lerp(128, 213, prog(b, 22, 23.6, E.outExpo)));
    s.num.textContent = String(shown).padStart(3, "0");
    css(s.counter, { opacity: prog(b, 8.2, 8.8).toFixed(2), transform: `scale(${(1 + 0.06 * Math.exp(-since * 6)).toFixed(3)})`, transformOrigin: "left top" });

    s.phrases.forEach((p) => {
      const v = life(b, p.at, p.at + 0.3, p.at + 3.0, p.at + 3.4);
      css(p.box, { opacity: v > 0 ? "1" : "0" });
      if (v <= 0) return;
      revealChars(p.chars, b, p.at, 0.05, 0.45, [p.at + 3.0, p.at + 3.4, 0.01]);
      css(p.e, { opacity: (v * 0.9).toFixed(3) });
    });
    void ctx;
  },
};
