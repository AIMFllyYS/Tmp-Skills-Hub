#!/usr/bin/env node
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { defineCommand, runMain } from "citty";
import {
  discoverClientRoots,
  ensureBuiltinGroups,
  findDanglingLinks,
  initializeStoreLayout,
  probeLinkTypes,
  readStoreIndex,
  resolveStoreRoot,
  type StoreRootOptions,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { scanKnownClients } from "./scan.js";
import { runGroup } from "./group-cmds.js";
import { POINTER_REL, requireWriteAuth, runAdopt, runArchive, runDisable, runEnable, runList, runShow, runVerify } from "./store-cmds.js";
import { DEFAULT_UI_PORT, startUiServer } from "./ui-server.js";
import { runAnalyze } from "./analyze.js";
import { runBootstrap } from "./bootstrap.js";
import { loadEnvFile } from "./env.js";

/** 写入指针文件(home 下),先建目录再原子写。 */
async function writePointerFile(home: string, storeRoot: string): Promise<string> {
  const pointerFile = path.join(home, POINTER_REL);
  await mkdir(path.dirname(pointerFile), { recursive: true });
  const tmp = pointerFile + ".tmp-" + process.pid + "-" + Date.now();
  await writeFile(tmp, JSON.stringify({ storeRoot }, null, 2) + "\n", "utf8");
  await rename(tmp, pointerFile);
  return pointerFile;
}

const scan = defineCommand({
  meta: { name: "scan", description: "扫描各 Agent 全局目录,列出发现的 skill(只读,不入库)" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口,默认真实 home)" },
    json: { type: "boolean", description: "机器可读输出(稳定结构,供程序消费)" },
  },
  async run({ args }) {
    const home = resolveHome(args.home);
    const roots = await discoverClientRoots(home);
    const skills = await scanKnownClients(home);
    if (args.json) {
      console.log(
        JSON.stringify({
          home,
          roots: roots.map((r) => ({ clientId: r.clientId, skillsDir: r.skillsDir })),
          skills: skills.map((s) => ({
            hash: s.hash,
            clientId: s.clientId,
            name: s.meta.name,
            description: s.meta.description,
          })),
          total: skills.length,
        }, null, 2),
      );
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
    home: { type: "string", description: "库存根目录,同时作为 home 基座(指针文件写入 <home>/.skills-hub/config.json;后续命令需传相同 --home 或设 SKILLS_HUB_HOME)" },
    yes: { type: "boolean", description: "非交互环境下显式授权写操作" },
    dryRun: { type: "boolean", description: "只打印将要发生的变更,不写盘" },
    json: { type: "boolean", description: "机器可读输出" },
  },
  async run({ args }) {
    // 写操作铁律(cli-commands-v0.md §2):非交互环境必须显式 --yes,否则拒绝执行
    if (!args.dryRun && !requireWriteAuth(args, "init")) return;
    const storeRoot = await resolveStoreRootForInit(args);
    if (storeRoot === null) return;
    const home = resolveHome(args.home);
    const pointerFile = path.join(home, POINTER_REL);
    const plan = { storeRoot, pointerFile };
    if (args.dryRun) {
      if (args.json) {
        console.log(JSON.stringify({ dryRun: true, ...plan }, null, 2));
      } else {
        console.log("将要写入:");
        console.log("  指针文件: " + pointerFile);
        console.log("  库存根目录: " + storeRoot + " (目录布局: skills/ archive/ tmp/ + 清单文件)");
      }
      return;
    }
    const layout = await initializeStoreLayout(storeRoot);
    const groups = await ensureBuiltinGroups(storeRoot); // #25:内置分组,仅占位/缺失时写入
    const pointerWritten = await writePointerFile(home, storeRoot);
    if (args.json) {
      console.log(
        JSON.stringify({
          ok: true,
          command: "init",
          storeRoot,
          pointerFile: pointerWritten,
          layoutCreated: layout.created,
          builtinGroupsWrote: groups.wrote,
          message: "初始化完成",
        }, null, 2),
      );
    } else {
      console.log("初始化完成:");
      console.log("  库存根目录: " + storeRoot);
      console.log("  指针文件: " + pointerWritten);
      if (layout.created) console.log("  目录布局: 新建");
      else console.log("  目录布局: 已存在,未改动");
      console.log("  内置分组: " + (groups.wrote ? "已写入" : "已存在,未覆盖用户修改"));
    }
  },
});

/** 解析 init 的库存位置:--home → SKILLS_HUB_HOME → 交互提示 → 报错。写操作需 --yes 或 TTY。 */
async function resolveStoreRootForInit(args: { home: string | undefined; yes: boolean | undefined }): Promise<string | null> {
  let storeRoot = args.home?.trim() ?? "";
  if (storeRoot === "") storeRoot = process.env.SKILLS_HUB_HOME?.trim() ?? "";
  if (storeRoot === "" && process.stdin.isTTY && !args.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    storeRoot = (await rl.question("库存位置(绝对路径): ")).trim();
    rl.close();
  }
  if (storeRoot === "") {
    console.error("未指定库存位置。请用 --home <path> 或设置 SKILLS_HUB_HOME(写操作需 --yes 授权)。");
    process.exitCode = 2;
    return null;
  }
  if (!path.isAbsolute(storeRoot)) {
    console.error("库存根目录必须是绝对路径,收到: " + storeRoot);
    process.exitCode = 2;
    return null;
  }
  return storeRoot;
}

const doctor = defineCommand({
  meta: { name: "doctor", description: "环境自检:库存可达性、客户端 root、链接能力、悬空链接" },
  args: {
    home: { type: "string", description: "重定向 home 解析(沙箱验证与测试的唯一入口)" },
    json: { type: "boolean", description: "机器可读输出" },
  },
  async run({ args }) {
    const home = resolveHome(args.home);
    const storeOpts: StoreRootOptions = { pointerFilePath: path.join(home, POINTER_REL) };
    if (args.home !== undefined && args.home !== "") storeOpts.cliHome = args.home;
    const envHome = process.env.SKILLS_HUB_HOME;
    if (envHome !== undefined && envHome !== "") storeOpts.envHome = envHome;
    const store = await resolveStoreRoot(storeOpts);
    let reachable = false;
    let storeError: string | null = null;
    if (store.ok) {
      try {
        await readStoreIndex(store.storeRoot);
        reachable = true;
      } catch (e) {
        storeError = e instanceof Error ? e.message : String(e);
      }
    }
    const roots = await discoverClientRoots(home);
    const probeDir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-linkprobe-"));
    const linkTypes = await probeLinkTypes(probeDir);
    await rm(probeDir, { recursive: true, force: true });
    const dangling = await findDanglingLinks(roots.map((r) => r.skillsDir));

    if (args.json) {
      console.log(
        JSON.stringify({
          ok: true,
          command: "doctor",
          store: {
            resolved: store.ok,
            storeRoot: store.ok ? store.storeRoot : null,
            reachable,
            error: storeError,
          },
          roots: roots.map((r) => ({ clientId: r.clientId, skillsDir: r.skillsDir })),
          linkTypes,
          danglingLinks: dangling,
        }, null, 2),
      );
      return;
    }

    console.log("== 库存 ==");
    if (store.ok) {
      console.log("  位置: " + store.storeRoot + " (来源: " + store.source + ")");
      console.log(reachable ? "  可达: 是" : "  可达: 否 (" + (storeError ?? "未知错误") + ")");
    } else {
      console.log("  位置: 未配置 — " + store.message);
    }
    console.log("== 客户端 root(" + roots.length + ") ==");
    for (const r of roots) console.log("  " + r.clientId + " → " + r.skillsDir);
    console.log("== 链接能力 ==");
    console.log("  junction: " + (linkTypes.junction ? "可用" : "不可用"));
    console.log("  symlink:  " + (linkTypes.symlink ? "可用" : "不可用"));
    console.log("  hardlink: " + (linkTypes.hardlink ? "可用" : "不可用"));
    console.log("== 悬空链接(" + dangling.length + ") ==");
    for (const d of dangling) console.log("  " + d.linkPath + " → " + d.target + " (失效)");
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
    json: { type: "boolean", description: "机器可读输出" },
  },
  run({ args }) {
    return runVerify(args);
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
  meta: { name: "archive", description: "软删除:移出活跃区归档为 zip(无真删除;无参数时列出归档区;写操作,非交互需 --yes)" },
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
  meta: { name: "analyze", description: "相近/冲突分析:对照库存 description,给出相近与可能冲突的清单与理由(只读建议,不写盘;需 DEEPSEEK_API_KEY)" },
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
  run({ args }) {
    const uiOpts: { port: number; home?: string } = { port: Number(args.port) };
    if (args.home !== undefined && args.home !== "") uiOpts.home = args.home;
    void startUiServer(uiOpts);
  },
});

const bootstrap = defineCommand({
  meta: { name: "bootstrap", description: "一键初始化:备份 → 收录全部本机 skills → 自动启动面板(交互式;库存已就绪时直接启动面板)" },
  args: {
    home: { type: "string", description: "库存根目录/基座(默认 ~/.skills-hub)" },
    port: { type: "string", description: "面板端口", default: String(DEFAULT_UI_PORT) },
    yes: { type: "boolean", description: "非交互环境显式授权全部写操作(跳过全部确认)" },
  },
  async run({ args }) {
    const bootArgs: { port: number; yes: boolean; home?: string } = { port: Number(args.port), yes: args.yes === true };
    if (args.home !== undefined && args.home !== "") bootArgs.home = args.home;
    await runBootstrap(bootArgs);
  },
});

const main = defineCommand({
  meta: {
    name: "skills-hub",
    description: "社团内部的 Agent Skill 共享与统一管理中心",
  },
  subCommands: { scan, init, doctor, adopt, list, show, enable, disable, group, archive, analyze, verify, ui, bootstrap },
});

// 启动时把 .env 载入进程环境(密钥等配置只从环境变量读取;缺失静默)。
// ESM 顶层 await:先完成加载再启动命令解析,避免竞态。
await loadEnvFile();

runMain(main);
