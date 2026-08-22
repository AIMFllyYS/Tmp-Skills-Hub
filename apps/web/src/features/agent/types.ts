/** Agent 前端类型(agent-v0.md §5 wire 形状 + 渲染条目)。 */

export interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface WireMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: WireToolCall[];
  tool_call_id?: string;
}

export interface AgentModel {
  id: string;
  label: string;
  note: string;
}

/** 消息区渲染条目:wire 是发给服务端的,entries 是给人看的。 */
export type ChatEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | {
      kind: "tool";
      callId: string;
      name: string;
      args: string;
      status: "running" | "ok" | "error";
      output: string;
      durationMs: number | null;
    }
  | { kind: "error"; text: string };
