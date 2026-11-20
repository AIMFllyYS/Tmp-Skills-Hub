import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { executeReconcile, readConflicts, type HubPaths } from "@skills-hub/core";
import { performInit } from "../src/store-shared.js";
import { createUiApp } from "../src/ui-server.js";

let home: string;
let paths: HubPaths;
let variant: string;
const file = (content: string) => "---\nname: demo\ndescription: temporary test\n---\n" + content;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "skills-hub-conflicts-cli-"));
  const init = await performInit(home);
  if (!init.ok) throw new Error(init.message);
  paths = init.paths;
  for (const [client, text, time] of [
    ["claude", "older", 1_750_000_000], ["codex", "newer", 1_750_000_100],
  ] as const) {
    const folder = path.join(home, "." + client, "skills", "demo");
    await mkdir(folder, { recursive: true });
    const md = path.join(folder, "SKILL.md");
    await writeFile(md, file(text));
    await writeFile(path.join(folder, "payload.bin"), Buffer.from([0, 1]));
    await utimes(md, time, time);
    await utimes(path.join(folder, "payload.bin"), time, time);
  }
  const result = await executeReconcile(home, paths);
  expect(result).toMatchObject({ ok: true, conflictCount: 1, failures: [] });
  variant = (await readConflicts(paths))[0]!.variants.find((entry) => entry.sourceClients.includes("claude"))!.variantId;
});

afterEach(() => rm(home, { recursive: true, force: true, maxRetries: 3 }));

function cli(action: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [
    path.resolve("dist", "index.js"), "conflicts", action, "--home", home, "--json", ...args,
  ], { encoding: "utf8", timeout: 15_000 });
  expect(result.stdout, result.stderr).not.toBe("");
  return { code: result.status, data: JSON.parse(result.stdout) as unknown };
}

it("supports listing, a default diff, authorization and split through the built command", { timeout: 20_000 }, async () => {
  expect(cli("list")).toMatchObject({ code: 0, data: { command: "conflicts-list", conflicts: [{ skillName: "demo" }] } });
  expect(cli("diff", "demo")).toMatchObject({ code: 0, data: { variantA: "active", variantB: variant } });
  expect(cli("resolve", "demo", "--mode", "pick", "--winner", variant)).toMatchObject({ code: 2, data: { code: "auth-required" } });
  expect(cli("resolve", "demo", "--mode", "split", "--winner", variant, "--new-name", "demo-old", "--yes")).toMatchObject({
    code: 0, data: { newSkill: { dirName: "demo-old" }, remainingVariants: 0 },
  });
  expect(await readFile(path.join(paths.skillsRoot, "demo", "SKILL.md"), "utf8")).toBe(file("newer"));
  expect(await readFile(path.join(paths.skillsRoot, "demo-old", "SKILL.md"), "utf8")).toContain("older");
});

it("exposes conflicts, diff and text with structured errors and protects decision writes", async () => {
  const app = createUiApp({ home, paths });
  const collection = "/api/conflicts";
  const item = collection + "/demo";
  const send = (body: object, origin?: string) => app.request(item + "/resolve", {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin === undefined ? {} : { origin }) },
    body: JSON.stringify(body),
  });
  expect(await (await app.request(collection)).json()).toMatchObject({ ok: true, conflicts: [{ skillName: "demo" }] });
  expect(await (await app.request(item + "/diff?a=active&b=" + variant)).json()).toMatchObject({
    ok: true, files: expect.arrayContaining([expect.objectContaining({ relPath: "SKILL.md", status: "modified" })]),
  });
  expect((await app.request(collection + "/missing/diff?a=active&b=" + variant)).status).toBe(404);
  const text = item + "/file?variant=" + variant + "&path=";
  expect(await (await app.request(text + "SKILL.md")).json()).toMatchObject({ ok: true, content: file("older") });
  expect((await app.request(text + "payload.bin")).status).toBe(422);
  expect((await app.request(text + encodeURIComponent("../SKILL.md"))).status).toBe(400);
  const pick = { mode: "pick", winnerVariantId: variant };
  expect((await send(pick, "https://example.invalid")).status).toBe(403);
  expect((await send({ mode: "merge", mergedFiles: ["invalid"] })).status).toBe(400);
  expect((await send({ mode: "merge", mergedFiles: { "../SKILL.md": "invalid" } })).status).toBe(400);
  expect((await readConflicts(paths)).length).toBe(1);
  expect(await (await send(pick)).json()).toMatchObject({ ok: true, remainingVariants: 0, archives: [expect.any(String)] });
  expect(await (await app.request(collection)).json()).toMatchObject({ conflicts: [] });
  expect(await readFile(path.join(home, ".codex", "skills", "demo", "SKILL.md"), "utf8")).toBe(file("older"));
});
