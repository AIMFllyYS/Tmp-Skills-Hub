// b104–114 定版：冲击 + Logo 锁定 + 一行命令。
import { E, css, el, hit, kf, prog, revealChars, split } from "../engine.js";
import { drawBurst, drawRing, makeBurst } from "../fx.js";
import { logoSVG } from "../ui.js";
import { world } from "./beyond.js";

let s;

export default {
  id: "finale",
  start: 104,
  end: 114,
  mount(root) {
    s = {};
    s.glow = el("div", "abs", root);
    s.glow.style.cssText = "left:960px;top:430px;width:1600px;height:1600px;margin:-800px 0 0 -800px;background:radial-gradient(closest-side,rgba(200,245,60,.16),transparent 60%);";
    s.lock = el("div", "abs", root);
    s.lock.style.cssText = "inset:0;transform-origin:960px 520px;";
    s.logo = el("div", "abs", s.lock, logoSVG(150));
    s.logo.style.cssText = "left:885px;top:300px;width:150px;height:150px;";
    const word = el("div", "abs", s.lock);
    word.style.cssText = "left:0;right:0;top:490px;text-align:center;overflow:hidden;padding-bottom:12px;";
    const inner = el("div", "kt-en", word);
    inner.style.fontSize = "136px";
    s.word = split(inner, "Skills Hub");
    s.tag = el("div", "abs", s.lock);
    s.tag.style.cssText = "left:0;right:0;top:668px;text-align:center;";
    const cn = el("div", "kt", s.tag);
    cn.style.cssText = "font-size:40px;font-weight:600;";
    s.tagChars = split(cn, "团队的 Skill 中枢 · Skills 连接一切");
    s.cmd = el("div", "abs", s.lock);
    s.cmd.style.cssText = "left:50%;top:780px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;height:56px;padding:0 22px;border:1px solid var(--sh-line-2);border-radius:12px;background:var(--sh-surface);font-family:var(--sh-mono);font-size:22px;white-space:nowrap;";
    s.cmd.innerHTML = "<span class='volt'>$</span><span>skills-hub ui</span>";
    s.caret = el("span", "", s.cmd);
    s.caret.style.cssText = "display:inline-block;width:12px;height:26px;background:var(--sh-volt);";
    s.foot = el("div", "abs cap", root, "SKILL-HUB · 社团内部试验版 · 2026");
    s.foot.style.cssText += "left:0;right:0;top:960px;text-align:center;font-size:13px;";
    s.burst = makeBurst(104, 260, { speed: 1400, life: 2.2 });
  },
  update(b, ctx) {
    const h = hit(b, 104, 0.6);
    const fade = prog(b, 112, 114, E.inCubic);
    const ls = kf(b, [[104, 2.4, E.outExpo], [105, 1], [114, 0.97]]);
    css(s.logo, { transform: `scale(${ls.toFixed(4)})`, filter: `drop-shadow(0 0 ${(16 + 60 * h).toFixed(0)}px rgba(200,245,60,.6))` });
    css(s.glow, { opacity: ((0.6 + 0.8 * h) * (1 - fade)).toFixed(3) });
    s.word.forEach((c, i) => {
      const p = prog(b, 104.25 + i * 0.05, 105 + i * 0.05, E.outExpo);
      css(c, { transform: `translateY(${(110 * (1 - p)).toFixed(1)}%)` });
    });
    revealChars(s.tagChars, b, 105.4, 0.035, 0.5);
    const c = prog(b, 106.6, 107.2, E.outExpo);
    css(s.cmd, { opacity: c.toFixed(3), transform: `translateX(-50%) translateY(${(20 * (1 - c)).toFixed(1)}px)` });
    css(s.caret, { opacity: b % 1 < 0.5 ? "1" : "0" });
    css(s.lock, { opacity: (1 - fade).toFixed(3), transform: `scale(${kf(b, [[104, 1.06, E.outExpo], [106, 1], [114, 0.97]]).toFixed(4)})` });
    css(s.foot, { opacity: (prog(b, 107.5, 108.5) * 0.8 * (1 - fade)).toFixed(3) });

    const g = ctx.fx;
    g.globalCompositeOperation = "lighter";
    drawRing(g, b, 104, 960, 375, 1600, 1.5, "200,245,60", 6);
    drawRing(g, b, 104.1, 960, 375, 1000, 1.2, "255,255,255", 2);
    drawBurst(g, s.burst, b, 104, 960, 375);
    const w = world.get();
    if (w) world.drawSphere(ctx.bg, w.main, (b - 96) * 0.32, 0.38, 1.35, 960, 1180, 0.22 * prog(b, 104.5, 106) * (1 - fade), null, 1);
    g.globalCompositeOperation = "source-over";
  },
};
