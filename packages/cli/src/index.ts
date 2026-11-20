#!/usr/bin/env node
import path from "node:path";
import { defineCommand, runMain } from "citty";
import {
  discoverClientRoots,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { emitError, emitOk } from "./json-out.js";
import { scanKnownClients } from "./scan.js";
import { planInitialPaths, resolveConfiguredHubPaths, resolveStoreRootOrFail } from "./store-shared.js";
import { performMigrate } from "./store-migrate.js";
import { runReconcile } from "./reconcile-cmds.js";
import { conflicts } from "./conflict-cmds.js";
import { git } from "./git-cmds.js";
import { collectDoctorReport, performPrune } from "./doctor.js";
import { runGroup } from "./group-cmds.js";
import { performInit, POINTER_REL, requireWriteAuth, runAdopt, runArchive, runDisable, runEnable, runList, runShow, runVerify } from "./store-cmds.js";
import { DEFAULT_UI_PORT, startUiServer } from "./ui-server.js";
import { runAnalyze } from "./analyze.js";
import { runBootstrap } from "./bootstrap.js";
import { runBackup } from "./backup-cmds.js";
import { runReset } from "./reset-cmds.js";
import { runShare } from "./share.js";
import { runNew } from "./create-cmds.js";
import { loadEnvFile } from "./env.js";

const scan = defineCommand({
  meta: { name: "scan", description: "扫描各 Agent 全局目录,列出发现的 skill(只读,不入库)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口,默认真实 home)" },
    json: { type: "boolean", description: "机器可读输出(稳定结构,供程序消费)" },
  },
  async run({ args }) {
    const home = resolveHome(args.home);
    const resolved = await resolveConfiguredHubPaths(home);
    const storeRoot = resolved.ok ? resolved.paths : undefined;
    const roots = await discoverClientRoots(home, storeRoot !== undefined ? { storeRoot } : undefined);
    const skills = await scanKnownClients(home, storeRoot);
    if (args.json) {
      emitOk("scan", {
        home,
        roots: roots.map((r) => ({ clientId: r.clientId, skillsDir: r.skillsDir })),
        skills: skills.map((s) => ({
          hash: s.hash,
          clientId: s.clientId,
          name: s.meta.name,
          description: s.meta.description,
        })),
        total: skills.length,
      });
      return;
    }
    if (skills.length === 0) {
      console.log("未发现任何 skill。");
      return;
    }
    for (const s of skills) {
      console.log(`${s.hash.slice(0, 12)}  [${s.clientId}] ${s.meta.name} — ${s.meta.description}`);
    }
    console.log(`\n共 ${skills.length} 个(按内容哈希去重前),${roots.length} 个客户端 root。`);
  },
});

const init = defineCommand({
  meta: { name: "init", description: "设置库存位置,写入指针文件,并建立目录布局" },
  args: {
    home: { type: "string", description: "重定向 home 基座，控制与备份中心固定在其下的 .skills-hub" },
    "skills-root": { type: "string", description: "唯一真源目录的绝对路径" },
    yes: { type: "boolean", description: "非交互环境下显式授权写操作" },
    dryRun: { type: "boolean", description: "只打印将要发生的变更,不写盘" },
    json: { type: "boolean", description: "机器可读输出" },
  },
  async run({ args }) {
    // 写操作铁律(cli-commands-v0.md §2):非交互环境必须显式 --yes,否则拒绝执行
    if (!args.dryRun && !requireWriteAuth(args, "init")) return;
    const home = resolveHome(args.home);
    const requested = args["skills-root"];
    const input = requested === undefined ? undefined : { skillsRoot: requested };
    if (args.dryRun) {
      try {
        const planned = planInitialPaths(home, input);
        const existing = await resolveConfiguredHubPaths(home);
        if (!existing.ok && existing.reason === "invalid-pointer") throw new Error(existing.message);
        if (existing.ok && requested && path.relative(existing.paths.skillsRoot, planned.skillsRoot) !== "") {
          throw new Error("库存已初始化。请用 migrate 更换真源路径。");
        }
        const paths = existing.ok ? existing.paths : planned;
        const pointerFile = path.join(home, POINTER_REL);
        if (args.json) emitOk("init", { dryRun: true, ...paths, storeRoot: paths.stateRoot, pointerFile });
        else console.log("控制与备份中心: " + paths.stateRoot + "\n唯一真源目录: " + paths.skillsRoot);
      } catch (error) {
        emitError(args.json === true, "init", "bad-usage", error instanceof Error ? error.message : String(error));
      }
      return;
    }
    const res = await performInit(home, input);
    if (!res.ok) {
      emitError(args.json === true, "init", res.code, res.message);
      return;
    }
    if (args.json) {
      emitOk("init", {
        storeRoot: res.storeRoot,
        ...res.paths,
        pointerFile: res.pointerFile,
        layoutCreated: res.layoutCreated,
        builtinGroupsWrote: res.builtinGroupsWrote,
        message: "初始化完成",
      });
    } else {
      console.log("初始化完成:");
      console.log("  控制与备份中心（固定）: " + res.paths.stateRoot);
      console.log("  唯一真源目录: " + res.paths.skillsRoot);
      console.log("  指针文件: " + res.pointerFile);
      if (res.layoutCreated) console.log("  目录布局: 新建");
      else console.log("  目录布局: 已存在,未改动");
      console.log("  内置分组: " + (res.builtinGroupsWrote ? "已写入" : "已存在,未覆盖用户修改"));
    }
  },
});

