// b24–40 很多，很怪，没人知道：真机扫描的数字 + 快切提问 + 故障大字。
import { T } from "../theme.js";
import { ROOTS, SCAN, SKILLS } from "../data.js";
import { E, clamp, css, el, fakeHash, hit, kf, life, prog, rng, rollNum, toggle } from "../engine.js";
import { glitchText, updateGlitch } from "../fx.js";
import { glyph } from "../ui.js";

let s;

function tile(parent, name, src, sub) {
  const t = el("div", "tile", parent);
  glyph(name, src, t);
  const m = el("div", "t-meta", t);
  el("div", "t-name", m, name);
  el("div", "t-src", m, sub);
  return t;
}

const QUESTIONS = [
  [32, "谁在用什么？", "WHO USES WHAT?", "dark"],
  [33, "哪一份是最新的？", "WHICH ONE IS LATEST?", "light"],
  [34, "改的是哪一份？", "WHICH COPY DID I EDIT?", "dark"],
  [35, "删了会怎样？", "WHAT BREAKS IF I DELETE IT?", "light"],
];
const WORDS = [[36, "很多。"], [37, "很怪。"], [38, "没人知道。"]];

export default {
  id: "chaos",
  start: 24,
  end: 40,
  mount(root) {
    s = {};
    const r = rng(24);

    // 背景：三列路径瀑布
    s.paths = el("div", "abs", root);
    s.paths.style.cssText = "inset:0;overflow:hidden;";
    s.cols = [0, 1, 2].map((c) => {
      const col = el("div", "abs kt-mono", s.paths);
      col.style.cssText = `left:${120 + c * 600}px;top:0;font-size:22px;line-height:44px;color:var(--sh-ink-3);opacity:.4;white-space:nowrap;`;
      for (let i = 0; i < 60; i++) {
        const p = ROOTS[(i * 7 + c * 11) % ROOTS.length];
        const name = SKILLS[(i * 5 + c * 3) % SKILLS.length][0];
        const line = el("div", "", col, `${p}/<span style="color:var(--sh-ink-2)">${name}</span>`);
        if ((i + c) % 9 === 0) line.style.color = "var(--sh-volt)";
      }
      return col;
    });

    // 背景：3D 散乱卡片场
    s.field = el("div", "abs", root);
    s.field.style.cssText = "left:960px;top:540px;transform-style:preserve-3d;";
    s.flying = Array.from({ length: 70 }, (_, i) => {
      const [name, src] = SKILLS[i % SKILLS.length];
      const t = tile(s.field, name, src, ROOTS[(i * 3) % ROOTS.length]);
      const a = r() * Math.PI * 2;
      return { t, a, v: 500 + r() * 1100, z: -1400 + r() * 1700, rx: (r() - 0.5) * 140, ry: (r() - 0.5) * 140, rz: (r() - 0.5) * 90, ox: (r() - 0.5) * 600, oy: (r() - 0.5) * 300 };
    });

    // shot1：27 → 581
    s.shot1 = el("div", "abs", root);
    s.shot1.style.cssText = "inset:0;";
    const big = el("div", "abs", s.shot1);
    big.style.cssText = "left:150px;top:260px;";
    s.bigNum = glitchText(big, "27", "kt-en");
    s.bigNum.root.style.cssText += "font-size:420px;font-family:var(--sh-font);font-weight:600;letter-spacing:-0.06em;";
    s.label1 = el("div", "abs", s.shot1);
    s.label1.style.cssText = "left:1060px;top:420px;";
    s.l1cn = el("div", "kt", s.label1, "个 skills 目录");
    s.l1cn.style.fontSize = "72px";
    s.l1en = el("div", "cap", s.label1, "CLIENT ROOTS ON ONE MACHINE");
    s.l1en.style.marginTop = "18px";
    s.l1sub = el("div", "abs kt", s.shot1, "同一个 skill，被复制了一遍又一遍。");
    s.l1sub.style.cssText += "left:0;right:0;top:760px;text-align:center;font-size:38px;font-weight:600;";

    // shot2：demo-init ×26 扇形牌堆
    s.shot2 = el("div", "abs", root);
    s.shot2.style.cssText = "inset:0;";
    s.deck = el("div", "abs", s.shot2);
    s.deck.style.cssText = "left:700px;top:860px;";
    s.cards = Array.from({ length: SCAN.demoInit }, (_, i) => tile(s.deck, "demo-init", "local", ROOTS[i % ROOTS.length]));
    s.x26 = el("div", "abs kt-en", s.shot2);
    s.x26.style.cssText = "left:1320px;top:250px;font-size:230px;color:var(--sh-volt);font-family:var(--sh-mono);font-weight:500;";
    s.x26cap = el("div", "abs", s.shot2);
    s.x26cap.style.cssText = "left:1330px;top:510px;";
    el("div", "kt", s.x26cap, "demo-init").style.cssText = "font-size:44px;font-family:var(--sh-mono);font-weight:500;";
    el("div", "cap", s.x26cap, "26 COPIES · 2 VARIANTS").style.marginTop = "14px";
    s.varA = el("div", "abs sh-chip", s.shot2, `变体 A · #${fakeHash("demo-init-a", 8)}`);
    s.varB = el("div", "abs sh-chip", s.shot2, `变体 B · #${fakeHash("demo-init-b", 8)}`);
    [s.varA, s.varB].forEach((v) => (v.style.cssText += "height:34px;font-size:16px;font-family:var(--sh-mono);border-color:var(--sh-c-amber);color:var(--sh-c-amber);background:rgba(255,181,71,.1);"));
    s.q2 = el("div", "abs", s.shot2);
    s.q2.style.cssText = "left:0;right:0;top:830px;text-align:center;";
    s.q2a = el("div", "kt", s.q2, "同名，内容却不同。");
    s.q2a.style.fontSize = "40px";
    s.q2b = glitchText(el("div", "", s.q2), "哪一份才是真的？", "kt");
    s.q2b.root.style.cssText += "font-size:40px;margin-top:6px;color:var(--sh-volt);";

    // shot3：四连问，黑白反相快切
    s.shot3 = el("div", "abs", root);
    s.shot3.style.cssText = "inset:0;";
    s.qs = QUESTIONS.map(([at, cn, en, tone], i) => {
      const box = el("div", "abs", s.shot3);
      box.style.cssText = `inset:0;background:${tone === "light" ? "var(--sh-invert-bg)" : "transparent"};`;
      const g = glitchText(el("div", "center", box), cn, "kt", tone === "light" ? T.name !== "dark" : T.name === "dark");
      g.root.parentElement.style.textAlign = "center";
      g.root.style.cssText += `font-size:${[190, 150, 160, 180][i]}px;color:${tone === "light" ? "var(--sh-invert-ink)" : i === 2 ? "var(--sh-volt)" : "var(--sh-ink)"};`;
      const cap = el("div", "abs cap", box, en);
      cap.style.cssText += `left:0;right:0;top:${i % 2 ? 300 : 740}px;text-align:center;color:${tone === "light" ? "#5c6470" : "var(--sh-ink-3)"};font-size:18px;`;
      const idx = el("div", "abs kt-mono", box, `0${i + 1} / 04`);
      idx.style.cssText += `left:160px;top:180px;font-size:16px;color:${tone === "light" ? "#5c6470" : "var(--sh-ink-3)"};`;
      return { at, box, g };
    });

    // shot4：很多 / 很怪 / 没人知道
    s.shot4 = el("div", "abs", root);
    // 三记重音用反相底：浅色片里是全片最暗的一刻，紧接黑场与定名闪白
    s.shot4.style.cssText = "inset:0;background:var(--sh-invert-bg);color:var(--sh-invert-ink);";
    s.scan = el("div", "abs", s.shot4);
    s.scan.style.cssText = "inset:0;background:repeating-linear-gradient(0deg,rgba(128,128,128,.07) 0 2px,transparent 2px 5px);";
    s.words = WORDS.map(([at, w], i) => {
      const box = el("div", "center", s.shot4);
      const g = glitchText(box, w, "kt", T.name !== "dark");
      g.root.style.cssText += `font-size:${i === 2 ? 230 : 300}px;font-weight:900;`;
      return { at, box, g };
    });
  },
  update(b, ctx) {
    const f = ctx.frame;

    // 路径瀑布：b24–31 可见，速度很快
    const pathsOn = life(b, 24, 24.3, 30.6, 31.2);
    css(s.paths, { opacity: (pathsOn * (b >= 28 ? 0.45 : 1)).toFixed(3), display: pathsOn > 0 ? "block" : "none", filter: b >= 25 ? "blur(2px)" : "none" });
    s.cols.forEach((c, i) => css(c, { transform: `translateY(${(-((b - 24) * (360 + i * 90)) % 1320).toFixed(0)}px)` }));

    // 卡片场：b24 从中心炸开，之后缓慢漂浮；在提问段作为暗背景
    const fieldOn = b < 39.5;
    css(s.field, { display: fieldOn ? "block" : "none" });
    if (fieldOn) {
      const burst = E.outExpo(clamp((b - 24) / 2.2));
      const drift = b - 24;
      const dim = b >= 28 ? 0.28 : 1;
      const swarm = prog(b, 38, 39.5, E.inCubic);
      s.flying.forEach((p, i) => {
        const d = p.v * burst + drift * 30 + swarm * 900;
        const x = p.ox * (1 - burst) + Math.cos(p.a) * d;
        const y = p.oy * (1 - burst) + Math.sin(p.a) * d * 0.62;
        const z = p.z * burst + swarm * 600;
        css(p.t, {
          opacity: (dim * clamp(1 - Math.max(0, z) / 900)).toFixed(3),
          transform: `translate3d(${(x - 116).toFixed(1)}px,${(y - 36).toFixed(1)}px,${z.toFixed(0)}px) rotateX(${(p.rx * burst + drift * 6).toFixed(1)}deg) rotateY(${(p.ry * burst).toFixed(1)}deg) rotateZ(${(p.rz * burst + i).toFixed(1)}deg)`,
        });
      });
      css(s.field, { transform: `perspective(1200px) rotateZ(${(drift * 1.5).toFixed(2)}deg)`, filter: b >= 28 && b < 38 ? "blur(3px)" : "none" });
    }

    // shot1
    const on1 = b >= 24.9 && b < 28;
    css(s.shot1, { display: on1 ? "block" : "none" });
    if (on1) {
      const n = b < 26 ? SCAN.roots : rollNum(b, 26, 26.45, SCAN.roots, SCAN.copies);
      const txt = String(n);
      [s.bigNum.main, s.bigNum.red, s.bigNum.cyan, ...s.bigNum.slices].forEach((node) => { if (node.textContent !== txt) node.textContent = txt; });
      const punch = Math.max(hit(b, 25, 0.12), hit(b, 26, 0.12));
      css(s.bigNum.root, { transform: `scale(${(1 + 0.18 * punch).toFixed(3)})`, transformOrigin: "left center" });
      updateGlitch(s.bigNum, punch * 1.4, f, 3);
      const cn = b < 26 ? "个 skills 目录" : "份副本";
      const en = b < 26 ? "CLIENT ROOTS ON ONE MACHINE" : "COPIES · SAME SKILLS, AGAIN AND AGAIN";
      if (s.l1cn.textContent !== cn) s.l1cn.textContent = cn;
      if (s.l1en.textContent !== en) s.l1en.textContent = en;
      css(s.label1, { transform: `translateX(${b < 26 ? 0 : 150}px) translateY(${(-30 * punch).toFixed(1)}px)`, opacity: prog(b, 25, 25.2).toFixed(2) });
      css(s.l1sub, { opacity: life(b, 26.6, 26.9, 27.7, 28).toFixed(3), transform: `translateY(${(20 * (1 - prog(b, 26.6, 27, E.outCubic))).toFixed(1)}px)` });
    }

    // shot2
    const on2 = b >= 28 && b < 32;
    css(s.shot2, { display: on2 ? "block" : "none" });
    if (on2) {
      const shown = Math.min(SCAN.demoInit, Math.floor(prog(b, 28, 29.6) * SCAN.demoInit + 1));
      s.cards.forEach((c, i) => {
        const vis = i < shown;
        const t = i / (SCAN.demoInit - 1);
        const spread = prog(b, 28 + i * 0.06, 28.6 + i * 0.06, E.outExpo);
        const ang = (-62 + t * 124) * spread;
        const lift = i === 5 || i === 20 ? prog(b, 30, 30.5, E.outBack) * 90 : 0;
        css(c, {
          opacity: vis ? "1" : "0",
          transform: `translate(-116px,-36px) rotate(${ang.toFixed(2)}deg) translateY(${(-(120 + 330 * spread) - lift).toFixed(1)}px)`,
          zIndex: String(i === 5 || i === 20 ? 100 : i),
        });
        toggle(c, "is-hot", (i === 5 || i === 20) && b >= 30);
      });
      css(s.deck, { transform: `translateY(${kf(b, [[28, 120], [29.6, 0, E.outCubic], [32, -10]]).toFixed(0)}px) rotate(${kf(b, [[28, -4], [32, 3]]).toFixed(2)}deg) scale(${kf(b, [[28, 0.92], [32, 1.04]]).toFixed(3)})` });
      s.x26.textContent = `×${shown}`;
      css(s.x26, { transform: `scale(${(1 + 0.08 * hit(b, 28 + (shown - 1) * (1.6 / SCAN.demoInit), 0.08)).toFixed(3)})`, transformOrigin: "left center" });
      const va = prog(b, 30, 30.4, E.outBack);
      css(s.varA, { left: "1330px", top: "700px", opacity: va.toFixed(2), transform: `scale(${(0.7 + 0.3 * va).toFixed(3)})` });
      css(s.varB, { left: "1330px", top: "752px", opacity: va.toFixed(2), transform: `scale(${(0.7 + 0.3 * va).toFixed(3)})` });
      css(s.q2a, { opacity: life(b, 30, 30.3, 32, 32).toFixed(2) });
      css(s.q2b.root, { opacity: prog(b, 31, 31.1).toFixed(2), transform: `scale(${(1 + 0.2 * hit(b, 31, 0.15)).toFixed(3)})` });
      updateGlitch(s.q2b, hit(b, 31, 0.2) + (b >= 31.5 && b < 32 ? 1.2 : 0), f, 5);
    }

    // shot3：每拍一问
    const on3 = b >= 32 && b < 36;
    css(s.shot3, { display: on3 ? "block" : "none" });
    if (on3) {
      s.qs.forEach((q, i) => {
        const on = b >= q.at && b < q.at + 1;
        css(q.box, { display: on ? "block" : "none" });
        if (!on) return;
        const tt = b - q.at;
        const zoom = 1.12 - 0.12 * E.outExpo(clamp(tt / 0.4)) + tt * 0.04;
        css(q.g.root, { transform: `scale(${zoom.toFixed(4)})` });
        updateGlitch(q.g, hit(b, q.at, 0.1) * 1.2 + (i === 3 && b >= 35.5 ? 1.5 : 0), f, 10 + i);
      });
    }

    // shot4
    const on4 = b >= 36 && b < 39.5;
    css(s.shot4, { display: on4 ? "block" : "none" });
    if (on4) {
      s.words.forEach((w, i) => {
        const next = i < 2 ? WORDS[i + 1][0] : 39.5;
        const on = b >= w.at && b < next;
        css(w.box, { display: on ? "block" : "none" });
        if (!on) return;
        const tt = b - w.at;
        const build = i === 2 ? prog(b, 38.5, 39.5, E.inCubic) : 0;
        const sc = 1.25 - 0.25 * E.outExpo(clamp(tt / 0.3)) + build * 0.25;
        css(w.box, { transform: `translate(-50%,-50%) scale(${sc.toFixed(4)})` });
        updateGlitch(w.g, hit(b, w.at, 0.15) * 1.3 + build * 1.6, f, 20 + i);
      });
      css(s.scan, { opacity: (0.5 + 0.5 * prog(b, 38, 39.5)).toFixed(2), transform: `translateY(${((b * 37) % 5).toFixed(1)}px)` });
    }
  },
};
