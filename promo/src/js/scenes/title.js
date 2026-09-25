// b40–44 冲击定名：Logo 从爆点里收束，字标逐字升起。
import { E, clamp, css, el, hit, kf, prog, revealChars, split } from "../engine.js";
import { drawBurst, drawRing, makeBurst } from "../fx.js";
import { logoSVG } from "../ui.js";

let s;

export default {
  id: "title",
  start: 40,
  end: 44,
  mount(root) {
    s = {};
    s.glow = el("div", "abs", root);
    s.glow.style.cssText = "left:960px;top:470px;width:1400px;height:1400px;margin:-700px 0 0 -700px;background:radial-gradient(closest-side,rgba(200,245,60,.22),rgba(200,245,60,.04) 45%,transparent);";
    s.cam = el("div", "abs", root);
    s.cam.style.cssText = "inset:0;transform-origin:960px 540px;";
    s.logo = el("div", "abs", s.cam, logoSVG(190));
    s.logo.style.cssText = "left:865px;top:375px;width:190px;height:190px;";
    s.spokes = [...s.logo.querySelectorAll(".lg-spoke")];
    s.nodes = [...s.logo.querySelectorAll(".lg-node")];
    s.spokes.forEach((l) => { l.setAttribute("stroke-dasharray", "30"); });

    const word = el("div", "abs", s.cam);
    word.style.cssText = "left:0;right:0;top:600px;text-align:center;overflow:hidden;padding-bottom:10px;";
    const inner = el("div", "kt-en", word);
    inner.style.fontSize = "150px";
    s.word = split(inner, "Skills Hub");

    s.tag = el("div", "abs", s.cam);
    s.tag.style.cssText = "left:0;right:0;top:800px;text-align:center;";
    const cn = el("div", "kt", s.tag);
    cn.style.cssText = "font-size:40px;font-weight:600;letter-spacing:0.01em;";
    s.tagChars = split(cn, "把团队散落的 Skills，收成一个系统。");
    s.tagEn = el("div", "cap", s.tag, "THE SKILL HUB FOR TEAMS");
    s.tagEn.style.marginTop = "16px";

    s.burst = makeBurst(40, 220, { speed: 1300, life: 2 });
    s.burst2 = makeBurst(41, 90, { speed: 500, life: 1.4, colors: ["#ffffff", "#c8f53c"] });
  },
  update(b, ctx) {
    const h = hit(b, 40, 0.5);
    const ls = kf(b, [[40, 2.6, E.outExpo], [40.9, 1], [43.4, 1.04, E.inCubic], [44, 3.2]]);
    css(s.logo, { transform: `scale(${ls.toFixed(4)}) rotate(${kf(b, [[40, -60, E.outExpo], [41, 0]]).toFixed(2)}deg)`, filter: `drop-shadow(0 0 ${(18 + 50 * h).toFixed(0)}px rgba(200,245,60,.6))` });
    s.spokes.forEach((l, i) => {
      const p = prog(b, 40 + i * 0.04, 40.6 + i * 0.04, E.outExpo);
      l.setAttribute("stroke-dashoffset", (30 * (1 - p)).toFixed(2));
    });
    s.nodes.forEach((n, i) => {
      const p = prog(b, 40.2 + i * 0.05, 40.6 + i * 0.05, E.outBack);
      n.setAttribute("r", (4.6 * p).toFixed(2));
    });
    css(s.glow, { opacity: (0.5 + 0.8 * h).toFixed(3), transform: `scale(${(0.8 + 0.4 * h).toFixed(3)})` });

    s.word.forEach((c, i) => {
      const p = prog(b, 40.3 + i * 0.05, 41 + i * 0.05, E.outExpo);
      css(c, { transform: `translateY(${(110 * (1 - p)).toFixed(1)}%)`, opacity: p > 0 ? "1" : "0" });
    });
    revealChars(s.tagChars, b, 42, 0.03, 0.5);
    css(s.tagEn, { opacity: (prog(b, 42.4, 43) * 0.9).toFixed(2) });

    const out = prog(b, 43.4, 44, E.inCubic);
    css(s.cam, { opacity: (1 - out).toFixed(3), transform: `scale(${(1 + 0.25 * out).toFixed(3)})`, filter: out > 0 ? `blur(${(12 * out).toFixed(1)}px)` : "none" });

    const g = ctx.fx;
    g.globalCompositeOperation = "lighter";
    drawRing(g, b, 40, 960, 470, 1500, 1.4, "200,245,60", 5);
    drawRing(g, b, 40.08, 960, 470, 900, 1.1, "255,255,255", 2);
    drawBurst(g, s.burst, b, 40, 960, 470);
    drawBurst(g, s.burst2, b, 40.05, 960, 470);
    g.globalCompositeOperation = "source-over";

    // 地面透视网格，慢慢亮起
    const grid = prog(b, 40.5, 42, E.outCubic) * (1 - out);
    if (grid > 0) {
      const bg = ctx.bg;
      bg.strokeStyle = `rgba(200,245,60,${(0.12 * grid).toFixed(3)})`;
      bg.lineWidth = 1;
      const horizon = 700;
      for (let i = -24; i <= 24; i++) {
        bg.beginPath();
        bg.moveTo(960 + i * 20, horizon);
        bg.lineTo(960 + i * 260, 1080);
        bg.stroke();
      }
      const off = (b * 0.35) % 1;
      for (let j = 0; j < 12; j++) {
        const z = (j + off) / 12;
        const y = horizon + (1080 - horizon) * z * z;
        bg.globalAlpha = clamp(z * 1.5);
        bg.beginPath();
        bg.moveTo(0, y);
        bg.lineTo(1920, y);
        bg.stroke();
      }
      bg.globalAlpha = 1;
    }
  },
};
