// @vitest-environment jsdom
import { act, createElement as element } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GitSettingsPanel } from "./GitSettingsPanel.js";
import { SkillHistory } from "./SkillHistory.js";
import { parseCommitPatch } from "./commit-patch.js";

const dependencies = { enabled: true, gitInstalled: true, ghInstalled: true, ghAuthenticated: false };
const remote = "https://github.com/fixture/backup";
const payload = (body: object, status = 200) => Response.json({ ok: status === 200, ...body }, { status });
const find = (id: string) => document.body.querySelector<HTMLElement>('[data-testid="' + id + '"]');
const changed = vi.fn();
let root: Root;
let host: HTMLDivElement;

async function click(id: string): Promise<void> {
  const target = find(id);
  if (target === null) throw new Error("Missing " + id);
  await act(async () => target.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  changed.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("offers local Git installation and defers GitHub setup during onboarding", async () => {
  const fetch = vi.fn().mockResolvedValue(payload({ ...dependencies, enabled: false, gitInstalled: false, ghInstalled: false }));
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(element(GitSettingsPanel, { enableOnInit: false, onEnabledChange: changed })));
  expect(find("git-settings-section")?.textContent).toContain("winget install Git.Git");
  expect(find("git-env-gh")).toBeNull();
  expect(find("git-settings-section")?.querySelector("a")?.href).toBe("https://git-scm.com/downloads");
  expect(find("git-enable-switch")?.getAttribute("aria-disabled")).toBe("true");
  await click("git-enable-switch");
  expect(find("git-settings-section")?.textContent).toContain("可以直接初始化");
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/git/status"]);
  expect(changed).not.toHaveBeenCalled();
});

it("records onboarding opt-in locally and persists a settings toggle through the Git endpoint", async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    return url === "/api/git/toggle" ? payload({ enabled: true }) : payload({ ...dependencies, enabled: false });
  });
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(element(GitSettingsPanel, { key: "onboarding", enableOnInit: false, onEnabledChange: changed })));
  await click("git-enable-switch");
  expect(changed).toHaveBeenCalledExactlyOnceWith(true);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/git/status"]);
  await act(async () => root.render(element(GitSettingsPanel, { key: "settings", onEnabledChange: changed })));
  await click("git-enable-switch");
  expect(fetch).toHaveBeenCalledWith("/api/git/toggle", expect.objectContaining({ method: "POST", body: '{"enabled":true}' }));
  expect(changed.mock.calls).toContainEqual([true]);
});

it("opens login for an unauthenticated gh, polls sequentially and closes with the authenticated username", async () => {
  vi.useFakeTimers();
  const statusUrl = "/api/git/gh/login/status?sessionId=fixture";
  let signedIn = false;
  let polls = 0;
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url === "/api/git/status") return payload({ ...dependencies, ghAuthenticated: signedIn, ghUsername: signedIn ? "fixture" : null });
    if (url === "/api/git/gh/login/start") {
      return payload({ sessionId: "fixture", status: "pending", userCode: "ABCD-1234", verificationUri: "https://github.com/login/device" });
    }
    if (url !== statusUrl) throw new Error("Unexpected URL " + url);
    signedIn = ++polls === 2;
    return payload(signedIn ? { status: "authenticated", username: "fixture" } : { status: "pending" });
  });
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(element(GitSettingsPanel, { onEnabledChange: changed })));
  expect(find("git-env-gh")?.textContent).toContain("未登录");
  expect(polls).toBe(0);
  await click("git-open-gh-login");
  expect(find("gh-device-code")?.textContent).toBe("ABCD-1234");
  expect(find("gh-copy-and-open")).not.toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(polls).toBe(1);
  expect(find("gh-login-dialog")?.textContent).toContain("等待授权");
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(polls).toBe(2);
  expect(find("gh-login-dialog")).toBeNull();
  expect(find("git-env-gh")?.textContent).toContain("@fixture");
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(polls).toBe(2);
});

