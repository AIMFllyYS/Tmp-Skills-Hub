// b0–8 起初，只是一个文件夹：光标、键入路径、SKILL.md 展开。
import { E, css, el, kf, life, prog, revealChars, split } from "../engine.js";

const PATH = "~/.claude/skills/pptx";
let s;

export default {
  id: "intro",
  start: 0,
  end: 8,
  mount(root) {
    s = {};
    s.cam = el("div", "abs", root);
    s.cam.style.cssText = "inset:0;transform-origin:960px 560px;";
    s.line = el("div", "abs", s.cam);
    s.line.style.cssText = "left:360px;width:1200px;top:540px;height:1px;background:linear-gradient(90deg,transparent,var(--sh-volt),transparent);transform-origin:center;";

    s.path = el("div", "abs kt-mono", s.cam);
    s.path.style.cssText = "left:0;right:0;top:512px;text-align:center;font-size:40px;color:var(--sh-ink-2);white-space:pre;";
    s.pathChars = split(s.path, PATH);
    s.pathChars.forEach((c, i) => { if (i >= 17) c.style.color = "var(--sh-ink)"; });
    s.caret = el("span", "", s.path);
    s.caret.style.cssText = "display:inline-block;width:18px;height:42px;margin-left:4px;vertical-align:-8px;background:var(--sh-volt-fill);box-shadow:0 0 18px var(--sh-volt-glow);";

    s.docWrap = el("div", "center", s.cam);
    s.docWrap.style.top = "590px";
    s.doc = el("div", "doc", s.docWrap);
    el("div", "d-file", s.doc, "<span style='color:var(--sh-volt)'>●</span> pptx / SKILL.md");
    const lines = [
      "<span class='d-dash'>---</span>",
      "<span class='d-k'>name</span>: <span class='d-v'>pptx</span>",
      "<span class='d-k'>description</span>: <span class='d-v'>Create, edit and analyze</span>",
      "<span class='d-v'>&nbsp;&nbsp;PowerPoint presentations.</span>",
      "<span class='d-dash'>---</span>",
      "<span class='dim'># 教会 Agent 做一件事</span>",
    ];
    s.lines = lines.map((h) => el("div", "", s.doc, h));
    s.scan = el("div", "abs", s.doc);
    s.scan.style.cssText = "left:0;right:0;height:120px;top:0;background:linear-gradient(180deg,transparent,var(--sh-volt-soft),transparent);pointer-events:none;";
    s.doc.style.position = "relative";
    s.doc.style.overflow = "hidden";

    s.cap = el("div", "abs", root);
    s.cap.style.cssText = "left:0;right:0;top:830px;text-align:center;";
    const cn = el("div", "kt", s.cap);
    cn.style.cssText = "font-size:46px;font-weight:700;letter-spacing:0.02em;";
    s.capChars = split(cn, "起初，只是一个文件夹。");
    s.capEn = el("div", "cap", s.cap, "IT STARTED WITH A FOLDER");
    s.capEn.style.marginTop = "16px";
  },
  update(b) {
    // 光标：键入前按拍闪烁，键入时常亮并跟随
    const typed = Math.floor(prog(b, 1, 3) * PATH.length + 1e-6);
    s.pathChars.forEach((c, i) => css(c, { opacity: i < typed ? "1" : "0", display: i < typed ? "inline" : "none" }));
    const blink = b < 1 || b > 3 ? (b % 1 < 0.5 ? 1 : 0.15) : 1;
    css(s.caret, { opacity: (blink * (1 - prog(b, 3.2, 3.6))).toFixed(2) });

    const lw = kf(b, [[0.3, 0, E.outExpo], [1.2, 1], [3, 1, E.inCubic], [3.4, 0]]);
    css(s.line, { transform: `scaleX(${lw.toFixed(3)})`, opacity: (lw * 0.9).toFixed(3) });

    // 路径上移，文档展开
    const up = prog(b, 3, 3.6, E.outExpo);
    css(s.path, { transform: `translateY(${(-250 * up).toFixed(1)}px) scale(${(1 - 0.35 * up).toFixed(3)})` });
    const open = prog(b, 3.2, 4, E.outExpo);
    css(s.docWrap, { opacity: open.toFixed(3), transform: `translate(-50%,-50%) scaleY(${(0.02 + 0.98 * open).toFixed(3)}) scaleX(${(0.6 + 0.4 * open).toFixed(3)})` });
    s.lines.forEach((ln, i) => {
      const p = prog(b, 3.8 + i * 0.25, 4.3 + i * 0.25, E.outCubic);
      css(ln, { opacity: p.toFixed(3), transform: `translateX(${(-16 * (1 - p)).toFixed(1)}px)`, filter: p < 1 ? `blur(${(6 * (1 - p)).toFixed(1)}px)` : "none" });
    });
    css(s.scan, { transform: `translateY(${kf(b, [[5.5, -140], [6.6, 420]]).toFixed(0)}px)`, opacity: life(b, 5.5, 5.7, 6.4, 6.6).toFixed(2) });

    revealChars(s.capChars, b, 4.4, 0.07, 0.6, [7.2, 7.7, 0.015]);
    css(s.capEn, { opacity: (life(b, 5.2, 5.8, 7.2, 7.6) * 0.9).toFixed(3) });

    // 推镜：最后两拍往文档里压
    const push = kf(b, [[5.8, 1, E.inCubic], [8, 1.55]]);
    const tilt = kf(b, [[5.8, 0, E.inCubic], [8, 8]]);
    css(s.cam, { transform: `perspective(1400px) scale(${push.toFixed(4)}) rotateX(${tilt.toFixed(2)}deg)` });
  },
};
