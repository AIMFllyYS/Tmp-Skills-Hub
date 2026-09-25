#!/usr/bin/env node
/**
 * 逐帧渲染：起本地静态服务 → Chromium 打开舞台 → 每帧 __seek(t) 截图 → 管道喂给 ffmpeg，混入配乐。
 *
 *   node render.mjs                         # 全片 60fps → out/skills-hub-promo.mp4
 *   node render.mjs --fps 30 --from 20 --to 30
 *   node render.mjs --stills 3,12,21        # 只出静帧到 out/stills/（--dir 可改），用于审片
 *   node render.mjs --theme dark            # 深色版（默认浅色）
 *
 * 环境：CHROME_PATH 覆盖浏览器；FFMPEG 覆盖 ffmpeg（默认找 imageio-ffmpeg 的静态版或 PATH 里的 ffmpeg）。
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, "out");
mkdirSync(OUT, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
    return acc;
  }, []),
);

const cues = JSON.parse(readFileSync(path.join(ROOT, "src", "cues.json"), "utf8"));
const DURATION = (cues.beats * 60) / cues.bpm;
const fps = Number(args.fps ?? cues.fps);
const from = Number(args.from ?? 0);
const to = Math.min(DURATION, Number(args.to ?? DURATION));
const outFile = path.resolve(args.out ?? path.join(OUT, "skills-hub-promo.mp4"));

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const guesses = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"];
  return guesses.find((p) => existsSync(p));
}

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    return execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
  } catch {
    return "ffmpeg";
  }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".wav": "audio/wav", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !existsSync(p)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] ?? "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ["--font-render-hinting=none", "--disable-lcd-text", "--force-color-profile=srgb", "--hide-scrollbars"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("[page]", e.message));
page.on("console", (m) => m.type() === "error" && console.error("[console]", m.text()));
await page.goto(`http://127.0.0.1:${port}/src/index.html${args.theme ? `?theme=${args.theme}` : ""}`);
await page.waitForFunction(() => globalThis.__ready === true, null, { timeout: 60000 });
const cdp = await page.context().newCDPSession(page);

async function grab(t, format = "jpeg") {
  await page.evaluate((tt) => globalThis.__seek(tt), t);
  const { data } = await cdp.send("Page.captureScreenshot", { format, quality: format === "jpeg" ? 94 : undefined, captureBeyondViewport: false });
  return Buffer.from(data, "base64");
}

if (args.stills) {
  const dir = path.resolve(args.dir ?? path.join(OUT, "stills"));
  mkdirSync(dir, { recursive: true });
  for (const s of String(args.stills).split(",")) {
    const t = Number(s);
    writeFileSync(path.join(dir, `t${t.toFixed(2).padStart(6, "0")}.png`), await grab(t, "png"));
    console.log("still", t);
  }
} else {
  const ffmpeg = findFfmpeg();
  const track = path.join(OUT, "track.wav");
  const withAudio = existsSync(track) && !args.mute;
  const ff = spawn(ffmpeg, [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
    ...(withAudio ? ["-ss", String(from), "-t", String(to - from), "-i", track] : []),
    "-c:v", "libx264", "-preset", args.preset ?? "slow", "-crf", args.crf ?? "15", "-pix_fmt", "yuv420p",
    "-profile:v", "high", "-movflags", "+faststart",
    ...(withAudio ? ["-c:a", "aac", "-b:a", "256k", "-shortest"] : []),
    outFile,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const frames = Math.round((to - from) * fps);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    const buf = await grab(from + i / fps);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % fps === 0) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\rframe ${i}/${frames}  ${(i / Math.max(el, 0.001)).toFixed(1)} fps  eta ${(((frames - i) * el) / Math.max(i, 1)).toFixed(0)}s   `);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log(`\nwrote ${outFile}`);
}

await browser.close();
server.close();
