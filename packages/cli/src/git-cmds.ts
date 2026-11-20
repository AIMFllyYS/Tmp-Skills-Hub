import type { HubPaths } from "@skills-hub/core";
import { defineCommand } from "citty";
import { GhLoginError, redactGitSecrets } from "./git/index.js";
import {
  GitOperationError, performCloudPush, performCloudSetup, performGitCommit, performGitLog, performGitStatus, performGitToggle,
} from "./git-ops.js";
import { resolveHome } from "./home.js";
import { emitError, emitOk, type JsonErrorCode } from "./json-out.js";
import { requireWriteAuth, resolveConfiguredHubPaths, resolveStoreRootOrFail } from "./store-shared.js";

export function gitFailure(error: unknown): { code: JsonErrorCode; message: string } {
  const code = error instanceof GitOperationError || error instanceof GhLoginError ? error.code : "io-error";
  return { code, message: redactGitSecrets(error instanceof Error ? error.message : String(error)) };
}

type ToolArgs = { home: string | undefined; json: boolean | undefined; yes?: boolean | undefined };
type GitActionOutcome =
  | ({ ok: true } & Record<string, unknown>)
  | { ok: false; code: JsonErrorCode; message: string; findings?: unknown };

const flags = {
  home: { type: "string", description: "重定向 Home（沙箱验证）" },
  json: { type: "boolean", description: "机器可读输出" },
} as const;
const writeFlags = { ...flags, yes: { type: "boolean", description: "授权非交互写操作" } } as const;

async function runAction(command: string, args: ToolArgs, write: boolean,
  action: (home: string, paths: HubPaths) => Promise<GitActionOutcome>): Promise<void> {
  if (write && !requireWriteAuth({ yes: args.yes, json: args.json }, command)) return;
  const paths = await resolveStoreRootOrFail(args, command);
  if (paths === null) return;
  try {
    const result = await action(resolveHome(args.home), paths);
    if (!result.ok) {
      const details = result.findings === undefined ? {} : { findings: result.findings };
      emitError(args.json === true, command, result.code, result.message, details);
    } else if (args.json) {
      emitOk(command, result);
    } else {
      const { ok: _ok, ...data } = result;
      void _ok;
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    const failure = gitFailure(error);
    emitError(args.json === true, command, failure.code, failure.message);
  }
}

function toggle(enabled: boolean) {
  const name = enabled ? "enable" : "disable";
  return defineCommand({
    meta: { name, description: enabled ? "初始化并开启 Git" : "暂停自动 Git 提交" },
    args: writeFlags,
    run({ args }) {
      return runAction("git-" + name, args, true, async (home, paths) =>
        ({ ok: true, ...await performGitToggle(home, paths, enabled) }));
    },
  });
}

export const git = defineCommand({
  meta: { name: "git", description: "管理唯一真源仓库与 GitHub 备份" },
  subCommands: {
    status: defineCommand({
      meta: { name: "status", description: "检查 Git、GitHub CLI 和版本库状态" },
      args: flags,
      async run({ args }) {
        try {
          const home = resolveHome(args.home);
          const configured = await resolveConfiguredHubPaths(home);
          const status = await performGitStatus(home, configured.ok ? configured.paths : null);
          if (args.json) emitOk("git-status", status);
          else console.log(JSON.stringify(status, null, 2));
        } catch (error) {
          const failure = gitFailure(error);
          emitError(args.json === true, "git-status", failure.code, failure.message);
        }
      },
    }),
    enable: toggle(true),
    disable: toggle(false),
    log: defineCommand({
      meta: { name: "log", description: "查看真源或指定技能的版本历史" },
      args: { ...flags, name: { type: "positional", required: false }, skill: { type: "string" }, limit: { type: "string" } },
      run({ args }) {
        return runAction("git-log", args, false, async (home, paths) => ({
          ok: true, commits: await performGitLog(home, paths, args.skill ?? args.name, Number(args.limit ?? "30")),
        }));
      },
    }),
    commit: defineCommand({
      meta: { name: "commit", description: "提交唯一真源中的本地改动" },
      args: { ...writeFlags, message: { type: "positional", required: false }, summary: { type: "string", alias: "m" } },
      run({ args }) {
        return runAction("git-commit", args, true, async (home, paths) =>
          ({ ok: true, ...await performGitCommit(home, paths, args.summary ?? args.message ?? "") }));
      },
    }),
    cloud: defineCommand({
      meta: { name: "cloud", description: "创建和更新 GitHub 备份仓库" },
      subCommands: {
        init: defineCommand({
          meta: { name: "init", description: "创建 GitHub 备份，默认使用私有仓库" },
          args: {
            ...writeFlags, name: { type: "positional", required: false }, repo: { type: "string" },
            private: { type: "boolean" }, public: { type: "boolean" },
            "confirm-public-secrets": { type: "boolean" },
          },
          run({ args }) {
            return runAction("git-cloud-init", args, true, (home, paths) => {
              if (args.private && args.public) {
                throw new GitOperationError("bad-usage", "--private 和 --public 只能选其一。");
              }
              return performCloudSetup(home, paths, {
                repoName: args.repo ?? args.name ?? "",
                visibility: args.public ? "public" : "private",
                confirmPublicSecrets: args["confirm-public-secrets"] === true,
              });
            });
          },
        }),
        push: defineCommand({
          meta: { name: "push", description: "推送到现有 GitHub 备份仓库" },
          args: writeFlags,
          run({ args }) { return runAction("git-cloud-push", args, true, (home, paths) => performCloudPush(home, paths)); },
        }),
      },
    }),
  },
});
