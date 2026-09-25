// 片中特效：故障字、粒子爆发、星空、冲击环。全部是 (b, frame) 的纯函数。
import { T } from "./theme.js";
import { E, W, H, clamp, css, el, rng } from "./engine.js";

/** 故障字：主层 + 红青色散层 + 横向切片层。 */
/** onDark：这段文字压在深色底上（反相镜头），色散层改用 screen。 */
export function glitchText(parent, html, cls = "", onDark = T.name === "dark") {
  const root = el("div", `glitch ${cls}`, parent);
  root.style.position = "relative";
  root.style.display = "inline-block";
  const main = el("div", "", root, html);
  main.style.position = "relative";
  const mk = (color, blend) => {
    const n = el("div", "", root, html);
    n.style.cssText = `position:absolute;inset:0;color:${color};mix-blend-mode:${blend};opacity:0;`;
    return n;
  };
  const pair = onDark ? [["#ff2a4d", "screen"], ["#2af0ff", "screen"]] : T.glitch;
  const red = mk(pair[0][0], pair[0][1]);
  const cyan = mk(pair[1][0], pair[1][1]);
  const slices = [];
  for (let i = 0; i < 6; i++) {
    const s = el("div", "", root, html);
    const top = (i / 6) * 100;
    s.style.cssText = `position:absolute;inset:0;clip-path:inset(${top}% 0 ${100 - top - 100 / 6}% 0);opacity:0;`;
    slices.push(s);
  }
  return { root, main, red, cyan, slices };
}

export function updateGlitch(g, amount, frame, seed = 1) {
  const r = rng(frame * 7919 + seed * 104729);
  const a = clamp(amount, 0, 2);
  const off = a * 14;
  css(g.red, { opacity: a > 0.02 ? "0.9" : "0", transform: `translate(${(-off - r() * off).toFixed(1)}px, ${(r() - 0.5) * off * 0.3}px)` });
  css(g.cyan, { opacity: a > 0.02 ? "0.9" : "0", transform: `translate(${(off + r() * off).toFixed(1)}px, ${(r() - 0.5) * off * 0.3}px)` });
  const sliceOn = a > 0.15;
  g.slices.forEach((s) => {
    const on = sliceOn && r() < 0.35 + a * 0.3;
    css(s, { opacity: on ? "1" : "0", transform: on ? `translateX(${((r() - 0.5) * a * 120).toFixed(1)}px)` : "none" });
  });
  css(g.main, { opacity: sliceOn && r() < a * 0.15 ? "0.2" : "1" });
}

/** 粒子爆发：预生成参数，按时间推进。 */
export function makeBurst(seed, count = 160, opts = {}) {
  const r = rng(seed);
  const colors = opts.colors ?? T.burst;
  return Array.from({ length: count }, () => {
    const a = r() * Math.PI * 2;
    return {
      a,
      v: (opts.speed ?? 900) * (0.25 + r() * 0.95),
      life: (opts.life ?? 1.6) * (0.4 + r() * 0.8),
      size: (opts.size ?? 2.6) * (0.4 + r()),
      color: colors[Math.floor(r() * colors.length)],
      streak: r() < 0.5,
    };
  });
}

export function drawBurst(ctx, parts, b, at, x, y, beatSec = 0.5) {
  const tt = b - at;
  if (tt < 0) return;
  for (const p of parts) {
    if (tt > p.life) continue;
    const k = tt / p.life;
    const d = p.v * E.outExpo(clamp(tt / p.life)) * p.life * beatSec;
    const px = x + Math.cos(p.a) * d;
    const py = y + Math.sin(p.a) * d;
    ctx.globalAlpha = (1 - k) * (1 - k);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    if (p.streak) {
      const back = 22 * (1 - k);
      ctx.lineWidth = p.size * 0.7;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.cos(p.a) * back, py - Math.sin(p.a) * back);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, p.size * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function drawRing(ctx, b, at, x, y, maxR = 1200, dur = 1.2, color = T.accentRGB, width = 3) {
  const tt = (b - at) / dur;
  if (tt < 0 || tt > 1) return;
  const r = maxR * E.outExpo(tt);
  ctx.strokeStyle = `rgba(${color},${(1 - tt) * 0.9})`;
  ctx.lineWidth = width * (1 - tt) + 0.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** 星空：z 随时间向镜头推进，speed 可按段落变化（曲速感）。 */
export function makeStars(seed, n = 900) {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ x: (r() - 0.5) * 4000, y: (r() - 0.5) * 2400, z: r(), m: 0.4 + r() * 0.8 }));
}

export function drawStars(ctx, stars, travel, alpha = 1, streak = 0) {
  const depth = 1;
  for (const s of stars) {
    let z = (s.z - travel) % depth;
    if (z <= 0) z += depth;
    const zz = 0.05 + z * 1.6;
    const px = W / 2 + s.x / zz / 2.2;
    const py = H / 2 + s.y / zz / 2.2;
    if (px < -50 || px > W + 50 || py < -50 || py > H + 50) continue;
    const bright = clamp((1 - z) * 1.2) * alpha * s.m;
    if (bright < 0.02) continue;
    ctx.globalAlpha = bright;
    ctx.fillStyle = T.star;
    if (streak > 0.01) {
      const zb = zz + streak * 0.25;
      const bx = W / 2 + s.x / zb / 2.2;
      const by = H / 2 + s.y / zb / 2.2;
      ctx.strokeStyle = T.star;
      ctx.lineWidth = 1.2 * (1.4 - z);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(px, py);
      ctx.stroke();
    } else {
      const size = 1.6 * (1.3 - z);
      ctx.fillRect(px, py, size, size);
    }
  }
  ctx.globalAlpha = 1;
}

/** 预生成颗粒噪声帧，逐帧轮换。黑白两色 + 低透明度，普通混合即可，不依赖 mix-blend-mode。 */
export function makeGrain(count = 8, w = 960, h = 540) {
  const frames = [];
  const r = rng(99);
  for (let i = 0; i < count; i++) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const img = g.createImageData(w, h);
    for (let p = 0; p < img.data.length; p += 4) {
      const v = r() < 0.5 ? 0 : 255;
      img.data[p] = v;
      img.data[p + 1] = v;
      img.data[p + 2] = v;
      img.data[p + 3] = Math.floor(r() * r() * 60);
    }
    g.putImageData(img, 0, 0);
    frames.push(c);
  }
  return frames;
}
