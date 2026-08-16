import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUiApp } from "../src/ui-server.js";

/** HTTP 契约测试:createUiApp 注入沙箱 storeRoot/home,app.request() 直测(不占真实端口)。 */

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "dist", "index.js");
let sample = "";

/** 内联样例 skill(CI 无 .sandbox,必须自包含)。 */
async function makeSample(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-http-sample-"));
  tempRoots.push(dir);
  await writeFile(
    path.join(dir, "SKILL.md"),
    ["---", "name: demo", "description: sandbox e2e demo skill", "---", "", "# demo", "", "sandbox e2e demo skill."].join("\n") + "\n",
    "utf8",
  );
  return dir;
}

let home = "";
const tempRoots: string[] = [];

function runCli(args: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 1, stdout: err.stdout ?? "" };
  }
}

async function setupStore(): Promise<void> {
  home = await mkdtemp(path.join(os.tmpdir(), "skills-hub-http-"));
  tempRoots.push(home);
  await mkdir(path.join(home, ".claude", "skills"), { recursive: true });
  sample = await makeSample();
  const init = runCli(["init", "--home", home, "--yes", "--json"]);
  expect(init.code).toBe(0);
  const adopt = runCli(["adopt", sample, "--home", home, "--yes", "--json"]);
  expect(adopt.code).toBe(0);
}

/** 解析 storeRoot(指针文件,与 CLI 同口径)。 */
async function storeRootOf(): Promise<string> {
  const raw = await readFile(path.join(home, ".skills-hub", "config.json"), "utf8");
  return (JSON.parse(raw) as { storeRoot: string }).storeRoot;
}

let app: ReturnType<typeof createUiApp>;
let storeRoot: string;

/** 静态面板测试用的 webRoot:一个带 index.html 与 assets 的临时目录。 */
async function makeWebRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-webroot-"));
  tempRoots.push(dir);
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await writeFile(path.join(dir, "index.html"), "<!doctype html><title>panel</title>", "utf8");
  await writeFile(path.join(dir, "assets", "app.js"), "console.log(1)", "utf8");
  return dir;
}

let webRoot = "";
let emptyWebRoot = "";

beforeAll(async () => {
  await setupStore();
  storeRoot = await storeRootOf();
  webRoot = await makeWebRoot();
  emptyWebRoot = await mkdtemp(path.join(os.tmpdir(), "skills-hub-webroot-empty-"));
  tempRoots.push(emptyWebRoot);
  app = createUiApp({ storeRoot, home });
});

