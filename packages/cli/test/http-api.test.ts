import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
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

  it("client skill-states:全集 + 未启用为 off", async () => {
    const res = await app.request("/api/clients/claude/skill-states");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      command: string;
      clientId: string;
      total: number;
      enabled: number;
      rows: { state: string }[];
    };
    expect(body.command).toBe("client-skill-states");
    expect(body.clientId).toBe("claude");
    expect(body.total).toBe(1);
    expect(body.enabled).toBe(0);
    expect(body.rows[0]?.state).toBe("off");
  });

  it("client skill-states:未知客户端 404", async () => {
    const res = await app.request("/api/clients/no-such-client/skill-states");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("not-found");
  });

  it("skill links:未启用客户端为 off", async () => {
    const list = await (await app.request("/api/skills")).json() as { skills: { hash: string }[] };
    const res = await app.request("/api/skills/" + list.skills[0]!.hash + "/links");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; links: { clientId: string; state: string; detail: string }[] };
    expect(body.command).toBe("skill-links");
    expect(body.links.some((l) => l.clientId === "claude" && l.state === "off")).toBe(true);
  });

  it("groups:5 个内置分组", async () => {
    const res = await app.request("/api/groups");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; groups: { id: string }[] };
    expect(body.command).toBe("groups");
    expect(body.groups.map((g) => g.id).sort()).toEqual(["design", "development", "research", "tooling", "writing"]);
  });

  it("groups 写:创建/重名冲突/改名/加减成员/删除后 skill 仍在", async () => {
    const skills = (await (await app.request("/api/skills")).json()) as { skills: { hash: string; dirName: string }[] };
    const demo = skills.skills.find((s) => s.dirName === "demo") ?? skills.skills[0]!;
    const created = await app.request("/api/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "http-tmp", name: "临时组" }),
    });
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { verb: string; id: string; name: string };
    expect(createdBody.verb).toBe("create");
    expect(createdBody.id).toBe("http-tmp");

    const dup = await app.request("/api/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "http-tmp" }),
    });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { code: string }).code).toBe("group-exists");

    const renamed = await app.request("/api/groups/http-tmp", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "改过的临时组" }),
    });
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { name: string }).name).toBe("改过的临时组");

    const missingPatch = await app.request("/api/groups/no-such-group", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(missingPatch.status).toBe(404);
    expect(((await missingPatch.json()) as { code: string }).code).toBe("group-not-found");

    const added = await app.request("/api/groups/http-tmp/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hashes: [demo.hash], action: "add" }),
    });
    expect(added.status).toBe(200);
    expect(((await added.json()) as { changed: number; verb: string }).changed).toBe(1);

    const missingMembers = await app.request("/api/groups/no-such-group/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hashes: [demo.hash], action: "add" }),
    });
    expect(missingMembers.status).toBe(404);
    expect(((await missingMembers.json()) as { code: string }).code).toBe("group-not-found");

    const removed = await app.request("/api/groups/http-tmp/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hashes: [demo.hash], action: "remove" }),
    });
    expect(removed.status).toBe(200);

    const del = await app.request("/api/groups/http-tmp", { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(((await del.json()) as { verb: string }).verb).toBe("delete");

    const delMissing = await app.request("/api/groups/http-tmp", { method: "DELETE" });
    expect(delMissing.status).toBe(404);
    expect(((await delMissing.json()) as { code: string }).code).toBe("group-not-found");

    const after = (await (await app.request("/api/skills")).json()) as { skills: { dirName: string }[] };
    expect(after.skills.some((s) => s.dirName === demo.dirName)).toBe(true);
    const groups = (await (await app.request("/api/groups")).json()) as { groups: { id: string }[] };
    expect(groups.groups.map((g) => g.id)).not.toContain("http-tmp");
  });

  it("stats:形状与 ranking", async () => {
    const res = await app.request("/api/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; stats: { version: number; counters: Record<string, unknown> }; ranking: unknown[] };
    expect(body.command).toBe("stats");
    expect(body.stats.version).toBe(1);
    expect(Array.isArray(body.ranking)).toBe(true);
  });

  it("查看:文件树包含 SKILL.md,内容可读", async () => {
    const tree = await (await app.request("/api/skills/demo/tree")).json() as { ok: boolean; entries: { path: string }[] };
    expect(tree.ok).toBe(true);
    expect(tree.entries.map((e) => e.path)).toContain("SKILL.md");
    const file = await (await app.request("/api/skills/demo/file?path=SKILL.md")).json() as { ok: boolean; content: string };
    expect(file.ok).toBe(true);
    if (file.ok) expect(file.content).toContain("demo");
  });

  it("保存:写回原件,哈希更新,链接读穿可见新内容,旧内容进版本归档", async () => {
    const before = (await (await app.request("/api/skills/demo/tree")).json()) as { ok: boolean };
    expect(before.ok).toBe(true);
    // 先启用 claude 链接(验收点:通过客户端目录的链接读取能看到新内容)
    const enable = await app.request("/api/skills/demo/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"clientId":"claude"}',
    });
    expect(enable.status).toBe(200);
    const res = await app.request("/api/skills/demo/file?path=SKILL.md", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "# demo\n\nedited by test\n" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; hash: string };
    expect(body.ok).toBe(true);
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/);
    // 通过客户端链接(沙箱 home/.claude/skills/demo)读取 → 能看到新内容(验收点)
    const viaLink = await readFile(path.join(home, ".claude", "skills", "demo", "SKILL.md"), "utf8");
    expect(viaLink).toContain("edited by test");
    // 版本归档存在
    const versions = await readdir(path.join(storeRoot, "archive", "versions"));
    expect(versions.length).toBeGreaterThan(0);
  });

  it("保存:路径穿越拒绝,body 缺 content 拒绝", async () => {
    const res = await app.request("/api/skills/demo/file?path=..%2F..%2Fx.md", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "hi" }),
    });
    expect(res.status).toBe(400);
    const bad = await app.request("/api/skills/demo/file?path=SKILL.md", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(bad.status).toBe(400);
  });

  it("翻译:本地服务代发成功,返回译文", async () => {
    const translateImpl = (async (messages: { role: string; content: string }[]) => {
      // 替身校验系统提示要求保留代码块,只译说明文字
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      expect(sys).toContain("保留原文");
      return { ok: true, content: "译文内容" } as const;
    }) as never;
    const tapp = createUiApp({ storeRoot, home, translateImpl });
    const res = await tapp.request("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello world" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; text: string };
    expect(body.ok).toBe(true);
    expect(body.text).toBe("译文内容");
  });

  it("翻译:未配置密钥 → 503 not-configured 可读提示;缺 body → 400", async () => {
    const translateImpl = (async () => ({
      ok: false,
      code: "not-configured",
      message: "未配置 DEEPSEEK_API_KEY:请在 .env 中填写后重试(功能不可用但不崩溃)。",
    })) as never;
    const tapp = createUiApp({ storeRoot, home, translateImpl });
    const res = await tapp.request("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("not-configured");
    expect(body.message).toContain("DEEPSEEK_API_KEY");
    const bad = await tapp.request("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(bad.status).toBe(400);
  });

  it("analyze:成功报告形状 + 不写库存/台账;缺 target 400;无密钥 503", async () => {
    const indexPath = path.join(storeRoot, "index.json");
    const linksPath = path.join(storeRoot, "links.json");
    const beforeIndex = await readFile(indexPath, "utf8");
    const beforeLinks = await readFile(linksPath, "utf8");
    const analyzeChat = (async () => ({
      ok: true as const,
      content: JSON.stringify({ similar: [{ name: "other", reason: "职责接近" }], conflict: [] }),
    })) as never;
    const aapp = createUiApp({ storeRoot, home, analyzeChat });
    const ok = await aapp.request("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "demo" }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { command: string; target: string; similar: { name: string; reason: string }[]; conflict: unknown[] };
    expect(body.command).toBe("analyze");
    expect(body.target).toBe("demo");
    expect(body.similar).toEqual([{ name: "other", reason: "职责接近" }]);
    expect(body.conflict).toEqual([]);
    expect(await readFile(indexPath, "utf8")).toBe(beforeIndex);
    expect(await readFile(linksPath, "utf8")).toBe(beforeLinks);

    const missing = await aapp.request("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { code: string }).code).toBe("bad-usage");

    const noKey = createUiApp({
      storeRoot,
      home,
      analyzeChat: (async () => ({ ok: false as const, code: "not-configured" as const, message: "未配置" })) as never,
    });
    const degraded = await noKey.request("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "demo" }),
    });
    expect(degraded.status).toBe(503);
    const fail = (await degraded.json()) as { code: string; message: string };
    expect(fail.code).toBe("not-configured");
    expect(fail.message).toContain("DEEPSEEK_API_KEY");
    expect(fail.message).not.toMatch(/sk-|api[_-]?key\s*[:=]/i);
  });

  it("verify:改文件后指出 dirName,写回后恢复;doctor 未配置 503", async () => {
    const skillMd = path.join(storeRoot, "skills", "demo", "SKILL.md");
    const orig = await readFile(skillMd, "utf8");
    const clean = await app.request("/api/verify");
    expect(clean.status).toBe(200);
    const cleanBody = (await clean.json()) as { command: string; passed: string[]; drifted: { name: string }[] };
    expect(cleanBody.command).toBe("verify");
    expect(cleanBody.passed).toContain("demo");
    expect(cleanBody.drifted.map((d) => d.name)).not.toContain("demo");

    await writeFile(skillMd, orig + "\n# drifted-by-test\n", "utf8");
    const dirty = await app.request("/api/verify");
    const dirtyBody = (await dirty.json()) as { drifted: { name: string }[] };
    expect(dirtyBody.drifted.map((d) => d.name)).toContain("demo");
    await writeFile(skillMd, orig, "utf8");

    const doc = await app.request("/api/doctor");
    expect(doc.status).toBe(200);
    const docBody = (await doc.json()) as { command: string; store: { resolved: boolean }; roots: unknown[]; linkTypes: unknown };
    expect(docBody.command).toBe("doctor");
    expect(docBody.store.resolved).toBe(true);
    expect(Array.isArray(docBody.roots)).toBe(true);

    const bare = createUiApp({ storeRoot: null, home });
    const unconf = await bare.request("/api/doctor");
    expect(unconf.status).toBe(503);
    expect(((await unconf.json()) as { code: string }).code).toBe("store-not-configured");
  });

  it("查看:路径穿越被拒绝(outside),未知文件 404", async () => {
    const res = await app.request("/api/skills/demo/file?path=..%2F..%2Fsecret.txt");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("outside");
    const res2 = await app.request("/api/skills/demo/file?path=nope.md");
    expect(res2.status).toBe(404);
  });

  it("clients:发现 claude(沙箱 home)", async () => {
    const res = await app.request("/api/clients");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; command: string; clients: { clientId: string }[] };
    expect(body.command).toBe("clients");
    expect(body.clients.some((c) => c.clientId === "claude")).toBe(true);
  });

  it("clients:沙箱 home 下两个假客户端都返回", async () => {
    const h = await mkdtemp(path.join(os.tmpdir(), "skills-hub-http-clients-"));
    tempRoots.push(h);
    await mkdir(path.join(h, ".claude", "skills"), { recursive: true });
    await mkdir(path.join(h, ".cursor", "skills"), { recursive: true });
    const tapp = createUiApp({ storeRoot, home: h });
    const res = await tapp.request("/api/clients");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; clients: { clientId: string }[] };
    expect(body.ok).toBe(true);
    expect(body.clients.map((c) => c.clientId).sort()).toEqual(["claude", "cursor"]);
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
      ranking: { skillHash?: string; hash?: string }[];
    };
    expect(stats.stats.counters[hash]?.enable).toBe(1);
    expect(stats.ranking.some((r) => r.skillHash === hash)).toBe(true);
    for (const row of stats.ranking) {
      expect(typeof row.skillHash).toBe("string");
      expect(row).not.toHaveProperty("hash");
    }
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

  it("links preview:不写盘;占用落点列为冲突", async () => {
    const list = await (await app.request("/api/skills")).json() as { skills: { hash: string }[] };
    const hash = list.skills[0]!.hash;
    const dest = path.join(home, ".claude", "skills", "demo");
    await mkdir(dest, { recursive: true });
    await writeFile(path.join(dest, "occupied.txt"), "user", "utf8");
    const before = await readFile(path.join(storeRoot, "links.json"), "utf8");
    const res = await app.request("/api/links/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hashes: [hash], clientIds: ["claude"], action: "enable" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { command: string; add: number; conflictCount: number; conflicts: { code: string; at: string }[] };
    expect(body.command).toBe("links-preview");
    expect(body.add).toBe(0);
    expect(body.conflictCount).toBe(1);
    expect(body.conflicts[0]?.code).toBe("unregistered-conflict");
    expect(body.conflicts[0]?.at.toLowerCase()).toContain("demo");
    expect(await readFile(path.join(storeRoot, "links.json"), "utf8")).toBe(before);
    const apply = await app.request("/api/links/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hashes: [hash], clientIds: ["claude"], action: "enable" }),
    });
    expect(apply.status).toBe(409);
    expect(await readFile(path.join(storeRoot, "links.json"), "utf8")).toBe(before);
    await rm(dest, { recursive: true, force: true });
  });

  it("links apply:一次提交启用再停用", async () => {
    const list = await (await app.request("/api/skills")).json() as { skills: { hash: string }[] };
    const hash = list.skills[0]!.hash;
    const preview = await app.request("/api/links/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hashes: [hash], clientIds: ["claude"], action: "enable" }),
    });
    const pre = (await preview.json()) as { add: number; conflictCount: number };
    expect(pre.add).toBe(1);
    expect(pre.conflictCount).toBe(0);
    const apply = await app.request("/api/links/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hashes: [hash], clientIds: ["claude"], action: "enable" }),
    });
    expect(apply.status).toBe(200);
    const body = (await apply.json()) as { command: string; created: string[] };
    expect(body.command).toBe("links-apply");
    expect(body.created.length).toBe(1);
    const link = path.join(home, ".claude", "skills", "demo");
    expect((await readlink(link)).toLowerCase()).toContain("demo");
    const off = await app.request("/api/links/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hashes: [hash], clientIds: ["claude"], action: "disable" }),
    });
    expect(off.status).toBe(200);
    await expect(readlink(link)).rejects.toThrow();
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

  it("restore:归档后恢复,活跃区回来", async () => {
    const res = await app.request("/api/skills/demo/restore", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { command: string; dirName: string; hash: string };
    expect(body.command).toBe("restore");
    expect(body.dirName).toBe("demo");
    const list = (await (await app.request("/api/skills")).json()) as { total: number; skills: { dirName: string }[] };
    expect(list.skills.some((s) => s.dirName === "demo")).toBe(true);
  });

  it("adopt 本地:重复内容返回已存在", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-http-dup-"));
    tempRoots.push(dir);
    await writeFile(
      path.join(dir, "SKILL.md"),
      ["---", "name: adopt-dup", "description: duplicate fixture", "---", "", "# adopt-dup"].join("\n") + "\n",
      "utf8",
    );
    const first = await app.request("/api/adopt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: dir }),
    });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { adopted: number }).adopted).toBe(1);
    const res = await app.request("/api/adopt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: dir }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { command: string; adopted: number; duplicates: number };
    expect(body.command).toBe("adopt");
    expect(body.adopted).toBe(0);
    expect(body.duplicates).toBe(1);
  });

  it("adopt 本地:同名不同内容冲突且原件不变", async () => {
    const other = await mkdtemp(path.join(os.tmpdir(), "skills-hub-http-conflict-"));
    tempRoots.push(other);
    await writeFile(
      path.join(other, "SKILL.md"),
      ["---", "name: adopt-dup", "description: different content must not overwrite", "---", "", "# other"].join("\n") + "\n",
      "utf8",
    );
    const original = await readFile(path.join(storeRoot, "skills", "adopt-dup", "SKILL.md"), "utf8");
    const res = await app.request("/api/adopt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: other }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { conflicts: number; adopted: number };
    expect(body.conflicts).toBe(1);
    expect(body.adopted).toBe(0);
    expect(await readFile(path.join(storeRoot, "skills", "adopt-dup", "SKILL.md"), "utf8")).toBe(original);
  });

  it("adopt GitHub:fetch 替身收录", async () => {
    const skillMd = ["---", "name: gh-demo", "description: from github stub", "---", "", "# gh-demo"].join("\n") + "\n";
    const fetchImpl = async (url: string): Promise<Response> => {
      if (url.startsWith("https://api.github.com/repos/org/repo/git/trees/main?recursive=1")) {
        return new Response(JSON.stringify({ tree: [{ path: "skills/gh-demo/SKILL.md", type: "blob" }] }), { status: 200 });
      }
      if (url.startsWith("https://api.github.com/repos/org/repo/git/trees/main")) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }
      if (url.startsWith("https://api.github.com/repos/org/repo")) {
        return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
      }
      if (url.startsWith("https://raw.githubusercontent.com/org/repo/main/")) {
        return new Response(skillMd, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };
    const ghApp = createUiApp({ storeRoot, home, fetchImpl });
    const res = await ghApp.request("/api/adopt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "https://github.com/org/repo" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { adopted: number; outcomes: { folder: string }[] };
    expect(body.adopted).toBe(1);
    expect(body.outcomes[0]?.folder).toBe("gh-demo");
  });

  it("adopt skills.sh:fetch 替身收录", async () => {
    const skillMd = ["---", "name: sh-demo", "description: from skills.sh stub", "---", "", "# sh-demo"].join("\n") + "\n";
    const fetchImpl = async (url: string): Promise<Response> => {
      if (url.startsWith("https://api.github.com/repos/org/repo/git/trees/main?recursive=1")) {
        return new Response(JSON.stringify({ tree: [{ path: "skills/sh-demo/SKILL.md", type: "blob" }] }), { status: 200 });
      }
      if (url.startsWith("https://api.github.com/repos/org/repo/git/trees/main")) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }
      if (url.startsWith("https://api.github.com/repos/org/repo")) {
        return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
      }
      if (url.startsWith("https://raw.githubusercontent.com/org/repo/main/")) {
        return new Response(skillMd, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };
    const shApp = createUiApp({ storeRoot, home, fetchImpl });
    const res = await shApp.request("/api/adopt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "https://skills.sh/org/repo/sh-demo" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { adopted: number; outcomes: { folder: string }[] };
    expect(body.adopted).toBe(1);
    expect(body.outcomes[0]?.folder).toBe("sh-demo");
  });

  it("POST /api/share:成功返回 tree 链接;无 token 503;远端冲突 409", async () => {
    const prev = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "test-token";
    try {
      const posted: Array<{ path: string }> = [];
      const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<Response> => {
        const u = String(url);
        const method = (init?.method ?? "GET").toUpperCase();
        if (u === "https://api.github.com/repos/club/skills") return new Response(JSON.stringify({ default_branch: "main" }));
        if (u.includes("/git/trees/main?recursive=1")) return new Response(JSON.stringify({ tree: [] }));
        if (u.includes("/git/ref/heads/main") && method === "GET") {
          return new Response(JSON.stringify({ object: { sha: "aaa111aaa111aaa111aaa111aaa111aaa111aaaa" } }));
        }
        if (u.includes("/git/commits/") && method === "GET") {
          return new Response(JSON.stringify({ tree: { sha: "tree111tree111tree111tree111tree111tree1" } }));
        }
        if (u.endsWith("/git/trees") && method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { tree?: Array<{ path: string }> };
          posted.push(...(body.tree ?? []));
          return new Response(JSON.stringify({ sha: "tree222" }), { status: 201 });
        }
        if (u.endsWith("/git/commits") && method === "POST") {
          return new Response(JSON.stringify({ sha: "ccc222" }), { status: 201 });
        }
        if (u.includes("/git/refs/heads/main") && method === "PATCH") {
          return new Response(JSON.stringify({ object: { sha: "ccc222" } }));
        }
        return new Response("nope " + method + " " + u, { status: 404 });
      };
      const sapp = createUiApp({ storeRoot, home, fetchImpl });
      const ok = await sapp.request("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: "demo", repo: "club/skills" }),
      });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { ok: boolean; command: string; url: string; dirName: string };
      expect(body.ok).toBe(true);
      expect(body.command).toBe("share");
      expect(body.dirName).toBe("demo");
      expect(body.url).toBe("https://github.com/club/skills/tree/main/skills/demo");
      expect(posted.some((p) => p.path === "skills/demo/SKILL.md")).toBe(true);

      const conflictFetch: typeof fetch = async (url) => {
        const u = String(url);
        if (u === "https://api.github.com/repos/club/skills") return new Response(JSON.stringify({ default_branch: "main" }));
        if (u.includes("/git/trees/main?recursive=1")) {
          return new Response(JSON.stringify({ tree: [{ path: "skills/demo/SKILL.md", type: "blob" }] }));
        }
        if (u.startsWith("https://raw.githubusercontent.com/")) return new Response("other-bytes\n");
        return new Response("nope", { status: 404 });
      };
      const capp = createUiApp({ storeRoot, home, fetchImpl: conflictFetch });
      const conflict = await capp.request("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: "demo", repo: "club/skills" }),
      });
      expect(conflict.status).toBe(409);
      const cb = (await conflict.json()) as { code: string };
      expect(cb.code).toBe("remote-conflict");
    } finally {
      if (prev === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = prev;
    }

    delete process.env.GITHUB_TOKEN;
    const noTok = createUiApp({
      storeRoot,
      home,
      fetchImpl: async () => new Response("should-not", { status: 500 }),
    });
    const denied = await noTok.request("/api/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "demo", repo: "club/skills" }),
    });
    expect(denied.status).toBe(503);
    expect(((await denied.json()) as { code: string }).code).toBe("auth-required");
    if (prev !== undefined) process.env.GITHUB_TOKEN = prev;
  });

  it("GET /api/backups 与 preview/reset:缺确认短语不写盘,确认后本进程还原", async () => {
    const isolated = await mkdtemp(path.join(os.tmpdir(), "skills-hub-http-reset-"));
    tempRoots.push(isolated);
    const skill = path.join(isolated, ".claude", "skills", "demo", "SKILL.md");
    await mkdir(path.dirname(skill), { recursive: true });
    await writeFile(skill, "---\nname: demo\ndescription: sandbox e2e demo skill\n---\noriginal\n");
    expect(runCli(["init", "--home", isolated, "--yes", "--json"]).code).toBe(0);
    expect(runCli(["backup", "--home", isolated, "--yes", "--json"]).code).toBe(0);
    await writeFile(skill, "---\nname: demo\ndescription: sandbox e2e demo skill\n---\nmutated\n");
    const isolatedRoot = (JSON.parse(await readFile(path.join(isolated, ".skills-hub", "config.json"), "utf8")) as { storeRoot: string }).storeRoot;
    const rapp = createUiApp({ storeRoot: isolatedRoot, home: isolated });

    const listed = await rapp.request("/api/backups");
    expect(listed.status).toBe(200);
    const lb = (await listed.json()) as { command: string; verb: string; snapshots: Array<{ snapshotId: string }> };
    expect(lb.command).toBe("backup");
    expect(lb.verb).toBe("list");
    expect(lb.snapshots.length).toBeGreaterThanOrEqual(1);
    const snapshotId = lb.snapshots[0]!.snapshotId;

    const preview = await rapp.request("/api/backups/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId }),
    });
    expect(preview.status).toBe(200);
    const pb = (await preview.json()) as { command: string; dryRun: boolean; snapshotId: string };
    expect(pb.command).toBe("backups-preview");
    expect(pb.dryRun).toBe(true);
    expect(pb.snapshotId).toBe(snapshotId);
    expect(await readFile(skill, "utf8")).toContain("mutated");

    const missing = await rapp.request("/api/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId }),
    });
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { code: string }).code).toBe("bad-usage");
    expect(await readFile(skill, "utf8")).toContain("mutated");

    const done = await rapp.request("/api/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId, confirm: "reset" }),
    });
    expect(done.status).toBe(200);
    const sb = (await done.json()) as {
      command: string;
      started?: boolean;
      snapshotId: string;
      storeRoot: string;
      asideStore: string;
      adopted: number;
    };
    expect(sb.command).toBe("reset");
    expect(sb.started).toBeUndefined();
    expect(sb.snapshotId).toBe(snapshotId);
    expect(sb.storeRoot).toBe(isolatedRoot);
    expect(sb.asideStore).toContain(".pre-reinit-");
    expect(await readFile(skill, "utf8")).toContain("original");
    const pointer = JSON.parse(await readFile(path.join(isolated, ".skills-hub", "config.json"), "utf8")) as { storeRoot: string };
    expect(pointer.storeRoot).toBe(isolatedRoot);
  }, 30_000);

  it("未配置库存:store-not-configured 503", async () => {
    const bare = createUiApp({ storeRoot: null, home });
    const res = await bare.request("/api/skills");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; command: string; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("store-not-configured");
  });
});
