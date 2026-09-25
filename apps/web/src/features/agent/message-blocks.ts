/**
 * 把一条助手消息的 parts 归并成呈现块(ui-design-v2 §9):
 * 连续推理合并、连续只读工具合成活动组、写工具单独成卡、计划只保留最新一版。
 */

import { getToolOrDynamicToolName, isToolUIPart, type UIMessage } from "ai";
import { readPlan, toolMeta, type PlanView } from "./tool-meta.js";

export type AnyPart = UIMessage["parts"][number];
export type ToolPart = Parameters<typeof getToolOrDynamicToolName>[0];

export type Block =
  | { kind: "reasoning"; key: string; text: string; streaming: boolean }
  | { kind: "text"; key: string; text: string; streaming: boolean }
  | { kind: "plan"; key: string; plan: PlanView }
  | { kind: "activity"; key: string; tools: ToolPart[] }
  | { kind: "write"; key: string; tool: ToolPart };

export function toolName(part: ToolPart): string {
  return getToolOrDynamicToolName(part);
}

/** 工具仍在进行:参数流式中、已就绪待执行、或已批准待执行。 */
export function toolRunning(part: ToolPart): boolean {
  return part.state === "input-streaming" || part.state === "input-available" || part.state === "approval-responded";
}

export function toolAwaitingApproval(part: ToolPart): boolean {
  return part.state === "approval-requested" && part.approval.isAutomatic !== true;
}

function partState(part: AnyPart): string | undefined {
  const s = (part as { state?: unknown }).state;
  return typeof s === "string" ? s : undefined;
}

export function buildBlocks(parts: readonly AnyPart[]): Block[] {
  const blocks: Block[] = [];
  let planBlock: Extract<Block, { kind: "plan" }> | null = null;

  parts.forEach((part, i) => {
    const key = String(i);
    if (part.type === "reasoning") {
      const streaming = partState(part) === "streaming";
      const last = blocks[blocks.length - 1];
      if (last?.kind === "reasoning") {
        last.text = [last.text, part.text].filter((t) => t.trim() !== "").join("\n\n");
        last.streaming = streaming;
        return;
      }
      if (part.text.trim() === "" && !streaming) return;
      blocks.push({ kind: "reasoning", key, text: part.text, streaming });
      return;
    }
    if (part.type === "text") {
      const streaming = partState(part) === "streaming";
      const last = blocks[blocks.length - 1];
      if (last?.kind === "text") {
        last.text += part.text;
        last.streaming = streaming;
        return;
      }
      if (part.text.trim() === "" && !streaming) return;
      blocks.push({ kind: "text", key, text: part.text, streaming });
      return;
    }
    if (!isToolUIPart(part)) return;
    const meta = toolMeta(toolName(part));
    if (meta.kind === "plan") {
      const plan = readPlan(part.state === "output-available" ? part.output : part.input);
      if (plan === null) return;
      if (planBlock === null) {
        planBlock = { kind: "plan", key, plan };
        blocks.push(planBlock);
      } else {
        planBlock.plan = plan;
      }
      return;
    }
    if (meta.kind === "write") {
      blocks.push({ kind: "write", key, tool: part });
      return;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === "activity") {
      last.tools.push(part);
      return;
    }
    blocks.push({ kind: "activity", key, tools: [part] });
  });

  return blocks;
}

/** 整条消息的纯文本(复制按钮用):只取正文。 */
export function plainTextOf(parts: readonly AnyPart[]): string {
  return parts
    .filter((p): p is Extract<AnyPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}
