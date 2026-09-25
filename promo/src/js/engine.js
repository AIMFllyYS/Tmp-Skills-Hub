// 确定性时间线引擎：画面是 t（秒）的纯函数。渲染器逐帧 seek，预览模式跟随音频。

export const W = 1920;
export const H = 1080;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = lerp;

export const E = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t) => {
    const c1 = 1.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  // 阻尼弹簧：到 1 后有一次小回弹
  spring: (t) => 1 - Math.exp(-7 * t) * Math.cos(10 * t),
};

/** b 在 [b0,b1] 内的归一化进度，带缓动。 */
export const prog = (b, b0, b1, ease = E.linear) => ease(clamp((b - b0) / (b1 - b0)));

/** 进入—停留—退出 的可见度：[inStart,inEnd] 淡入，[outStart,outEnd] 淡出。 */
export function life(b, inStart, inEnd, outStart, outEnd, easeIn = E.outCubic, easeOut = E.inCubic) {
  if (b < inStart || b > outEnd) return 0;
  if (b < inEnd) return easeIn(clamp((b - inStart) / (inEnd - inStart)));
  if (b > outStart) return 1 - easeOut(clamp((b - outStart) / (outEnd - outStart)));
  return 1;
}

/** 关键帧：frames = [[beat, value, ease?], ...]，ease 作用于该帧到下一帧的区间。 */
export function kf(b, frames) {
  if (b <= frames[0][0]) return frames[0][1];
  for (let i = 0; i < frames.length - 1; i++) {
    const [b0, v0, ease = E.inOutCubic] = frames[i];
    const [b1, v1] = frames[i + 1];
    if (b <= b1) {
      const t = ease(clamp((b - b0) / (b1 - b0)));
      return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], t)) : lerp(v0, v1, t);
    }
  }
  return frames[frames.length - 1][1];
}

/** 冲击包络：命中后按指数衰减，用于闪白 / 震屏 / 发光。 */
export function hit(b, at, decay = 0.35) {
  if (b < at) return 0;
  return Math.exp(-(b - at) / decay);
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 稳定的伪哈希（片中展示用，真实产品是 sha256 文件夹哈希）。 */
export function fakeHash(text, len = 12) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let out = "";
  while (out.length < len) {
    for (let i = 0; i < text.length; i++) {
      h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
      h2 = Math.imul(h2 ^ (text.charCodeAt(i) + out.length), 2246822507) >>> 0;
    }
    out += ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0");
    text += out;
  }
  return out.slice(0, len);
}

/** 建 DOM：el("div", "a b", parent, html) */
export function el(tag, cls, parent, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}

const styleCache = new WeakMap();
/** 只在值变化时写 style，逐帧调用也不抖。 */
export function css(node, props) {
  let c = styleCache.get(node);
  if (!c) {
    c = {};
    styleCache.set(node, c);
  }
  for (const k in props) {
    const v = props[k];
    if (c[k] !== v) {
      c[k] = v;
      if (k.startsWith("--")) node.style.setProperty(k, v);
      else node.style[k] = v;
    }
  }
}

export function toggle(node, cls, on) {
  if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
}

/** 拆字，返回每个字的 span（空格保留宽度）。 */
export function split(parent, text, cls = "ch") {
  const out = [];
  for (const c of text) {
    const s = el("span", cls, parent);
    s.textContent = c === " " ? " " : c;
    out.push(s);
  }
  return out;
}

/** 逐字模糊显影：字从 blur+下沉 到清晰，stagger 以拍计。 */
export function revealChars(chars, b, start, stagger = 0.04, dur = 0.5, out = null) {
  chars.forEach((c, i) => {
    const p = prog(b, start + i * stagger, start + i * stagger + dur, E.outCubic);
    let o = p;
    let y = (1 - p) * 0.35;
    let blur = (1 - p) * 14;
    if (out) {
      const q = prog(b, out[0] + i * (out[2] ?? 0.02), out[1] + i * (out[2] ?? 0.02), E.inCubic);
      o *= 1 - q;
      y -= q * 0.3;
      blur += q * 10;
    }
    css(c, { opacity: o.toFixed(3), transform: `translateY(${y.toFixed(3)}em)`, filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none" });
  });
}

/** 数字滚动。 */
export const rollNum = (b, b0, b1, from, to, ease = E.outExpo) => Math.round(lerp(from, to, prog(b, b0, b1, ease)));

export function svg(tag, attrs, parent) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
