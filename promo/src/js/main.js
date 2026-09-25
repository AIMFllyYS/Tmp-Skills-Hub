// 舞台入口：挂载所有场景，提供 window.__seek(t) 给逐帧渲染器；?play 时跟随音频实时预览。
import { E, H, W, clamp, css, el, hit, prog, rng } from "./engine.js";
import { makeGrain } from "./fx.js";
import intro from "./scenes/intro.js";
import growth from "./scenes/growth.js";
import chaos from "./scenes/chaos.js";
import title from "./scenes/title.js";
import store from "./scenes/store.js";
import link from "./scenes/link.js";
import see from "./scenes/see.js";
import share from "./scenes/share.js";
import extend from "./scenes/extend.js";
import team from "./scenes/team.js";
import beyond from "./scenes/beyond.js";
import finale from "./scenes/finale.js";

const SCENES = [intro, growth, chaos, title, store, link, see, share, extend, team, beyond, finale];

const cues = await fetch("./cues.json").then((r) => r.json());
const BEAT = 60 / cues.bpm;
const FPS = cues.fps;

const stage = document.getElementById("stage");
const world = document.getElementById("world");
const bgC = document.getElementById("bg");
const fxC = document.getElementById("fx");
const bg = bgC.getContext("2d");
const fx = fxC.getContext("2d");
const post = document.getElementById("post");

const vignette = el("div", "", post);
vignette.id = "vignette";
const grain = el("canvas", "", post);
grain.id = "grain";
grain.width = 960;
grain.height = 540;
const grainCtx = grain.getContext("2d");
const grainFrames = makeGrain();
const flare = el("div", "", post);
flare.id = "flare";
const bars = el("div", "", post);
bars.id = "bars";
const barTop = el("i", "", bars);
const barBot = el("i", "", bars);
const flash = el("div", "", post);
flash.id = "flash";
const black = el("div", "", post);
black.style.cssText = "position:absolute;inset:0;background:#000;opacity:0;";

// 信箱里的「拉片」信息：影片前 40 拍是「过去」，带时间码；冲击之后信箱打开，进入产品时代
const hud = el("div", "", post);
hud.id = "hud";
const hudTL = el("div", "", hud);
const hudTR = el("div", "", hud);
const hudBL = el("div", "", hud);
const hudBR = el("div", "", hud);
[hudTL, hudTR, hudBL, hudBR].forEach((n, i) => {
  n.style.cssText = `position:absolute;${i % 2 ? "right" : "left"}:64px;${i < 2 ? "top" : "bottom"}:56px;font-family:var(--sh-mono);font-size:13px;letter-spacing:.14em;color:#5c6470;white-space:nowrap;`;
});
hudTL.textContent = "SKILL-HUB · FIRST SYNC · 2026.08.15";

for (const sc of SCENES) {
  sc.root = el("div", `scene scene-${sc.id}`, world);
  sc.mount(sc.root);
}

const SHAKES = [
  [8, 0.4], [24, 1], [25, 0.6], [26, 0.6], [31.5, 0.5], [36, 1.1], [37, 1.1], [38, 1.3],
  [40, 1.6], [44, 0.4], [52, 0.3], [60, 0.3], [68, 0.3], [77, 0.5], [79, 0.5], [81, 0.5], [83, 0.5],
  [96, 1.1], [98, 0.7], [100, 0.7], [102, 0.8], [104, 1.4],
];
const FLASHES = [[8, 0.25], [24, 0.5], [40, 1], [44, 0.25], [96, 0.7], [104, 1]];
const FLARES = [[24, 540, 0.6], [40, 470, 1], [96, 540, 0.8], [104, 375, 1]];

