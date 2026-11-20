import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HubPaths } from "@skills-hub/core";
import { createGhDeviceLogin, getGitLog, runGit, type CommandRunner } from "../src/git/index.js";
import { performGitToggle } from "../src/git-ops.js";
import { performInit } from "../src/store-shared.js";
import { createUiApp } from "../src/ui-server.js";

const ok = (stdout = "", stderr = "") => ({ ok: true as const, stdout, stderr });
const auth = ok("", "✓ Logged in to github.com account sandbox-user (keyring)\n  - Active account: true\n");
const missing = { ok: false as const, stdout: "", stderr: "", reason: "missing" as const, exitCode: null, message: "missing command" };
const ioLimit = { timeout: 65_000 };
type Launcher = NonNullable<NonNullable<Parameters<typeof createGhDeviceLogin>[0]>["launch"]>;

let home: string;
let paths: HubPaths;

beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), "skills-hub-git-cloud-")));
  const init = await performInit(home);
  if (!init.ok) throw new Error(init.message);
  paths = init.paths;
  vi.stubEnv("GIT_CONFIG_GLOBAL", path.join(home, "no-global-git-config"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true, maxRetries: 3 });
});

function send(app: ReturnType<typeof createUiApp>, url: string, body: object = {}, method = "POST") {
  return app.request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const markdown = (name: string, text: string) => "---\nname: " + name + "\ndescription: sandbox\n---\n" + text + "\n";

async function skillFile(dir: string, name: string, text: string, time?: number) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "SKILL.md");
  await writeFile(file, markdown(name, text));
  if (time !== undefined) await utimes(file, time, time);
}

it("reports missing dependencies, including during onboarding, without changing the toggle", async () => {
  const unavailable: CommandRunner = async () => missing;
  const gitRuntime = { git: unavailable, gh: unavailable };
  const onboarding = createUiApp({ home, paths: null, gitRuntime });
  expect(await (await onboarding.request("/api/git/status")).json()).toMatchObject({
    enabled: false, gitInstalled: false, ghInstalled: false,
  });
  const app = createUiApp({ home, paths, gitRuntime });
  expect((await send(app, "/api/git/toggle", { enabled: true })).status).toBe(409);
  expect((await send(app, "/api/git/toggle", { enabled: "true" })).status).toBe(400);
  expect(await (await app.request("/api/settings")).json()).toMatchObject({ git: { enabled: false } });
});

it("honors non-interactive approval, -m and optional log scope through the built CLI", ioLimit, async () => {
  const cli = (...args: string[]) => {
    const result = spawnSync(process.execPath, [
      path.resolve("dist", "index.js"), "git", ...args, "--home", home, "--json",
    ], { encoding: "utf8", timeout: 20_000 });
    expect(result.stdout, result.stderr).not.toBe("");
    return { status: result.status, body: JSON.parse(result.stdout) as unknown };
  };
  expect(cli("enable")).toMatchObject({ status: 2, body: { code: "auth-required" } });
  expect(cli("enable", "--yes")).toMatchObject({ status: 0, body: { enabled: true } });
  await writeFile(path.join(paths.skillsRoot, "cli-note.md"), "sample");
  expect(cli("commit", "-m", "CLI test edit", "--yes")).toMatchObject({
    status: 0, body: { command: "git-commit", commitHash: expect.any(String) },
  });
  expect(cli("log", "--limit", "1")).toMatchObject({ status: 0, body: { commits: [{ message: "CLI test edit" }] } });
  expect(cli("cloud", "init", "--repo", "unused", "--private")).toMatchObject({ status: 2, body: { code: "auth-required" } });
});