const doctor = defineCommand({
  meta: { name: "doctor", description: "环境自检:库存可达性、客户端 root、链接能力、悬空链接" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    prune: { type: "boolean", description: "从台账清理悬空记录" },
    "dry-run": { type: "boolean", description: "仅报告将清理的台账条目" },
    yes: { type: "boolean", description: "显式授权写操作" },
    json: { type: "boolean", description: "机器可读输出" },
  },
  async run({ args }) {
    const home = resolveHome(args.home);
    if (args.prune) {
      if (!args["dry-run"] && !requireWriteAuth(args, "doctor")) return;
      const paths = await resolveStoreRootOrFail(args, "doctor");
      if (paths === null) return;
      const result = await performPrune(paths, args["dry-run"] === true);
      if (args.json) emitOk("doctor", { verb: "prune", ...result });
      else console.log((result.dryRun ? "将清理 " : "已清理 ") + result.count + " 条悬空记录。");
      return;
    }
    const report = await collectDoctorReport(home);

    if (args.json) {
      console.log(JSON.stringify({ ok: true, command: "doctor", ...report }, null, 2));
      return;
    }

    console.log("== 库存 ==");
    if (report.store.resolved && report.store.storeRoot !== null) {
      console.log("  位置: " + report.store.storeRoot);
      console.log(report.store.reachable ? "  可达: 是" : "  可达: 否 (" + (report.store.error ?? "未知错误") + ")");
    } else {
      console.log("  位置: 未配置 — " + (report.store.error ?? "未配置"));
    }
    console.log("== 客户端 root(" + report.roots.length + ") ==");
    for (const r of report.roots) console.log("  " + r.clientId + " → " + r.skillsDir);
    console.log("== 链接能力 ==");
    console.log("  junction: " + (report.linkTypes.junction ? "可用" : "不可用"));
    console.log("  symlink:  " + (report.linkTypes.symlink ? "可用" : "不可用"));
    console.log("  hardlink: " + (report.linkTypes.hardlink ? "可用" : "不可用"));
    console.log("== 悬空链接(" + report.danglingLinks.length + ") ==");
    for (const d of report.danglingLinks) console.log("  " + d.linkPath + " → " + d.target + " (失效)");
  },
});

const adopt = defineCommand({
  meta: { name: "adopt", description: "把本地 skill 目录收录进库存(写操作,非交互需 --yes)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    yes: { type: "boolean", description: "非交互环境下显式授权写操作" },
    dryRun: { type: "boolean", description: "预演:只打印将要发生的变更,不写盘" },
    json: { type: "boolean", description: "机器可读输出" },
  },
  run({ args }) {
    return runAdopt(args);
  },
});

const list = defineCommand({
  meta: { name: "list", description: "列出库存中的 skill(支持来源/启用状态过滤)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    json: { type: "boolean", description: "机器可读输出" },
    source: { type: "string", description: "按来源过滤(kind 精确或 reference 包含)" },
    enabled: { type: "boolean", description: "只列已启用的 skill" },
  },
  run({ args }) {
    return runList(args);
  },
});

const show = defineCommand({
  meta: { name: "show", description: "查看单个 skill 的元信息与完整描述" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    json: { type: "boolean", description: "机器可读输出" },
  },
  run({ args }) {
    return runShow(args);
  },
});

const verify = defineCommand({
  meta: { name: "verify", description: "重算哈希,报告被外部修改(漂移)或缺失的 skill,不自动改写" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    accept: { type: "boolean", description: "接受已确认的外部编辑并刷新台账" },
    "dry-run": { type: "boolean", description: "预览漂移处理结果" },
    yes: { type: "boolean", description: "显式授权写操作" },
    json: { type: "boolean", description: "机器可读输出" },
  },
  run({ args }) {
    return runVerify({ ...args, dryRun: args["dry-run"] });
  },
});

