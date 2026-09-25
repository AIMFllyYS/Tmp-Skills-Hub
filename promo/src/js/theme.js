// 画布与特效用的主题色。CSS 的部分在 styles/tokens.css（:root 浅色，[data-theme="dark"] 深色）。
// 浅色是成片默认；?theme=dark 或 render.mjs --theme dark 切回深色。

const LIGHT = {
  name: "light",
  ink: "#0b0c0e",
  ink2: "#4a505a",
  ink3: "#8b919b",
  accent: "#4d7c0f", // 线、描边、强调文字
  accentRGB: "77,124,15",
  glowRGB: "150,215,20",
  fill: "#c8f53c", // 面：按钮、柱、Logo 核心
  pop: "10,12,16", // 冲击环第二圈
  blend: "source-over", // 浅底上加色混合看不见，用普通混合
  burst: ["#4d7c0f", "#9bd21f", "#0b0c0e"],
  burstSoft: ["#0b0c0e", "#9bd21f"],
  star: "#2b3038",
  point: "#353b44",
  pointScale: 1.45, // 浅底上深色小点显得稀，放大一些
  pointHot: "#5b9212",
  label: "#6b7280",
  satLabel: "#0b0c0e",
  glitch: [["#ff2a4d", "multiply"], ["#00b7ff", "multiply"]], // 深色镜头里 glitchText 会自己换成 screen
  trail: "77,124,15",
  grid: "77,124,15",
  arc: ["77,124,15", "14,150,200", "110,90,230"],
};

const DARK = {
  name: "dark",
  ink: "#f3f5f7",
  ink2: "#a3abb6",
  ink3: "#5c6470",
  accent: "#c8f53c",
  accentRGB: "200,245,60",
  glowRGB: "200,245,60",
  fill: "#c8f53c",
  pop: "255,255,255",
  blend: "lighter",
  burst: ["#c8f53c", "#e9ffb0", "#ffffff"],
  burstSoft: ["#ffffff", "#c8f53c"],
  star: "#e8f0ff",
  point: "#dfe7f0",
  pointScale: 1,
  pointHot: "#c8f53c",
  label: "#a3abb6",
  satLabel: "#f3f5f7",
  glitch: [["#ff2a4d", "screen"], ["#2af0ff", "screen"]],
  trail: "200,245,60",
  grid: "200,245,60",
  arc: ["200,245,60", "90,215,255", "162,147,255"],
};

const param = new URLSearchParams(location.search).get("theme");
export const T = param === "dark" ? DARK : LIGHT;
document.documentElement.dataset.theme = T.name;
