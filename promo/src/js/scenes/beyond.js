// b96–104 跨次元：界面坍缩成点，长成一颗 skill 星球，再拉远成团队星系 —— Skills 连接一切。
import { SKILLS } from "../data.js";
import { E, W, H, clamp, css, el, kf, prog, rng } from "../engine.js";
import { drawRing, drawStars, makeStars } from "../fx.js";

let s;

function fib(n, r) {
  const pts = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    pts.push([Math.cos(g * i) * rad * r, y * r, Math.sin(g * i) * rad * r]);
  }
  return pts;
}

function makeWorld() {
  const r = rng(96);
  const main = { c: [0, 0, 0], R: 380, pts: fib(1100, 1), arcs: [] };
  for (let i = 0; i < 80; i++) main.arcs.push([Math.floor(r() * 1100), Math.floor(r() * 1100), r(), r() < 0.7 ? "200,245,60" : r() < 0.5 ? "90,215,255" : "162,147,255"]);
  const names = ["前端组", "后端组", "设计组", "算法组", "社团", "企业团队", "开源世界"];
  const sats = names.map((name, i) => {
    const a = (i / names.length) * Math.PI * 2 + 0.4;
    const d = 1350 + r() * 350;
    return { name, c: [Math.cos(a) * d, Math.sin(a) * d * 0.55, (r() - 0.5) * 600], R: 120 + r() * 90, pts: fib(260, 1), arcs: [], spin: r() * 6 };
  });
  return { main, sats, labels: SKILLS.map((x) => x[0]) };
}