describe("静态面板托管", () => {
  it("首页返回 index.html", async () => {
    const res = await createUiApp({ storeRoot, home, webRoot }).request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("panel");
  });

  it("assets 静态文件带正确 content-type", async () => {
    const res = await createUiApp({ storeRoot, home, webRoot }).request("/assets/app.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("console.log(1)");
    expect(res.headers.get("content-type")).toContain("text/javascript");
  });

  it("SPA fallback:前端路由刷新返回 index.html 而非 404", async () => {
    const res = await createUiApp({ storeRoot, home, webRoot }).request("/panel/some/route");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("panel");
  });

  it("静态产物缺失:提示先构建,而不是裸 404", async () => {
    const res = await createUiApp({ storeRoot, home, webRoot: emptyWebRoot }).request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("尚未构建");
  });

  it("未知 API 路径返回 JSON 信封,不被 SPA fallback 吃掉", async () => {
    const res = await app.request("/api/unknown-route");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("not-found");
  });
});

afterAll(async () => {
  await Promise.all(tempRoots.map((t) => rm(t, { recursive: true, force: true })));
});

describe("http-api 契约", () => {
  it("health", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("列表来自库存:origins 与 visibleIn 分离,无 source 字段", async () => {
    const res = await app.request("/api/skills");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      command: string;
      storeRoot: string;
      total: number;
      skills: {
        hash: string;
        dirName: string;
        origins: { kind: string; reference: string }[];
        visibleIn: string[];
        meta: { name: string; description: string };
      }[];
    };
    expect(body.ok).toBe(true);
    expect(body.command).toBe("skills");
    expect(body.storeRoot).toBe(storeRoot);
    expect(body.total).toBe(1);
    const s = body.skills[0]!;
    expect(s.dirName).toBe("demo");
    expect(s.origins.length).toBe(1);
    expect(s.origins[0]!.kind).toBe("local-scan");
    expect(s.visibleIn).toEqual([]);
    expect(s.meta.description).not.toBe("");
    expect("source" in (s as Record<string, unknown>)).toBe(false);
  });

  it("单个详情:哈希前缀命中 + 404 not-found", async () => {
    const list = await (await app.request("/api/skills")).json() as { skills: { hash: string; dirName: string }[] };
    const hash = list.skills[0]!.hash;
    const hit = await app.request("/api/skills/" + hash.slice(0, 12));
    expect(hit.status).toBe(200);
    const body = (await hit.json()) as { ok: boolean; command: string; skill: { dirName: string } };
    expect(body.command).toBe("skill");
    expect(body.skill.dirName).toBe("demo");
    const miss = await app.request("/api/skills/zzzz");
    expect(miss.status).toBe(404);
    const missBody = (await miss.json()) as { ok: boolean; command: string; code: string };
    expect(missBody.ok).toBe(false);
    expect(missBody.code).toBe("not-found");
  });

  it("groups:5 个内置分组", async () => {
    const res = await app.request("/api/groups");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; groups: { id: string }[] };
    expect(body.command).toBe("groups");
    expect(body.groups.map((g) => g.id).sort()).toEqual(["design", "development", "research", "tooling", "writing"]);
  });

  it("stats:形状与 ranking", async () => {
    const res = await app.request("/api/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; stats: { version: number; counters: Record<string, unknown> }; ranking: unknown[] };
    expect(body.command).toBe("stats");
    expect(body.stats.version).toBe(1);
    expect(Array.isArray(body.ranking)).toBe(true);
  });

  it("clients:发现 claude(沙箱 home)", async () => {
    const res = await app.request("/api/clients");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; clients: { clientId: string }[] };
    expect(body.command).toBe("clients");
    expect(body.clients.some((c) => c.clientId === "claude")).toBe(true);
  });

  it("archive 列表:初始为空", async () => {
    const res = await app.request("/api/archive");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; verb: string; archived: unknown[] };
    expect(body.command).toBe("archive");
    expect(body.verb).toBe("list");
    expect(body.archived).toEqual([]);
  });

  it("enable:写端点成功 + 链接建立 + visibleIn 更新 + 计数", async () => {
    const list = await (await app.request("/api/skills")).json() as { skills: { hash: string }[] };
    const hash = list.skills[0]!.hash;
    const res = await app.request("/api/skills/" + hash.slice(0, 12) + "/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "claude" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; clientId: string; scope: string; created: string[] };
    expect(body.command).toBe("enable");
    expect(body.clientId).toBe("claude");
    expect(body.created.length).toBe(1);
    const link = path.join(home, ".claude", "skills", "demo");
    const target = await readlink(link);
    expect(target.toLowerCase()).toContain("demo");
    const after = (await (await app.request("/api/skills")).json()) as { skills: { visibleIn: string[] }[] };
    expect(after.skills[0]!.visibleIn).toEqual(["claude"]);
    const stats = (await (await app.request("/api/stats")).json()) as {
      stats: { counters: Record<string, { enable: number }> };
    };
    const counter = Object.values(stats.stats.counters)[0];
    expect(counter?.enable).toBe(1);
  });

  it("enable 失败:缺 clientId → 400 bad-usage;未知客户端/hash → 404 not-found", async () => {
    const list = await (await app.request("/api/skills")).json() as { skills: { hash: string }[] };
    const hash = list.skills[0]!.hash.slice(0, 12);
    const noClient = await app.request("/api/skills/" + hash + "/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(noClient.status).toBe(400);
    expect(((await noClient.json()) as { code: string }).code).toBe("bad-usage");
    const badClient = await app.request("/api/skills/" + hash + "/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "nonexistent" }),
    });
    expect(badClient.status).toBe(404);
    expect(((await badClient.json()) as { code: string }).code).toBe("not-found");
    const badHash = await app.request("/api/skills/zzzz/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "claude" }),
    });
    expect(badHash.status).toBe(404);
    expect(((await badHash.json()) as { code: string }).code).toBe("not-found");
  });

  it("disable:摘链接 + visibleIn 清空", async () => {
    const list = await (await app.request("/api/skills")).json() as { skills: { hash: string }[] };
    const hash = list.skills[0]!.hash.slice(0, 12);
    const res = await app.request("/api/skills/" + hash + "/disable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "claude" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; removed: string[] };
    expect(body.command).toBe("disable");
    expect(body.removed.length).toBe(1);
    await expect(readlink(path.join(home, ".claude", "skills", "demo"))).rejects.toThrow();
    const after = (await (await app.request("/api/skills")).json()) as { skills: { visibleIn: string[] }[] };
    expect(after.skills[0]!.visibleIn).toEqual([]);
  });

  it("archive:软删除端点 + 库存减少 + 归档区可见", async () => {
    const list = await (await app.request("/api/skills")).json() as { skills: { hash: string }[] };
    const hash = list.skills[0]!.hash.slice(0, 12);
    const res = await app.request("/api/skills/" + hash + "/archive", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; archiveFile: string; removedLinks: number };
    expect(body.command).toBe("archive");
    expect(body.archiveFile).toContain("demo");
    const after = (await (await app.request("/api/skills")).json()) as { total: number };
    expect(after.total).toBe(0);
    const arch = (await (await app.request("/api/archive")).json()) as { archived: { name: string }[] };
    expect(arch.archived.length).toBe(1);
    expect(arch.archived[0]!.name).toBe("demo");
  });

  it("未配置库存:store-not-configured 503", async () => {
    const bare = createUiApp({ storeRoot: null, home });
    const res = await bare.request("/api/skills");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; command: string; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("store-not-configured");
  });
});
