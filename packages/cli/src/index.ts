#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { scanKnownClients } from "./scan.js";
import { DEFAULT_UI_PORT, startUiServer } from "./ui-server.js";

const scan = defineCommand({
  meta: { name: "scan", description: "扫描各 Agent 全局目录,列出发现的 skill(只读,不入库)" },
  async run() {
    const skills = await scanKnownClients();
    if (skills.length === 0) {
      console.log("未发现任何 skill。");
      return;
    }
    for (const s of skills) {
      console.log(`${s.hash.slice(0, 12)}  [${s.clientId}] ${s.meta.name} — ${s.meta.description}`);
    }
    console.log(`\n共 ${skills.length} 个(按内容哈希去重前)。`);
  },
});

const ui = defineCommand({
  meta: { name: "ui", description: "启动本地查看服务(App 壳的数据源)" },
  args: {
    port: { type: "string", description: "监听端口", default: String(DEFAULT_UI_PORT) },
  },
  run({ args }) {
    startUiServer(Number(args.port));
  },
});

const main = defineCommand({
  meta: {
    name: "skills-hub",
    description: "社团内部的 Agent Skill 共享与统一管理中心",
  },
  subCommands: { scan, ui },
});

runMain(main);