/** 画一颗点阵球。z 为镜头缩放，alpha 为整体透明度。 */
function drawSphere(g, sph, yaw, pitch, z, cx, cy, alpha, labels = null, arcP = 1) {
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const proj = (p) => {
    const x = p[0] * cyw - p[2] * syw;
    let zz = p[0] * syw + p[2] * cyw;
    const y = p[1] * cp - zz * sp;
    zz = p[1] * sp + zz * cp;
    const f = 1.6 / (1.6 - zz * 0.35);
    return [cx + (sph.c[0] + x * sph.R * f) * z, cy + (sph.c[1] + y * sph.R * f) * z, zz];
  };
  const P = sph.pts.map(proj);
  for (let i = 0; i < P.length; i++) {
    const [x, y, d] = P[i];
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    const front = (d + 1) / 2;
    g.globalAlpha = alpha * (0.15 + 0.85 * front);
    g.fillStyle = i % 11 === 0 ? "#c8f53c" : "#dfe7f0";
    const sz = (0.8 + 1.8 * front) * Math.max(0.6, z);
    g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
  }
  // 弧线：球面上两点之间向外鼓起的曲线，按进度生长
  for (const [ia, ib, ph, col] of sph.arcs) {
    const a = sph.pts[ia];
    const b = sph.pts[ib];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const ml = Math.hypot(...m) || 1;
    const lift = 1.25 + ph * 0.25;
    const ctrl = [(m[0] / ml) * lift, (m[1] / ml) * lift, (m[2] / ml) * lift];
    const grow = clamp(arcP * 1.6 - ph * 0.6);
    if (grow <= 0) continue;
    g.strokeStyle = `rgba(${col},${(0.55 * alpha).toFixed(3)})`;
    g.lineWidth = 1.2;
    g.beginPath();
    const steps = 18;
    for (let k = 0; k <= steps * grow; k++) {
      const t = k / steps;
      const q = [0, 1, 2].map((j) => (1 - t) * (1 - t) * a[j] + 2 * (1 - t) * t * ctrl[j] + t * t * b[j]);
      const [x, y] = proj(q);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  if (labels) {
    g.font = `500 ${Math.round(13 * Math.max(0.7, z))}px "Geist Mono Variable", monospace`;
    for (let i = 0; i < P.length; i += 29) {
      const [x, y, d] = P[i];
      if (d < 0.25) continue;
      g.globalAlpha = alpha * clamp((d - 0.25) * 2) * 0.85;
      g.fillStyle = "#a3abb6";
      g.fillText(labels[(i / 29) % labels.length | 0], x + 6, y - 6);
    }
  }
  g.globalAlpha = 1;
  return P;
}

export const world = { get: () => s?.world, drawSphere };

export default {
  id: "beyond",
  start: 96,
  end: 104,
  mount(root) {
    s = { world: makeWorld(), stars: makeStars(7, 1100) };
    s.words = [
      [98, "Skills", "kt-en", 290],
      [100, "连接", "kt", 280],
      [102, "一切", "kt", 280],
    ].map(([at, text, cls, size]) => {
      const n = el("div", `center ${cls}`, root, text);
      n.style.fontSize = `${size}px`;
      n.style.textShadow = "0 0 60px rgba(200,245,60,.35), 0 0 2px rgba(255,255,255,.4)";
      return { at, n };
    });
    s.sub = el("div", "abs cap", root, "SKILLS CONNECT EVERYTHING");
    s.sub.style.cssText += "left:0;right:0;top:760px;text-align:center;font-size:18px;color:var(--sh-ink-2);";
  },
  update(b, ctx) {
    const g = ctx.fx;
    const bg = ctx.bg;
    const warp = prog(b, 96, 97.6, E.outCubic);
    const travel = (b - 96) * 0.08 + E.outExpo(warp) * 0.6;
    drawStars(bg, s.stars, travel, clamp(prog(b, 96, 96.3) * (1 - prog(b, 103.3, 103.5))), (1 - warp) * 1.2);

    const emerge = prog(b, 96, 97.2, E.outExpo);
    const zoom = kf(b, [[96, 0.001, E.outExpo], [97.2, 1], [98.8, 1.06, E.inOutCubic], [102.8, 0.36], [103.5, 0.3]]);
    const yaw = (b - 96) * 0.32;
    const alpha = clamp(emerge * (1 - prog(b, 103.2, 103.5)));
    const { main, sats } = s.world;
    const cx = W / 2;
    const cy = H / 2;

    g.globalCompositeOperation = "lighter";
    drawRing(g, b, 96, cx, cy, 1300, 1.2, "200,245,60", 4);
    drawSphere(g, main, yaw, 0.38, zoom, cx, cy, alpha, s.world.labels, prog(b, 96.6, 99.5));
    const satOn = prog(b, 99.3, 100.6, E.outCubic) * alpha;
    if (satOn > 0) {
      sats.forEach((sat, i) => {
        drawSphere(g, sat, yaw * 1.4 + sat.spin, 0.3, zoom, cx, cy, satOn * 0.9, null, 0);
        const sx = cx + sat.c[0] * zoom;
        const sy = cy + sat.c[1] * zoom;
        // 星系间长弧：主星球 → 卫星
        const grow = prog(b, 99.6 + i * 0.12, 100.8 + i * 0.12, E.outCubic);
        if (grow > 0) {
          const mx = (cx + sx) / 2;
          const my = (cy + sy) / 2 - 180 * zoom;
          g.strokeStyle = `rgba(200,245,60,${(0.6 * satOn).toFixed(3)})`;
          g.lineWidth = 1.4;
          g.beginPath();
          for (let k = 0; k <= 30 * grow; k++) {
            const t = k / 30;
            const x = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * mx + t * t * sx;
            const y = (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * my + t * t * sy;
            if (k === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
        g.globalAlpha = satOn;
        g.fillStyle = "#f3f5f7";
        g.font = '600 20px "Noto Sans SC Variable", sans-serif';
        g.textAlign = "center";
        g.fillText(sat.name, sx, sy + sat.R * zoom + 34);
        g.textAlign = "left";
        g.globalAlpha = 1;
      });
    }
    g.globalCompositeOperation = "source-over";

    s.words.forEach((w, i) => {
      const end = i < 2 ? s.words[i + 1].at : 103.5;
      const on = b >= w.at && b < end;
      css(w.n, { display: on ? "block" : "none" });
      if (!on) return;
      const tt = b - w.at;
      const inP = E.outExpo(clamp(tt / 0.35));
      const outP = prog(b, end - 0.2, end, E.inCubic);
      css(w.n, {
        opacity: (inP * (1 - outP)).toFixed(3),
        transform: `translate(-50%,-50%) scale(${(1.25 - 0.25 * inP + tt * 0.03 + outP * 0.2).toFixed(4)})`,
        filter: inP < 1 || outP > 0 ? `blur(${(18 * (1 - inP) + 16 * outP).toFixed(1)}px)` : "none",
      });
    });
    css(s.sub, { opacity: (prog(b, 102.2, 102.6) * (1 - prog(b, 103.2, 103.5)) * 0.9).toFixed(3) });
  },
};