it("records every active asset entry point with real sandbox Git and pauses commits when switched off", ioLimit, async () => {
  const gh: CommandRunner = async () => missing;
  const app = createUiApp({ home, paths, gitRuntime: { gh } });
  const write = async (url: string, body: object = {}, method = "POST") => {
    const response = await send(app, url, body, method);
    const data = await response.json();
    expect(data, JSON.stringify(data)).toMatchObject({ ok: true });
    return data;
  };
  expect(await (await app.request("/api/skills")).json()).toMatchObject({ gitEnabled: false });
  await write("/api/git/toggle", { enabled: true });
  expect(await (await app.request("/api/skills")).json()).toMatchObject({ gitEnabled: true });
  const source = path.join(home, "source");
  await skillFile(source, "first", "before");
  await write("/api/adopt", { source });
  await write("/api/skills/first/file?path=SKILL.md", { content: markdown("first", "after") }, "PUT");
  await write("/api/skills/first/archive");
  await write("/api/skills/first/restore");
  await write("/api/drafts", { dirName: "drafted" });
  const draft = await (await app.request("/api/drafts")).json() as { drafts: Array<{ dirName: string }> };
  expect(draft.drafts.map((entry) => entry.dirName)).toContain("drafted");
  const allocated = await write("/api/drafts", { dirName: "published" }) as { storeDir: string };
  await writeFile(path.join(allocated.storeDir, "SKILL.md"), markdown("published", "freshly authored"));
  await write("/api/drafts/published/commit");
  await skillFile(path.join(home, ".claude", "skills", "shared"), "shared", "claude", 1_750_000_000);
  await skillFile(path.join(home, ".codex", "skills", "shared"), "shared", "codex", 1_750_000_200);
  await write("/api/reconcile/apply");
  const conflicts = await (await app.request("/api/conflicts")).json() as { conflicts: Array<{variants: Array<{ variantId: string; sourceClients: string[] }>}> };
  const older = conflicts.conflicts[0]!.variants.find((value) => value.sourceClients.includes("claude"))!.variantId;
  await write("/api/conflicts/shared/resolve", { mode: "pick", winnerVariantId: older, summary: "Resolve shared with Claude source" });

  const log = await getGitLog(paths.skillsRoot);
  expect(log.map((entry) => entry.message)).toEqual([
    "Resolve shared with Claude source", "chore(skills): reconcile client versions", "feat(skills): publish published",
    "chore(skills): restore first", "chore(skills): archive first", "docs(skills): edit first/SKILL.md",
    "feat(skills): adopt 1 skill(s)", "chore(skills): initialize single-source repository",
  ]);
  const history = await (await app.request("/api/git/log?skill=first&limit=2")).json() as { commits: Array<{ hash: string }> };
  expect(history.commits).toHaveLength(2);
  expect(history.commits[0]).toMatchObject({ filesChanged: 1, insertions: 5, deletions: 0 });
  const patch = await (await app.request("/api/git/diff?skill=first&commit=" + history.commits[0]!.hash)).json();
  expect(patch).toMatchObject({ ok: true, patch: expect.stringContaining("+after") });
  expect((await app.request("/api/git/diff?commit=--all")).status).toBe(400);
  await write("/api/git/toggle", { enabled: false });
  expect(await (await app.request("/api/skills")).json()).toMatchObject({ gitEnabled: false });
  await write("/api/skills/first/file?path=SKILL.md", { content: markdown("first", "git disabled") }, "PUT");
  expect(await getGitLog(paths.skillsRoot)).toEqual(log);
  await expect(readFile(path.join(paths.skillsRoot, "first", "SKILL.md"), "utf8")).resolves.toContain("git disabled");
});

it("keeps the inventory write when a Git side effect fails and emits a structured warning", ioLimit, async () => {
  await performGitToggle(home, paths, true);
  await rename(path.join(paths.skillsRoot, ".git"), path.join(home, "saved-git"));
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const app = createUiApp({ home, paths });
  const response = await send(app, "/api/drafts", { dirName: "despite-git", description: "preserved" });
  expect(await response.json()).toMatchObject({ ok: true, dirName: "despite-git" });
  await expect(readFile(path.join(paths.skillsRoot, "despite-git", "SKILL.md"), "utf8")).resolves.toContain("preserved");
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('"code":"git-auto-commit-failed"'));
});