const enable = defineCommand({
  meta: { name: "enable", description: "建立链接,让指定 skill 对客户端可见(写操作,非交互需 --yes;未指定 --client 时报错并列出可用客户端,默认挂全局侧)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    yes: { type: "boolean", description: "非交互环境下显式授权写操作" },
    dryRun: { type: "boolean", description: "预演:只打印将要发生的变更,不写盘" },
    json: { type: "boolean", description: "机器可读输出" },
    client: { type: "string", description: "目标客户端 id(必填;不填则报错并列出可用客户端)" },
    scope: { type: "string", description: "global(默认,home 下)或 project(cwd 下)" },
    group: { type: "string", description: "按分组批量操作(--group <id>,与按名互斥;一次原子集合切换)" },
  },
  run({ args }) {
    return runEnable(args);
  },
});

const disable = defineCommand({
  meta: { name: "disable", description: "移除链接,让 skill 对客户端不可见(原件保留;写操作,非交互需 --yes;未指定 --client 时报错并列出可用客户端,默认挂全局侧)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    yes: { type: "boolean", description: "非交互环境下显式授权写操作" },
    dryRun: { type: "boolean", description: "预演:只打印将要发生的变更,不写盘" },
    json: { type: "boolean", description: "机器可读输出" },
    client: { type: "string", description: "目标客户端 id(必填;不填则报错并列出可用客户端)" },
    scope: { type: "string", description: "global(默认,home 下)或 project(cwd 下)" },
    group: { type: "string", description: "按分组批量操作(--group <id>,与按名互斥;一次原子集合切换)" },
  },
  run({ args }) {
    return runDisable(args);
  },
});

const group = defineCommand({
  meta: { name: "group", description: "分组的增删改查:list / create <id> / rename <id> --name / delete <id> / add|remove <id> <skill...>(写操作需 --yes;删除分组不删除任何 skill)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    yes: { type: "boolean", description: "非交互环境下显式授权写操作" },
    dryRun: { type: "boolean", description: "预演:只打印将要发生的变更,不写盘" },
    json: { type: "boolean", description: "机器可读输出" },
    name: { type: "string", description: "新名称(create/rename 用)" },
    desc: { type: "string", description: "描述(create 用)" },
  },
  run({ args }) {
    return runGroup(args);
  },
});

const archive = defineCommand({
  meta: { name: "archive", description: "软删除:移出活跃区归档为 zip;archive restore <name> 从归档恢复(不恢复链接、不删 zip;无真删除;无参数时列出归档区;写操作,非交互需 --yes)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    yes: { type: "boolean", description: "非交互环境下显式授权写操作" },
    dryRun: { type: "boolean", description: "预演:只打印将要发生的变更,不写盘" },
    json: { type: "boolean", description: "机器可读输出" },
  },
  run({ args }) {
    return runArchive(args);
  },
});

const analyze = defineCommand({
  meta: { name: "analyze", description: "相近/冲突分析:对照库存 description,给出相近与可能冲突的清单与理由(只读建议,不写盘;需 QINIU_API_KEY)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    json: { type: "boolean", description: "机器可读输出" },
  },
  run({ args }) {
    return runAnalyze(args);
  },
});

