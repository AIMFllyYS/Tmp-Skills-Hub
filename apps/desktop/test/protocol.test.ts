import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createUiApp,
  performInit,
  type TranslateStreamFn,
  type UiAppOptions,
} from "@skills-hub/cli";
import { adoptSkillFolder } from "@skills-hub/core";
import {
  createAppProtocolHandler,
  resolveDesktopTransport,
  startDesktopHttpTransport,
} from "../src/protocol.js";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("apps/desktop protocol bridge", () => {
  it("resolves transport mode from SKILLSHUB_DESKTOP_TRANSPORT", () => {
    expect(resolveDesktopTransport({})).toBe("protocol");
    expect(resolveDesktopTransport({ SKILLSHUB_DESKTOP_TRANSPORT: "" })).toBe("protocol");
    expect(resolveDesktopTransport({ SKILLSHUB_DESKTOP_TRANSPORT: "http" })).toBe("http");
    expect(resolveDesktopTransport({ SKILLSHUB_DESKTOP_TRANSPORT: " HTTP " })).toBe("http");
  });

  it("serves GET /api/health, static webRoot assets, and sandbox GET /api/skills over app://skills-hub", async () => {
    const home = await makeTempDir("skills-hub-desktop-home-");
    const webRoot = await makeTempDir("skills-hub-desktop-web-");
    const sourceSkill = await makeTempDir("skills-hub-desktop-skill-");

    await writeFile(path.join(webRoot, "index.html"), "<!doctype html><html><body>desktop-ok</body></html>", "utf8");
    await mkdir(path.join(webRoot, "assets"), { recursive: true });
    await writeFile(path.join(webRoot, "assets", "app.js"), "console.info('ok');", "utf8");

    const initRes = await performInit(home);
    expect(initRes.ok).toBe(true);
    if (!initRes.ok) throw new Error(initRes.message);

    const demoSkillDir = path.join(sourceSkill, "demo-desktop");
    await mkdir(demoSkillDir, { recursive: true });
    await writeFile(
      path.join(demoSkillDir, "SKILL.md"),
      "---\nname: demo-desktop\ndescription: Desktop protocol test skill\n---\n\n# Demo Desktop\n",
      "utf8",
    );
    const adopted = await adoptSkillFolder(initRes.storeRoot, demoSkillDir, {
      kind: "authored",
      reference: "desktop-test",
    });
    expect(adopted.kind).toBe("adopted");

    const honoApp = createUiApp({ storeRoot: initRes.storeRoot, home, webRoot });
    const handler = createAppProtocolHandler(honoApp);

    const healthRes = await handler(new Request("app://skills-hub/api/health"));
    expect(healthRes.status).toBe(200);
    expect((await healthRes.json()) as { ok: boolean }).toEqual({ ok: true });

    const skillsRes = await handler(new Request("app://skills-hub/api/skills"));
    expect(skillsRes.status).toBe(200);
    const skillsBody = (await skillsRes.json()) as {
      ok: boolean;
      total: number;
      skills: { dirName: string }[];
    };
    expect(skillsBody.ok).toBe(true);
    expect(skillsBody.total).toBe(1);
    expect(skillsBody.skills[0]?.dirName).toBe("demo-desktop");

    const htmlRes = await handler(new Request("app://skills-hub/"));
    expect(htmlRes.status).toBe(200);
    expect(await htmlRes.text()).toContain("desktop-ok");

    const assetRes = await handler(new Request("app://skills-hub/assets/app.js"));
    expect(assetRes.status).toBe(200);
    expect(assetRes.headers.get("content-type")).toContain("text/javascript");
  });

  it("bridges POST /api/translate SSE stream and POST /api/agent/chat UI message stream", async () => {
    const home = await makeTempDir("skills-hub-desktop-stream-");
    const initRes = await performInit(home);
    expect(initRes.ok).toBe(true);
    if (!initRes.ok) throw new Error(initRes.message);

    const translateStream: TranslateStreamFn = async function* (text) {
      expect(text).toBe("hello desktop");
      yield { type: "text", delta: "你好" };
      yield { type: "text", delta: "桌面" };
      yield { type: "done" };
    };

    const usage = {
      inputTokens: { total: 1, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    };

    const languageModel = {
      specificationVersion: "v3",
      provider: "mock-provider",
      modelId: "mock-model-id",
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error("unexpected doGenerate call");
      },
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "t0" });
            controller.enqueue({ type: "text-delta", id: "t0", delta: "Agent桌面回复" });
            controller.enqueue({ type: "text-end", id: "t0" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage,
            });
            controller.close();
          },
        }),
      }),
    } satisfies NonNullable<UiAppOptions["languageModel"]>;

    const honoApp = createUiApp({
      storeRoot: initRes.storeRoot,
      home,
      translateStream,
      languageModel,
    });
    const handler = createAppProtocolHandler(honoApp);

    const translateRes = await handler(
      new Request("app://skills-hub/api/translate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "app://skills-hub",
        },
        body: JSON.stringify({ text: "hello desktop" }),
      }),
    );
    expect(translateRes.status).toBe(200);
    expect(translateRes.headers.get("content-type")).toContain("text/event-stream");
    const sseText = await translateRes.text();
    expect(sseText).toContain("event: delta");
    expect(sseText).toContain("你好");
    expect(sseText).toContain("桌面");
    expect(sseText).toContain("event: done");

    const chatRes = await handler(
      new Request("app://skills-hub/api/agent/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "app://skills-hub",
        },
        body: JSON.stringify({
          messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "你好" }] }],
        }),
      }),
    );
    expect(chatRes.status).toBe(200);
    expect(chatRes.headers.get("content-type")).toContain("text/event-stream");
    const chatText = await chatRes.text();
    expect(chatText).toContain("Agent桌面回复");
  });

  it("rejects malicious external origins, disallowed hosts, and non-app schemes with 403 forbidden", async () => {
    const home = await makeTempDir("skills-hub-desktop-sec-");
    const initRes = await performInit(home);
    expect(initRes.ok).toBe(true);
    if (!initRes.ok) throw new Error(initRes.message);

    const honoApp = createUiApp({ storeRoot: initRes.storeRoot, home });
    const handler = createAppProtocolHandler(honoApp);

    const badOriginRes = await handler(
      new Request("app://skills-hub/api/groups", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({ id: "malicious" }),
      }),
    );
    expect(badOriginRes.status).toBe(403);
    expect(((await badOriginRes.json()) as { code: string }).code).toBe("forbidden");

    const badUrlHostRes = await handler(new Request("app://evil.example/api/skills"));
    expect(badUrlHostRes.status).toBe(403);
    expect(((await badUrlHostRes.json()) as { code: string }).code).toBe("forbidden");

    const badHeaderHostRes = await handler(
      new Request("app://skills-hub/api/skills", {
        headers: { host: "evil.example" },
      }),
    );
    expect(badHeaderHostRes.status).toBe(403);
    expect(((await badHeaderHostRes.json()) as { code: string }).code).toBe("forbidden");

    const badSchemeRes = await handler(new Request("https://skills-hub/api/health"));
    expect(badSchemeRes.status).toBe(403);
    expect(((await badSchemeRes.json()) as { code: string }).code).toBe("forbidden");
  });

  it("supports HTTP fallback transport on 127.0.0.1:0 and closes cleanly", async () => {
    const home = await makeTempDir("skills-hub-desktop-http-");
    const webRoot = await makeTempDir("skills-hub-desktop-http-web-");
    await writeFile(path.join(webRoot, "index.html"), "<html>http-fallback</html>", "utf8");

    const handle = await startDesktopHttpTransport({ home, webRoot });
    try {
      expect(handle.port).toBeGreaterThan(0);
      expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const res = await fetch(`${handle.url}/api/health`);
      expect(res.status).toBe(200);
      expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });
    } finally {
      await handle.close();
    }
  });
});
