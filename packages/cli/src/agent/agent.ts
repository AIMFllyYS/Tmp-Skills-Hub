/**
 * 面板 Agent:ToolLoopAgent + 一等工具 + 写策略(agent-v0.md)。
 */

import { stepCountIs, ToolLoopAgent, type LanguageModel } from "ai";
import { buildAgentSystemPrompt } from "./prompt.js";
import { createAgentTools, WRITE_TOOL_NAMES, type ToolEnv } from "./tools.js";

export type WritePolicy = "ask" | "allow";

export function parseWritePolicy(value: unknown): WritePolicy {
  return value === "allow" ? "allow" : "ask";
}

export interface CreateSkillsHubAgentOptions {
  model: LanguageModel;
  env: ToolEnv;
  clients: string[];
  writePolicy: WritePolicy;
  /** 本轮是否开启深度思考(已按模型能力裁剪),只影响提示词;供应商开关在 provider 层。 */
  thinking?: boolean;
}

/** 最多模型调用次数(agent-v0.md §2):计划更新也占调用,v1 的 15 不够。 */
export const AGENT_MAX_STEPS = 24;

export function createSkillsHubAgent(opts: CreateSkillsHubAgentOptions) {
  const tools = createAgentTools(opts.env);
  return new ToolLoopAgent({
    id: "skills-hub",
    model: opts.model,
    instructions: buildAgentSystemPrompt({
      storeRoot: opts.env.storeRoot ?? "(未配置)",
      clients: opts.clients,
      writePolicy: opts.writePolicy,
      thinking: opts.thinking === true,
    }),
    tools,
    stopWhen: stepCountIs(AGENT_MAX_STEPS),
    toolApproval: ({ toolCall }) => {
      if (opts.writePolicy === "allow") return "approved";
      return WRITE_TOOL_NAMES.has(String(toolCall.toolName)) ? "user-approval" : "not-applicable";
    },
  });
}