function timecode(t) {
  const f = Math.floor((t % 1) * 24);
  const s = Math.floor(t);
  return `TC 00:00:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

let lastFrame = -1;
export function render(t) {
  const b = t / BEAT;
  const frame = Math.round(t * FPS);
  bg.clearRect(0, 0, W, H);
  fx.clearRect(0, 0, W, H);
  const ctx = { b, t, frame, bg, fx };

  for (const sc of SCENES) {
    const on = b >= sc.start - (sc.pre ?? 0) && b < sc.end + (sc.post ?? 0);
    if (sc.root.classList.contains("is-on") !== on) sc.root.classList.toggle("is-on", on);
    if (on) sc.update(b, ctx);
  }

  // 震屏
  let amp = 0;
  for (const [at, a] of SHAKES) amp += a * hit(b, at, 0.18);
  const r = rng(frame * 31 + 7);
  const sx = (r() - 0.5) * 36 * amp;
  const sy = (r() - 0.5) * 24 * amp;
  const rot = (r() - 0.5) * 1.2 * amp;
  css(world, { transform: amp > 0.01 ? `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) rotate(${rot.toFixed(3)}deg)` : "none" });
  css(fxC, { transform: amp > 0.01 ? `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)` : "none" });

  let fl = 0;
  for (const [at, a] of FLASHES) fl = Math.max(fl, a * hit(b, at, 0.1));
  css(flash, { opacity: fl.toFixed(3) });

  let flr = 0;
  let flrY = 540;
  for (const [at, y, a] of FLARES) {
    const v = a * hit(b, at, 0.5);
    if (v > flr) {
      flr = v;
      flrY = y;
    }
  }
  css(flare, { opacity: flr.toFixed(3), top: `${flrY}px`, transform: `scaleX(${(0.6 + 0.6 * flr).toFixed(3)}) scaleY(${(1 + 2 * flr).toFixed(2)})` });

  const silent = cues.silences.some(([a, z]) => b >= a && b < z);
  css(black, { opacity: silent ? "1" : "0" });

  // 信箱：b0–40 合上，b40 冲击时打开
  const barH = 140 * (1 - prog(b, 40, 40.8, E.outExpo));
  css(barTop, { height: `${barH.toFixed(1)}px` });
  css(barBot, { height: `${barH.toFixed(1)}px` });
  const hudOn = b < 40 ? 1 : 0;
  css(hud, { opacity: String(hudOn) });
  if (hudOn) {
    const sec = cues.sections.find((x) => b >= x.start && b < x.end);
    const idx = cues.sections.indexOf(sec) + 1;
    hudTR.textContent = `SCENE ${String(idx).padStart(2, "0")} — ${sec.id.toUpperCase()}`;
    hudBL.textContent = timecode(t);
    hudBR.innerHTML = `<span style="color:${b % 1 < 0.5 ? "#ff5a5a" : "#5c6470"}">●</span> REC`;
  }

  if (frame !== lastFrame) {
    grainCtx.clearRect(0, 0, 960, 540);
    grainCtx.drawImage(grainFrames[frame % grainFrames.length], 0, 0);
    lastFrame = frame;
  }
  css(grain, { opacity: (0.7 + 0.3 * clamp(amp)).toFixed(3) });
}

// 字体：隐藏场景是 display:none，不会触发加载，这里按全部文字显式预载
async function loadFonts() {
  const text = world.textContent + "0123456789×→·#$";
  const loads = [];
  for (const w of [400, 500, 600, 700, 800, 900]) {
    loads.push(document.fonts.load(`${w} 40px "Noto Sans SC Variable"`, text));
    loads.push(document.fonts.load(`${w} 40px "Geist Variable"`, text));
    loads.push(document.fonts.load(`${w} 40px "Geist Mono Variable"`, text));
  }
  loads.push(document.fonts.load('600 20px "Noto Sans SC Variable"', "前端组后端组设计组算法组社团企业团队开源世界"));
  await Promise.all(loads);
  await document.fonts.ready;
}

await loadFonts();

window.__cues = cues;
window.__seek = (t) => {
  render(t);
  return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
};
window.__ready = true;

// 预览：?play 跟随音频；?t=秒 定格
const params = new URLSearchParams(location.search);
if (params.has("play")) {
  const audio = new Audio("../out/track.wav");
  audio.currentTime = Number(params.get("t") ?? 0);
  const start = () => {
    audio.play();
    const loop = () => {
      render(audio.currentTime);
      requestAnimationFrame(loop);
    };
    loop();
  };
  stage.addEventListener("click", start, { once: true });
  render(audio.currentTime);
} else {
  render(Number(params.get("t") ?? 0));
}
