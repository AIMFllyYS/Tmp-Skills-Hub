import { getToolName, isToolUIPart, type UIMessage } from "ai";

/** 服务端 Agent 写操作工具名集合(与 packages/cli/src/agent/tools.ts WRITE_TOOL_NAMES 一致)。 */
export const AGENT_WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "enable_skills",
  "disable_skills",
  "adopt_skill",
  "archive_skill",
  "restore_archived",
  "share_skill",
  "create_draft",
  "commit_draft",
  "discard_draft",
  "write_skill_file",
  "group_create",
  "group_update",
  "group_delete",
  "group_members",
]);

/** 统一取静态/动态工具名;非工具 part 返回空串。 */
export function getAgentToolName(part: UIMessage["parts"][number]): string {
  return isToolUIPart(part) ? getToolName(part) : "";
}

/** 解析 Agent 错误对象:若是服务端 JSON 信封 { ok: false, message } 则提取人可读 .message。 */
export function parseAgentErrorMessage(error: unknown): string | null {
  if (error === undefined || error === null) return null;
  const raw = (error instanceof Error ? error.message : String(error)).trim();
  if (raw === "") return "请求失败";
  if (raw.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        const rec = parsed as { message?: unknown; error?: unknown };
        if (typeof rec.message === "string" && rec.message.trim() !== "") {
          return rec.message.trim();
        }
        if (typeof rec.error === "string" && rec.error.trim() !== "") {
          return rec.error.trim();
        }
        if (
          typeof rec.error === "object" &&
          rec.error !== null &&
          "message" in rec.error &&
          typeof (rec.error as { message?: unknown }).message === "string" &&
          (rec.error as { message: string }).message.trim() !== ""
        ) {
          return (rec.error as { message: string }).message.trim();
        }
      }
    } catch {
      // 非合法 JSON 时保留原始错误文本
    }
  }
  return raw;
}

function isPersistablePart(part: unknown): part is UIMessage["parts"][number] {
  if (typeof part !== "object" || part === null) return false;
  const typed = part as UIMessage["parts"][number];
  if (typeof (typed as { type?: unknown }).type !== "string") return false;
  if (isToolUIPart(typed) && typed.state === "input-streaming") return false;
  return true;
}

/** 过滤系统消息与半截 input-streaming 工具片段,避免刷新重载时破坏 convertToModelMessages。 */
export function sanitizePersistedMessages(raw: unknown): UIMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: UIMessage[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const msg = item as { id?: unknown; role?: unknown; parts?: unknown };
    if (typeof msg.id !== "string" || msg.id === "") continue;
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    if (!Array.isArray(msg.parts)) continue;
    const parts = msg.parts.filter(isPersistablePart);
    if (parts.length === 0) continue;
    out.push({ ...(item as UIMessage), role: msg.role, parts });
  }
  return out;
}

/** 收集所有已进入 output-available(非 preliminary)的写工具 toolCallId。 */
export function collectCompletedWriteToolIds(messages: readonly UIMessage[]): string[] {
  const ids: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (!isToolUIPart(part)) continue;
      if (part.state !== "output-available") continue;
      if ("preliminary" in part && part.preliminary === true) continue;
      if (AGENT_WRITE_TOOL_NAMES.has(getToolName(part))) {
        ids.push(part.toolCallId);
      }
    }
  }
  return ids;
}