const ui = defineCommand({
  meta: { name: "ui", description: "启动本地查看服务(App 壳的数据源;仅绑 127.0.0.1)" },
  args: {
    port: { type: "string", description: "监听端口", default: String(DEFAULT_UI_PORT) },
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
  },
  async run({ args }) {
    const uiOpts: { port: number; home?: string } = { port: Number(args.port) };
    if (args.home !== undefined && args.home !== "") uiOpts.home = args.home;
    try {
      await startUiServer(uiOpts);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  },
});

const share = defineCommand({
  meta: { name: "share", description: "把库存 skill 推到授信仓库 skills/<name>/,返回可被 adopt 再拉回的链接(写操作,非交互需 --yes;需 GITHUB_TOKEN)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    yes: { type: "boolean", description: "非交互环境下显式授权写操作" },
    dryRun: { type: "boolean", description: "只打印将要发生的变更,不写远端" },
    json: { type: "boolean", description: "机器可读输出" },
    repo: { type: "string", description: "覆盖授信仓库(owner/repo 或 GitHub URL;默认读库存 manifest.trustedRepo)" },
  },
  run({ args }) {
    return runShare(args);
  },
});

const backup = defineCommand({
  meta: { name: "backup", description: "备份客户端 skills:默认增量(共享 blob 池复用),--full 强制新建快照;list / verify 只读" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    yes: { type: "boolean", description: "非交互环境下显式授权写操作" },
    dryRun: { type: "boolean", description: "只打印将要发生的变更,不写盘" },
    json: { type: "boolean", description: "机器可读输出" },
    full: { type: "boolean", description: "强制全量:新建快照并完整遍历(默认增量只复用已有 blob)" },
  },
  run({ args }) {
    return runBackup(args);
  },
});

const reset = defineCommand({
  meta: { name: "reset", description: "按快照还原客户端 skills,旁路旧库存,用原路径再收录并拉起面板" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    yes: { type: "boolean", description: "非交互环境下显式授权写操作" },
    dryRun: { type: "boolean", description: "只打印将要发生的变更,不写盘" },
    json: { type: "boolean", description: "机器可读输出" },
    snapshot: { type: "string", description: "快照 ID(缺省 latest)" },
    port: { type: "string", description: "完成后面板端口", default: String(DEFAULT_UI_PORT) },
  },
  async run({ args }) {
    await runReset({
      home: args.home,
      yes: args.yes === true,
      dryRun: args.dryRun === true,
      json: args.json === true,
      snapshot: args.snapshot === undefined || args.snapshot === "" ? undefined : args.snapshot,
      port: Number(args.port),
    });
  },
});

const newCmd = defineCommand({
  meta: { name: "new", description: "创建新 skill:在库存内分配目录(new <name>)、定稿(new commit <name>)、丢弃(new discard <name>)、列草稿(new list)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    json: { type: "boolean", description: "机器可读输出" },
    description: { type: "string", description: "skill 描述(allocate 时写入模板)" },
  },
  run({ args }) {
    return runNew(args);
  },
});

const bootstrap = defineCommand({
  meta: { name: "bootstrap", description: "一键初始化:备份 → 收录全部本机 skills → 自动启动面板(交互式;库存已就绪时直接启动面板)" },
  args: {
    home: { type: "string", description: "重定向 home 基座" },
    port: { type: "string", description: "面板端口", default: String(DEFAULT_UI_PORT) },
    yes: { type: "boolean", description: "非交互环境显式授权全部写操作(跳过全部确认)" },
  },
  async run({ args }) {
    const bootArgs: { port: number; yes: boolean; home?: string } = { port: Number(args.port), yes: args.yes === true };
    if (args.home !== undefined && args.home !== "") bootArgs.home = args.home;
    await runBootstrap(bootArgs);
  },
});

const migrate = defineCommand({
  meta: { name: "migrate", description: "校验并迁移唯一真源，原目录旁路留底" },
  args: {
    home: { type: "string", description: "重定向 home 基座" },
    to: { type: "string", description: "目标绝对路径" },
    yes: { type: "boolean", description: "显式授权写操作" },
    "dry-run": { type: "boolean", description: "仅预览迁移计划" },
    json: { type: "boolean", description: "机器可读输出" },
  },
  async run({ args }) {
    if (!args["dry-run"] && !requireWriteAuth(args, "migrate")) return;
    if (!args.to) {
      emitError(args.json === true, "migrate", "bad-usage", "用法: skills-hub migrate --to <absPath>");
      return;
    }
    const paths = await resolveStoreRootOrFail(args, "migrate");
    if (paths === null) return;
    try {
      const result = await performMigrate({
        home: resolveHome(args.home), paths, targetSkillsRoot: args.to, dryRun: args["dry-run"] === true,
      });
      if (!result.ok) {
        emitError(args.json === true, "migrate", result.code, result.message);
        return;
      }
      const { dryRun, paths: next, movedLinks, skills, aside } = result;
      if (args.json) emitOk("migrate", { dryRun, ...next, movedLinks, skills, aside });
      else console.log((dryRun ? "将迁移到 " : "已迁移到 ") + next.skillsRoot + (aside === null ? "" : "\n原目录保留在 " + aside));
    } catch (error) {
      emitError(args.json === true, "migrate", "io-error", error instanceof Error ? error.message : String(error));
    }
  },
});

const reconcile = defineCommand({
  meta: { name: "reconcile", description: "备份并接管客户端技能，收敛为指向真源的软链接" },
  args: {
    home: { type: "string", description: "重定向 home 基座" },
    yes: { type: "boolean", description: "授权接管和建链" },
    json: { type: "boolean", description: "机器可读输出" },
    "dry-run": { type: "boolean", description: "仅预演" },
    "include-external-links": { type: "boolean", description: "同时接管外部链接，保留外部目标" },
  },
  run({ args }) {
    return runReconcile({ home: args.home, yes: args.yes, json: args.json,
      dryRun: args["dry-run"] === true, includeExternalLinks: args["include-external-links"] === true });
  },
});

const main = defineCommand({
  meta: {
    name: "skills-hub",
    description: "社团内部的 Agent Skill 共享与统一管理中心",
  },
  subCommands: { scan, init, doctor, adopt, list, show, enable, disable, group, archive, analyze, verify, backup, share, reset, new: newCmd, ui, bootstrap, migrate, reconcile, conflicts, git },
});

// 启动时把 .env 载入进程环境(密钥等配置只从环境变量读取;缺失静默)。
// ESM 顶层 await:先完成加载再启动命令解析,避免竞态。
await loadEnvFile();

runMain(main);
