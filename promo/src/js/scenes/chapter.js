// 章节题签与底部字幕：四个章节（收 / 链 / 看 / 享）和后续段落共用。
import { E, css, el, life, prog, revealChars, split } from "../engine.js";

export function chapter(root, num, cn, en) {
  const c = el("div", "chapter", root);
  const n = el("div", "ch-num", c, num);
  const line = el("div", "ch-line", c);
  const big = el("div", "ch-cn", c, cn);
  const e = el("div", "ch-en", c, en);
  return { c, n, line, big, e };
}

export function updateChapter(ch, b, start, end) {
  const p = prog(b, start, start + 0.6, E.outExpo);
  const out = prog(b, end - 0.4, end, E.inCubic);
  css(ch.c, { opacity: (1 - out).toFixed(3) });
  css(ch.n, { opacity: p.toFixed(3) });
  css(ch.line, { transform: `scaleX(${p.toFixed(3)})` });
  css(ch.big, { opacity: p.toFixed(3), transform: `translateY(${(24 * (1 - p)).toFixed(1)}px)` });
  css(ch.e, { opacity: (prog(b, start + 0.2, start + 0.8) * 0.9).toFixed(3) });
}

export function caption(root, cn, en, top = null) {
  const c = el("div", "caption", root);
  if (top !== null) {
    c.style.bottom = "auto";
    c.style.top = `${top}px`;
  }
  const t = el("div", "c-cn", c);
  const chars = split(t, cn);
  const e = el("div", "c-en", c, en);
  return { c, chars, e };
}

export function updateCaption(cap, b, at, outAt) {
  const v = life(b, at, at + 0.3, outAt - 0.3, outAt);
  css(cap.c, { display: v > 0 ? "block" : "none" });
  if (v <= 0) return;
  revealChars(cap.chars, b, at, 0.03, 0.45, [outAt - 0.35, outAt, 0.005]);
  css(cap.e, { opacity: (v * 0.9).toFixed(3) });
}
