import {
  ConflictOperationError, diffConflictVariants, readConflictVariantFile, readConflicts, resolveConflict,
  type ConflictResolution, type HubPaths,
} from "@skills-hub/core";
import { defineCommand } from "citty";
import { z } from "zod";
import { redactGitSecrets } from "./git/index.js";
import { autoVersionSkillAssets } from "./git-ops.js";
import { resolveHome } from "./home.js";
import { emitError, emitOk } from "./json-out.js";
import { scrub } from "./llm/errors.js";
import { requireWriteAuth, resolveStoreRootOrFail } from "./store-shared.js";

const variant = z.string().regex(/^(?:active|[a-f0-9]{12})$/);
const savedVariant = z.string().regex(/^[a-f0-9]{12}$/);
const summary = z.string().trim().min(1).max(500);
const mergedFiles = z.record(z.string(), z.string());

export const conflictAgentDecision = z.object({
  skillName: z.string().min(1),
  mode: z.enum(["pick", "merge", "split"]),
  winnerVariantId: variant.optional(),
  variantId: savedVariant.optional(),
  mergedFiles: mergedFiles.optional(),
  deletePaths: z.array(z.string()).optional(),
  newName: z.string().min(1).optional(),
  summary,
});

const decisionSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("pick"), winnerVariantId: variant, summary: summary.optional() }),
  z.strictObject({
    mode: z.literal("merge"), mergedFiles, deletePaths: z.array(z.string()).optional(), summary: summary.optional(),
  }),
  z.strictObject({
    mode: z.literal("split"), variantId: savedVariant.optional(), winnerVariantId: savedVariant.optional(),
    newName: z.string().min(1), summary: summary.optional(),
  }),
]);

export function conflictError(error: unknown) {
  return {
    ok: false as const,
    code: error instanceof ConflictOperationError ? error.code : "io-error" as const,
    message: scrub(error instanceof Error ? error.message : String(error)),
  };
}

export async function performConflictResolution(paths: HubPaths, skillName: string, value: unknown, home?: string) {
  const parsed = decisionSchema.safeParse(value);
  const invalid = { ok: false as const, code: "bad-usage" as const, message: "冲突决议参数无效，请检查模式、变体和文件清单" };
  if (!parsed.success) return invalid;
  const data = parsed.data;
  let decision: ConflictResolution;
  switch (data.mode) {
    case "pick":
      decision = { mode: "pick", winnerVariantId: data.winnerVariantId };
      break;
    case "merge":
      decision = {
        mode: "merge", mergedFiles: data.mergedFiles,
        ...(data.deletePaths === undefined ? {} : { deletePaths: data.deletePaths }),
      };
      break;
    case "split": {
      const id = data.variantId ?? data.winnerVariantId;
      if (id === undefined || (data.variantId !== undefined && data.winnerVariantId !== undefined && data.variantId !== data.winnerVariantId)) return invalid;
      decision = { mode: "split", variantId: id, newName: data.newName };
      break;
    }
  }
  const result = await resolveConflict(paths, skillName, decision);
  if (result.ok) {
    await autoVersionSkillAssets(home, paths, data.summary ?? "chore(skills): " + decision.mode + " conflict " + skillName);
  }
  return result.ok ? result : { ...result, message: scrub(result.message) };
}

export async function getConflictDiff(paths: HubPaths, skillName: string, variantA = "active", variantB?: string) {
  let target = variantB;
  if (target === undefined) {
    const record = (await readConflicts(paths)).find((entry) => entry.skillName === skillName);
    if (record === undefined) throw new ConflictOperationError("not-found", "没有未处理的同名冲突");
    target = variantA === "active"
      ? record.variants.find((entry) => entry.hash !== record.activeHash)?.variantId
      : "active";
    if (target === undefined) throw new ConflictOperationError("not-found", "没有可供对比的冲突变体");
  }
  return diffConflictVariants(paths, skillName, variantA, target);
}

export async function readConflictText(paths: HubPaths, skillName: string, variantId: string, relative: string) {
  const result = await readConflictVariantFile(paths, skillName, variantId, relative);
  return result.ok
    ? { ...result, content: redactGitSecrets(result.content) }
    : { ...result, message: scrub(result.message) };
}

