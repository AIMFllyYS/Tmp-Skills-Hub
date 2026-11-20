import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  autoCommitSkillChange, detectGitEnvironment, getGitDiff, getGitLog, getGitStatus, initSkillsGitRepo,
  redactGitSecrets, runGit, scanSecretsInDir, type CommandRunner,
} from "../src/git/index.js";

let sandbox: string;
let root: string;
const enabled = { git: { enabled: true } };
// Each integration case starts several real Git processes, which can exceed 5 s on the Windows runner.
const gitIntegration = { timeout: 25_000 };

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(os.tmpdir(), "skills-hub-git-"));
  root = path.join(sandbox, "source with spaces");
  await mkdir(root);
  vi.stubEnv("GIT_CONFIG_GLOBAL", path.join(sandbox, "missing-user-config"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(sandbox, { recursive: true, force: true, maxRetries: 3 });
});

const paths = () => ({ stateRoot: path.join(sandbox, "state"), skillsRoot: root, layoutMode: "split" as const });

it("creates a baseline, stages one asset edit, reads log and diff, and skips unchanged assets", gitIntegration, async () => {
  const skill = path.join(root, "writing");
  await mkdir(skill);
  await writeFile(path.join(skill, "SKILL.md"), "original\n");
  await writeFile(path.join(root, ".gitignore"), "user-artifacts/\n");
  await writeFile(path.join(skill, ".env.local"), "sandbox placeholder");
  const initial = await initSkillsGitRepo(root);
  expect(initial).toMatchObject({ skipped: false, commitHash: expect.stringMatching(/^[0-9a-f]{40,64}$/) });
  const ignores = await readFile(path.join(root, ".gitignore"), "utf8");
  expect(ignores).toContain("user-artifacts/");
  expect(ignores).toContain(".env.*");
  expect(await getGitStatus(root)).toMatchObject({ initialized: true, branch: "main", dirtyCount: 0 });
  const identity = await runGit(root, ["config", "--local", "user.email"]);
  expect(identity).toMatchObject({ ok: true, stdout: "skills-hub@local\n" });
  expect((await runGit(root, ["ls-files"])).stdout).not.toContain(".env.local");
  expect(await initSkillsGitRepo(root)).toEqual({ skipped: true });
  expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe(ignores);
  await writeFile(path.join(skill, "SKILL.md"), "edited\n");
  const summary = 'Update writing; "$literal"';
  const edit = await autoCommitSkillChange(paths(), summary, enabled);
  expect(edit).toMatchObject({ skipped: false, commitHash: expect.any(String) });
  expect(await getGitLog(root, "writing")).toMatchObject([
    { hash: edit.commitHash, message: summary, author: "Skills Hub" },
    { hash: initial.commitHash, message: "chore(skills): initialize single-source repository" },
  ]);
  expect(await getGitDiff(root, initial.commitHash, edit.commitHash)).toContain("+edited");
  expect(await autoCommitSkillChange(paths(), "same files", enabled)).toEqual({ skipped: true });
  expect(await getGitStatus(root)).toMatchObject({ dirtyCount: 0 });
});

it("uses local identity, does not attach to a parent repository, and keeps a clean index on failure", gitIntegration, async () => {
  await initSkillsGitRepo(sandbox);
  expect(await getGitStatus(root)).toMatchObject({ initialized: false });
  await initSkillsGitRepo(root);
  expect(await runGit(root, ["config", "--local", "user.name", "Sandbox Author"])).toMatchObject({ ok: true });
  await writeFile(path.join(root, "sample.md"), "uncommitted data");
  const fakeCommitFailure: CommandRunner = (cwd, args, options) => args[0] === "commit"
    ? Promise.resolve({ ok: false, stdout: "", stderr: "", exitCode: 1, reason: "exit", message: "injected failure" })
    : runGit(cwd, args, options);
  await expect(autoCommitSkillChange(paths(), "change", enabled, fakeCommitFailure)).rejects.toThrow("injected failure");
  expect((await runGit(root, ["diff", "--cached", "--name-only"])).stdout).toBe("");
  await expect(readFile(path.join(root, "sample.md"), "utf8")).resolves.toBe("uncommitted data");
  await autoCommitSkillChange(paths(), "change", enabled);
  expect((await getGitLog(root))[0]).toMatchObject({ author: "Sandbox Author" });
  expect(await getGitLog(sandbox)).toHaveLength(1);
});