it("defaults to private, blocks an unacknowledged public finding and reports a divergent push", async () => {
  let configured = false;
  const requests: string[] = [];
  const fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
    if (url === "/api/git/status") {
      return payload({ ...dependencies, ghAuthenticated: true, ghUsername: "fixture", remoteUrl: configured ? remote : null, aheadCount: 2 });
    }
    if (url === "/api/git/cloud/setup") {
      const body = String(options.body);
      requests.push(body);
      configured = body.includes('"confirmPublicSecrets":true');
      return configured ? payload({ remoteUrl: remote }) : payload({
        code: "secret-detected", message: "需确认",
        findings: [{ file: "demo/example.txt", line: 14, preview: "[redacted]", rule: "fixture" }],
      }, 409);
    }
    if (url === "/api/git/cloud/push") return payload({ code: "remote-diverged", message: "需先拉取" }, 409);
    throw new Error("Unexpected URL " + url);
  });
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(element(GitSettingsPanel, { onEnabledChange: changed })));
  await click("git-open-cloud-setup");
  expect(find("cloud-visibility-private")?.getAttribute("aria-checked")).toBe("true");
  await click("cloud-visibility-public");
  await click("cloud-create-submit");
  expect(requests).toEqual(['{"repoName":"my-skills-hub-backup","visibility":"public"}']);
  expect(find("cloud-secret-findings")?.textContent).toContain("demo/example.txt");
  expect(find("cloud-secret-findings")?.textContent).toContain("14");
  expect(find("cloud-create-submit")?.hasAttribute("disabled")).toBe(true);
  await click("cloud-confirm-public-secrets");
  await click("cloud-create-submit");
  expect(requests[1]).toContain('"confirmPublicSecrets":true');
  expect(find("cloud-backup-dialog")).toBeNull();
  expect(document.body.querySelector('a[href="' + remote + '"]')).not.toBeNull();
  expect(find("git-ahead-badge")?.textContent).toContain("2");
  await click("git-push-backup");
  expect(find("git-remote-diverged-banner")?.textContent).toContain("git pull --rebase");
});

it("loads one skill's history on mount and a patch only after a commit is selected", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(payload({ commits: [{
      hash: "abcdef012345", shortHash: "abcdef0", timestamp: "2026-11-20T12:00:00Z",
      author: "Sandbox", message: "Initial example", filesChanged: 1, insertions: 1, deletions: 0,
    }] }))
    .mockResolvedValueOnce(payload({ patch: "diff --git a/demo/SKILL.md b/demo/SKILL.md\nnew file mode 100644\n@@ -0,0 +1 @@\n+hello" }));
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(element(SkillHistory, { skillName: "demo", close: vi.fn() })));
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/git/log?skill=demo"]);
  expect(find("history-commit-abcdef0")?.textContent).toContain("1 文件");
  await click("history-commit-abcdef0");
  expect(fetch.mock.calls[1]?.[0]).toBe("/api/git/diff?skill=demo&commit=abcdef012345");
  expect(find("history-diff-abcdef0")?.textContent).toContain("SKILL.md");
});

it("parses spaces, quoted paths, binary changes and both hunk line numbers", () => {
  const patch = [
    'diff --git a/demo/space name.md b/demo/space name.md',
    '@@ -2,2 +4,2 @@', ' line', '-before', '+after',
    'diff --git "a/demo/a\\tb.dat" "b/demo/a\\tb.dat"',
    'deleted file mode 100644', 'Binary files a/demo/a and /dev/null differ',
  ].join("\n");
  expect(parseCommitPatch(patch, "demo")).toEqual([
    { relPath: "space name.md", status: "modified", hunks: [{ header: "@@ -2,2 +4,2 @@", lines: [
      { kind: "context", oldLine: 2, newLine: 4, text: "line" },
      { kind: "del", oldLine: 3, text: "before" },
      { kind: "add", newLine: 5, text: "after" },
    ] }] },
    { relPath: "a\tb.dat", status: "removed", isBinary: true, hunks: [] },
  ]);
});