export async function getSharedConflictDiff(paths: HubPaths, skillName: string, variantA?: string, variantB?: string) {
  const diff = await getConflictDiff(paths, skillName, variantA, variantB);
  for (const file of diff.files) {
    for (const hunk of file.hunks ?? []) {
      for (const line of hunk.lines) line.text = redactGitSecrets(line.text);
    }
  }
  return diff;
}

const globalArgs = {
  home: { type: "string", description: "重定向 Home（沙箱验证）" },
  json: { type: "boolean", description: "机器可读输出" },
} as const;

export const conflicts = defineCommand({
  meta: { name: "conflicts", description: "列出、比较和处理同名技能冲突" },
  subCommands: {
    list: defineCommand({
      meta: { name: "list", description: "列出待处理的同名冲突" },
      args: globalArgs,
      async run({ args }) {
        const command = "conflicts-list";
        const paths = await resolveStoreRootOrFail(args, command);
        if (paths === null) return;
        try {
          const records = await readConflicts(paths);
          if (args.json) emitOk(command, { conflicts: records });
          else if (records.length === 0) console.log("没有待处理冲突");
          else for (const record of records) console.log(record.skillName + " · " + String(record.variants.length) + " 版");
        } catch (error) {
          const result = conflictError(error);
          emitError(args.json === true, command, "io-error", result.message);
        }
      },
    }),
    diff: defineCommand({
      meta: { name: "diff", description: "比较两个冲突变体" },
      args: {
        ...globalArgs,
        name: { type: "positional", required: true },
        a: { type: "string", description: "左侧变体，默认 active" },
        b: { type: "string", description: "右侧变体，省略时选择首个异版或 active" },
      },
      async run({ args }) {
        const command = "conflicts-diff";
        const paths = await resolveStoreRootOrFail(args, command);
        if (paths === null) return;
        try {
          const diff = await getConflictDiff(paths, args.name, args.a, args.b);
          if (args.json) emitOk(command, diff);
          else for (const file of diff.files) {
            console.log(file.status + " " + file.relPath + (file.isBinary ? " (binary)" : "") + (file.truncated ? " (truncated)" : ""));
            for (const hunk of file.hunks ?? []) {
              console.log(hunk.header);
              for (const line of hunk.lines) console.log(({ add: "+", del: "-", context: " " })[line.kind] + line.text);
            }
          }
        } catch (error) {
          const result = conflictError(error);
          emitError(args.json === true, command, result.code === "outside" ? "bad-usage" : result.code, result.message);
        }
      },
    }),
    resolve: defineCommand({
      meta: { name: "resolve", description: "选择一个变体或将其拆分为独立技能" },
      args: {
        ...globalArgs,
        name: { type: "positional", required: true },
        mode: { type: "string", description: "pick 或 split" },
        winner: { type: "string", description: "所选变体 ID（pick 默认 active）" },
        "new-name": { type: "string", description: "拆分后新技能名" },
        yes: { type: "boolean", description: "非交互授权写入" },
      },
      async run({ args }) {
        const command = "conflicts-resolve";
        if (args.mode !== "pick" && args.mode !== "split") {
          emitError(args.json === true, command, "bad-usage", "CLI 支持 --mode pick 或 --mode split");
          return;
        }
        if (!requireWriteAuth(args, command)) return;
        const paths = await resolveStoreRootOrFail(args, command);
        if (paths === null) return;
        const result = await performConflictResolution(paths, args.name, args.mode === "pick"
          ? { mode: "pick", winnerVariantId: args.winner ?? "active" }
          : { mode: "split", winnerVariantId: args.winner, newName: args["new-name"] }, resolveHome(args.home));
        if (!result.ok) emitError(args.json === true, command, result.code === "outside" ? "bad-usage" : result.code, result.message);
        else if (args.json) emitOk(command, result);
        else console.log("已完成 " + result.skillName + " 冲突决议，未决变体 " + String(result.remainingVariants));
      },
    }),
  },
});