it("skips disabled or unavailable Git without touching a repository", async () => {
  const runner = vi.fn<CommandRunner>().mockResolvedValue({ ok: false, stdout: "", stderr: "", exitCode: null, reason: "missing", message: "not installed" });
  expect(await autoCommitSkillChange(paths(), "disabled", { git: { enabled: false } }, runner)).toEqual({ skipped: true });
  expect(runner).not.toHaveBeenCalled();
  expect(await autoCommitSkillChange(paths(), "absent Git", enabled, runner)).toEqual({ skipped: true });
  expect(runner).toHaveBeenCalledExactlyOnceWith(root, ["--version"]);
});

it("refuses tracked ignored files and linked paths without committing them", gitIntegration, async () => {
  await initSkillsGitRepo(root);
  const sampleEnv = path.join(root, ".env");
  await writeFile(sampleEnv, "synthetic placeholder");
  expect(await runGit(root, ["add", "-f", "--", ".env"])).toMatchObject({ ok: true });
  await expect(autoCommitSkillChange(paths(), "unsafe tracked item", enabled)).rejects.toThrow("忽略项");
  expect(await getGitLog(root)).toHaveLength(1);
  expect((await runGit(root, ["diff", "--cached", "--name-only"])).stdout).toContain(".env");
  await rm(sampleEnv);
  await autoCommitSkillChange(paths(), "no ignored data", enabled);
  const external = path.join(sandbox, "external");
  await mkdir(external);
  const linked = path.join(root, "linked");
  await symlink(external, linked, process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(external, "outside.md"), "keep outside");
  await expect(autoCommitSkillChange(paths(), "unsafe external", enabled)).rejects.toThrow("链接");
});

it("probes GitHub CLI through injected runners and selects the active login", async () => {
  const ok = (stdout: string, stderr = "") => ({ ok: true as const, stdout, stderr });
  const gh = vi.fn<CommandRunner>()
    .mockResolvedValueOnce(ok("gh version 2.90.0\n"))
    .mockResolvedValueOnce(ok("", "✓ Logged in to github.com account inactive-user (keyring)\n  - Active account: false\n✓ Logged in to github.com account active-user (keyring)\n  - Active account: true\n"));
  const git: CommandRunner = async () => ok("git version 2.53.0");
  expect(await detectGitEnvironment(root, { git, gh })).toMatchObject({
    gitInstalled: true, gitVersion: "2.53.0", ghInstalled: true, ghVersion: "2.90.0", ghUsername: "active-user", ghAuthenticated: true,
  });
  expect(gh.mock.calls.map(([, args]) => args)).toEqual([["--version"], ["auth", "status", "--hostname", "github.com"]]);
  const unavailable: CommandRunner = async () => { throw new Error("not installed"); };
  expect(await detectGitEnvironment(root, { git: unavailable, gh: unavailable })).toMatchObject({
    gitInstalled: false, gitInstallHint: "winget install Git.Git", ghInstalled: false, ghInstallHint: "winget install GitHub.cli", ghAuthenticated: false,
  });
});

it("reports synthetic credential patterns with line numbers and redacted previews", async () => {
  const testToken = "ghp_" + "x".repeat(36);
  const sampleKey = "sk-" + "a".repeat(30);
  const aws = "AKIA" + "A".repeat(16);
  const privateBody = "opaque-private-fixture";
  const file = path.join(root, "notes");
  await writeFile(file, [testToken, sampleKey, aws, "SERVICE_API_KEY=fixture123", "-----BEGIN RSA PRIVATE KEY-----", privateBody, "-----END RSA PRIVATE KEY-----"].join("\n"));
  const matches = await scanSecretsInDir(root);
  expect(matches.map(({ rule, line, file }) => [rule, line, file])).toEqual([
    ["github-token", 1, "notes"], ["openai-key", 2, "notes"], ["aws-access-key", 3, "notes"],
    ["api-key-assignment", 4, "notes"], ["private-key", 5, "notes"],
  ]);
  const output = JSON.stringify(matches) + redactGitSecrets(await readFile(file, "utf8"));
  for (const secret of [testToken, sampleKey, aws, "fixture123", privateBody]) expect(output).not.toContain(secret);
});
