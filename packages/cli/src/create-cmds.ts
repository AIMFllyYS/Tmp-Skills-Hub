import {
  allocateDraft,
  commitDraft,
  createAndCommit,
  discardDraft,
  listDrafts,
} from "@skills-hub/core";
import { resolveStoreRootOrFail } from "./store-cmds.js";
import { emitError, emitOk } from "./json-out.js";

/**
 * CLI `new` command implementation (#169).
 *
 * Authorization tiering (cli-commands-v0.md §2.1):
 *   - new / new commit / new discard: store-internal writes, no --yes required
 *   - new commit --enable: links into client dir, requires --yes (not implemented here)
 */

export interface CreateArgs {
  home: string | undefined;
  json: boolean | undefined;
  description: string | undefined;
  _: (string | number)[];
}

export async function runNew(args: CreateArgs): Promise<void> {
  const positionals = args._.map(String);
  const verb = positionals[0] ?? "";

  if (verb === "commit") return runCommit(args, positionals.slice(1));
  if (verb === "discard") return runDiscard(args, positionals.slice(1));
  if (verb === "list") return runList(args);

  // Default: allocate
  const dirName = verb || positionals[1];
  if (!dirName) {
    emitError(args.json === true, "new", "bad-usage", "用法: new <name> — 需要指定 skill 名");
    return;
  }

  const storeRoot = await resolveStoreRootOrFail(args, "new");
  if (storeRoot === null) return;

  const seed: { description?: string; origin?: { kind: "authored"; reference: string } } = {
    origin: { kind: "authored", reference: "cli" },
  };
  if (args.description) seed.description = args.description;
  const result = await allocateDraft(storeRoot, dirName, seed);

  if (result.kind === "conflict") {
    emitError(args.json === true, "new", "draft-exists", result.reason);
    return;
  }

  if (args.json) {
    emitOk("new", {
      verb: "allocate",
      dirName: result.draft.dirName,
      storeDir: result.storeDir,
    });
  } else {
    console.log("草稿已创建: " + result.draft.dirName);
    console.log("  路径: " + result.storeDir);
    console.log("  请编辑 SKILL.md,然后运行 skills-hub new commit " + dirName);
  }
}

async function runCommit(args: CreateArgs, positionals: string[]): Promise<void> {
  const dirName = positionals[0];
  if (!dirName) {
    emitError(args.json === true, "new", "bad-usage", "用法: new commit <name>");
    return;
  }

  const storeRoot = await resolveStoreRootOrFail(args, "new");
  if (storeRoot === null) return;

  const result = await commitDraft(storeRoot, dirName);

  switch (result.kind) {
    case "committed":
      if (args.json) {
        emitOk("new", { verb: "commit", dirName, hash: result.record.hash });
      } else {
        console.log("定稿成功: " + dirName + " (哈希 " + result.record.hash.slice(0, 12) + ")");
      }
      break;
    case "draft-not-found":
      emitError(args.json === true, "new", "draft-not-found", "草稿不存在: " + dirName);
      break;
    case "incomplete":
      emitError(args.json === true, "new", "draft-incomplete", result.reason);
      break;
    case "duplicate":
      emitError(args.json === true, "new", "draft-exists", "内容与已有记录重复: " + result.record.dirName);
      break;
    case "conflict":
      emitError(args.json === true, "new", "draft-exists", result.reason);
      break;
  }
}

async function runDiscard(args: CreateArgs, positionals: string[]): Promise<void> {
  const dirName = positionals[0];
  if (!dirName) {
    emitError(args.json === true, "new", "bad-usage", "用法: new discard <name>");
    return;
  }

  const storeRoot = await resolveStoreRootOrFail(args, "new");
  if (storeRoot === null) return;

  const result = await discardDraft(storeRoot, dirName);

  if (result.kind === "draft-not-found") {
    emitError(args.json === true, "new", "draft-not-found", "草稿不存在: " + dirName);
    return;
  }

  if (args.json) {
    emitOk("new", { verb: "discard", dirName, archivePath: result.archivePath });
  } else {
    console.log("草稿已归档: " + dirName);
    console.log("  归档位置: " + result.archivePath);
  }
}

async function runList(args: CreateArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "new");
  if (storeRoot === null) return;

  const drafts = await listDrafts(storeRoot);

  if (args.json) {
    emitOk("new", { verb: "list", drafts });
    return;
  }

  if (drafts.length === 0) {
    console.log("无草稿。");
    return;
  }

  for (const d of drafts) {
    console.log(`  ${d.dirName} — ${d.meta.description} (${d.createdAt})`);
  }
  console.log(`\n共 ${drafts.length} 个草稿。`);
}

/**
 * One-step create for programmatic use (UI server calls this).
 * Allocates + commits in one shot; returns the outcome.
 */
export async function performCreate(
  storeRoot: string,
  dirName: string,
  description: string,
  origin?: { kind: "authored"; reference: string },
) {
  return createAndCommit(storeRoot, dirName, description, origin);
}