it("finds a credential removed from the worktree, sends only an explicitly confirmed mock creation, and never forces push", ioLimit, async () => {
  await performGitToggle(home, paths, true);
  const secret = "ghp_" + "x".repeat(36);
  const gh = vi.fn<CommandRunner>().mockImplementation(async (_cwd, args) => args[0] === "auth" ? auth : ok());
  const git = vi.fn<CommandRunner>().mockImplementation(async (cwd, args, options) => args[0] === "push"
    ? { ok: false, stdout: "", stderr: "rejected (non-fast-forward)", reason: "exit", exitCode: 1, message: "rejected" }
    : runGit(cwd, args, options));
  const app = createUiApp({ home, paths, gitRuntime: { git, gh } });
  const source = path.join(home, "sensitive");
  await skillFile(source, "fixture", secret);
  expect((await send(app, "/api/adopt", { source })).status).toBe(200);
  expect((await send(app, "/api/skills/fixture/file?path=SKILL.md", { content: markdown("fixture", "cleared") }, "PUT")).status).toBe(200);
  const setup = { repoName: "probe-backup", visibility: "public" };
  const blocked = await send(app, "/api/git/cloud/setup", setup);
  expect(blocked.status).toBe(409);
  const details = await blocked.text();
  expect(details).toContain("secret-detected");
  expect(details).toContain("fixture/SKILL.md");
  expect(details).toContain("[redacted]");
  expect(details).not.toContain(secret);
  expect(gh).not.toHaveBeenCalled();
  const created = await send(app, "/api/git/cloud/setup", { ...setup, confirmPublicSecrets: true });
  expect(await created.json()).toMatchObject({ ok: true, remoteUrl: "https://github.com/sandbox-user/probe-backup" });
  expect(gh.mock.calls[1]?.[1]).toEqual([
    "repo", "create", "probe-backup", "--public", "--source", paths.skillsRoot, "--remote", "origin", "--push",
  ]);
  expect(await runGit(paths.skillsRoot, ["remote", "add", "origin", "https://github.com/sandbox-user/probe-backup.git"])).toMatchObject({ ok: true });
  const push = await send(app, "/api/git/cloud/push");
  expect(push.status).toBe(409);
  expect(await push.json()).toMatchObject({ code: "remote-diverged" });
  expect(git.mock.calls.find(([, args]) => args[0] === "push")?.[1]).toEqual(["push", "-u", "origin", "HEAD"]);
  expect((await send(app, "/api/git/cloud/setup", { ...setup, visibility: "private" })).status).toBe(409);
  expect(gh).toHaveBeenCalledTimes(2);
});

it("streams split device challenge output, polls only sanitized state and verifies login on child exit", async () => {
  let events: Parameters<Launcher>[2] | undefined;
  const child = vi.fn();
  const launch = vi.fn<Launcher>((_cwd, _args, next) => {
    events = next;
    queueMicrotask(() => {
      next.output("First copy your one-time code: A1B2-");
      next.output("C3D4\nOpen this URL: https://github.com/login/device\n");
    });
    return child;
  });
  const gh = vi.fn<CommandRunner>().mockResolvedValue(auth);
  const deviceLogin = createGhDeviceLogin({ launch, runner: gh });
  const app = createUiApp({ home, paths, gitRuntime: { gh, deviceLogin } });
  const started = await send(app, "/api/git/gh/login/start");
  const payload = await started.json() as { sessionId: string };
  const status = "/api/git/gh/login/status?sessionId=" + payload.sessionId;
  expect(payload).toMatchObject({ userCode: "A1B2-C3D4", verificationUri: "https://github.com/login/device", status: "pending" });
  expect(launch.mock.calls[0]?.[1]).toEqual(["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"]);
  expect(await (await app.request(status)).json()).toMatchObject({ authenticated: false });
  expect(await (await send(app, "/api/git/gh/login/start")).json()).toMatchObject({ sessionId: payload.sessionId });
  expect(launch).toHaveBeenCalledOnce();
  events?.exit(0);
  await vi.waitFor(async () => expect(await (await app.request(status)).json()).toMatchObject({
    authenticated: true, username: "sandbox-user", status: "authenticated",
  }));
  expect(await (await app.request(status)).text()).not.toContain("A1B2-C3D4");
  expect(child).not.toHaveBeenCalled();
  expect((await app.request("/api/git/gh/login/status?sessionId=other")).status).toBe(404);
});

it("expires and terminates stalled device sessions", async () => {
  vi.useFakeTimers();
  const terminate = vi.fn();
  const launch: Launcher = (_cwd, _args, events) => {
    events.output("Code: 1234-ABCD\nhttps://github.com/login/device");
    return terminate;
  };
  const broker = createGhDeviceLogin({ launch, expiresMs: 50, challengeMs: 20 });
  const challenge = await broker.start(paths.skillsRoot);
  await vi.advanceTimersByTimeAsync(51);
  expect(terminate).toHaveBeenCalledOnce();
  expect(broker.poll(challenge.sessionId)).toMatchObject({ authenticated: false, status: "expired" });
});
