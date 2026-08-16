import {
  addSkillToGroups,
  createGroup,
  deleteGroup,
  readGroups,
  readStoreIndex,
  removeSkillFromGroups,
  renameGroup,
} from "@skills-hub/core";
import { requireWriteAuth, resolveNames, resolveStoreRootOrFail } from "./store-cmds.js";
import { emitError, emitOk } from "./json-out.js";

/**
 * group 命令:分组的增删改查(cli-commands-v0.md §5)。
 * 分组只是视图:删除分组不删除任何 skill;写操作需 --yes;支持 --json 与 --dry-run。
 */

export interface GroupArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  name: string | undefined;
  desc: string | undefined;
  _: (string | number)[];
}

export async function runGroup(args: GroupArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "group");
  if (storeRoot === null) return;
  const verb = args._[0] === undefined ? "" : String(args._[0]);
  const rest = args._.slice(1).map(String);
  const dryRun = args.dryRun === true;

  switch (verb) {
    case "":
    case "list": {
      const g = await readGroups(storeRoot);
      if (args.json) {
        emitOk("group", { verb: "list", groups: g.groups });
        return;
      }
      if (g.groups.length === 0) {
        console.log("暂无分组。skills-hub group create <id> 新建。");
        return;
      }
      console.log("分组(" + g.groups.length + "):");
      for (const gr of g.groups) {
        console.log("  " + gr.id + "  [" + gr.memberHashes.length + "] " + (gr.name !== gr.id ? gr.name + " — " : "") + gr.description);
      }
      return;
    }
    case "create": {
      const id = rest[0] ?? "";
      if (id === "") {
        emitError(args.json === true, "group", "bad-usage", "用法: skills-hub group create <id> [--name <名称>] [--desc <描述>]");
        return;
      }
      if (!/^[a-z][a-z0-9-]*$/.test(id)) {
        emitError(args.json === true, "group", "bad-usage", "分组 id 须为小写字母开头、可含数字与连字符: " + id);
        return;
      }
      if (!dryRun && !requireWriteAuth(args, "group")) return;
      if (dryRun) {
        if (args.json) emitOk("group", { dryRun: true, verb: "create", id, name: args.name ?? id, description: args.desc ?? "" });
        else console.log("预演:将新建分组 " + id);
        return;
      }
      try {
        await createGroup(storeRoot, { id, name: args.name ?? id, description: args.desc ?? "" });
        if (args.json) emitOk("group", { verb: "create", id, name: args.name ?? id, description: args.desc ?? "" });
        else console.log("✓ 已创建分组: " + id);
      } catch (e) {
        emitError(args.json === true, "group", "group-exists", e instanceof Error ? e.message : String(e));
      }
      return;
    }
    case "rename": {
      const id = rest[0] ?? "";
      if (id === "" || args.name === undefined || args.name.trim() === "") {
        emitError(args.json === true, "group", "bad-usage", "用法: skills-hub group rename <id> --name <新名称>");
        return;
      }
      if (!dryRun && !requireWriteAuth(args, "group")) return;
      if (dryRun) {
        if (args.json) emitOk("group", { dryRun: true, verb: "rename", id, name: args.name });
        else console.log("预演:将重命名分组 " + id + " → " + args.name);
        return;
      }
      try {
        await renameGroup(storeRoot, id, args.name);
        if (args.json) emitOk("group", { verb: "rename", id, name: args.name });
        else console.log("✓ 已重命名: " + id + " → " + args.name);
      } catch (e) {
        emitError(args.json === true, "group", "group-not-found", e instanceof Error ? e.message : String(e));
      }
      return;
    }
    case "delete": {
      const id = rest[0] ?? "";
      if (id === "") {
        emitError(args.json === true, "group", "bad-usage", "用法: skills-hub group delete <id>");
        return;
      }
      if (!dryRun && !requireWriteAuth(args, "group")) return;
      if (dryRun) {
        if (args.json) emitOk("group", { dryRun: true, verb: "delete", id });
        else console.log("预演:将删除分组 " + id + "(不影响任何 skill)");
        return;
      }
      try {
        const memberCount = await deleteGroup(storeRoot, id);
        if (args.json) emitOk("group", { verb: "delete", id, memberCount });
        else console.log("✓ 已删除分组: " + id + "(成员 " + memberCount + " 个 skill 未受影响)");
      } catch (e) {
        emitError(args.json === true, "group", "group-not-found", e instanceof Error ? e.message : String(e));
      }
      return;
    }
    case "add":
    case "remove": {
      const id = rest[0] ?? "";
      const names = rest.slice(1);
      if (id === "" || names.length === 0) {
        emitError(args.json === true, "group", "bad-usage", "用法: skills-hub group " + verb + " <id> <skill名...>");
        return;
      }
      if (!dryRun && !requireWriteAuth(args, "group")) return;
      const skills = await readStoreIndex(storeRoot);
      let dirNames: string[];
      try {
        dirNames = names.flatMap((n) => resolveNames(n, skills));
      } catch (e) {
        emitError(args.json === true, "group", "not-found", e instanceof Error ? e.message : String(e));
        return;
      }
      const hashes = dirNames.map((n) => skills.find((s) => s.dirName === n)!.hash);
      if (dryRun) {
        if (args.json) emitOk("group", { dryRun: true, verb, id, dirNames, hashes });
        else console.log("预演:分组 " + id + " " + (verb === "add" ? "加入" : "移出") + ": " + dirNames.join(", "));
        return;
      }
      try {
        const changed = verb === "add" ? await addSkillToGroups(storeRoot, hashes, [id]) : await removeSkillFromGroups(storeRoot, hashes, [id]);
        if (args.json) emitOk("group", { verb, id, dirNames, hashes, changed });
        else console.log((verb === "add" ? "✓ 已加入分组 " : "✓ 已移出分组 ") + id + ": " + dirNames.join(", ") + "(" + changed + " 处变更)");
      } catch (e) {
        emitError(args.json === true, "group", "group-not-found", e instanceof Error ? e.message : String(e));
      }
      return;
    }
    default:
      emitError(args.json === true, "group", "bad-usage", "未知子命令: " + verb + "。支持: list / create / rename / delete / add / remove");
      return;
  }
}

