// b60–68 看：重做后的总览页从透视里落定，镜头依次推到 KPI、图表、列表。
import { E, css, el, hit, kf, prog, rollNum, toggle } from "../engine.js";
import { buildApp } from "../ui.js";
import { chapter, updateChapter } from "./chapter.js";

let s;

export default {
  id: "see",
  start: 60,
  end: 68,
  post: 0,
  mount(root) {
    s = {};
    s.stage = el("div", "abs", root);
    s.stage.style.cssText = "inset:0;perspective:2200px;";
    s.cam = el("div", "abs", s.stage);
    s.cam.style.cssText = "left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;";
    s.ui = buildApp(s.cam);
    s.ui.app.style.left = "160px";
    s.ui.app.style.top = "110px";
    s.ch = chapter(root, "03", "看", "SEE");
    s.cap = el("div", "abs", root);
    s.cap.style.cssText = "right:96px;top:92px;text-align:right;";
    el("div", "kt", s.cap, "一个地方，统一看。").style.cssText = "font-size:34px;font-weight:700;";
    el("div", "cap", s.cap, "ONE PLACE TO SEE EVERYTHING").style.marginTop = "10px";
  },
  update(b) {
    updateChapter(s.ch, b, 60, 62.1);
    css(s.cap, { opacity: (prog(b, 60.6, 61.2) * (1 - prog(b, 61.9, 62.3))).toFixed(3) });

    // 入场：从倾斜的远处落到正面
    const land = prog(b, 60, 61.8, E.outExpo);
    const rx = 32 * (1 - land);
    const rz = -10 * (1 - land);
    const ty = 380 * (1 - land);
    css(s.stage, { opacity: prog(b, 60, 60.3).toFixed(2) });

    // 镜头：[缩放, 焦点x, 焦点y]，焦点是窗口内要对准画面中心的点
    const [z, fx, fy] = kf(b, [
      [60, [0.86, 960, 580]],
      [62.2, [0.86, 960, 580], E.inOutExpo],
      [63.2, [1.45, 900, 380]],
      [64.2, [1.45, 900, 380], E.inOutExpo],
      [65.1, [1.3, 830, 600]],
      [65.8, [1.3, 830, 600], E.inOutExpo],
      [66.5, [1.35, 960, 870]],
      [67.3, [1.35, 960, 870], E.inOutCubic],
      [68, [0.9, 960, 560]],
    ]);
    const tx = 960 - fx * z;
    const tyy = 580 - fy * z;
    const pan = Math.abs(z - kf(b - 0.05, [[60, 0.86], [62.2, 0.86, E.inOutExpo], [63.2, 1.45], [64.2, 1.45, E.inOutExpo], [65.1, 1.3], [65.8, 1.3, E.inOutExpo], [66.5, 1.35], [67.3, 1.35, E.inOutCubic], [68, 0.9]]));
    css(s.cam, {
      transform: `translate(${tx.toFixed(1)}px,${(tyy + ty).toFixed(1)}px) scale(${z.toFixed(4)}) rotateX(${rx.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`,
      filter: pan > 0.02 ? `blur(${Math.min(6, pan * 60).toFixed(1)}px)` : "none",
    });

    s.ui.kpis.forEach((k, i) => {
      const at = 61 + i * 0.25;
      k.num.textContent = String(rollNum(b, at, at + 1.2, 0, k.value));
      toggle(k.card, "is-lit", b >= 62 + i * 0.5 && b < 62.5 + i * 0.5);
    });
    s.ui.bars.forEach((bar, i) => {
      const at = 62.5 + i * 0.12;
      const p = prog(b, at, at + 0.9, E.outBack);
      const max = 92;
      css(bar.ba, { height: `${(Math.max(0, p) * (bar.a / max) * 190).toFixed(1)}px` });
      css(bar.bb, { height: `${(Math.max(0, p) * (bar.v / max) * 190 * 0.9).toFixed(1)}px` });
      bar.num.textContent = String(Math.round(Math.max(0, Math.min(1, p)) * (bar.a + bar.v)));
    });
    s.ui.rows.forEach((r, i) => {
      const on = b >= 66 + i * 0.25;
      toggle(r.sw, "is-on", on);
      css(r.row, { background: on ? `rgba(200,245,60,${(0.08 * hit(b, 66 + i * 0.25, 0.4)).toFixed(3)})` : "transparent" });
    });
    toggle(s.ui.adopt, "is-pressed", b >= 67.4 && b < 67.55);
  },
};
