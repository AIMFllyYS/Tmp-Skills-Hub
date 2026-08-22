/**
 * Agent 会话 hook:服务端无状态,前端持有全量 wire 与渲染条目;
 * localStorage 持久化(多标签页不同步,可接受)。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { streamAgentChat } from "./api.js";
import type { ChatEntry, WireMessage } from "./types.js";

const STORAGE_KEY = "skills-hub.agent.v1";
const MODEL_KEY = "skills-hub.agent.model";

interface StoredSession {
  wire: WireMessage[];
  entries: ChatEntry[];
}

function loadSession(): StoredSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { wire: [], entries: [] };
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    const wire = Array.isArray(parsed.wire) ? (parsed.wire as WireMessage[]) : [];
    const entries = Array.isArray(parsed.entries) ? (parsed.entries as ChatEntry[]) : [];
    // 恢复时把遗留的运行中工具项标为中断
    return {
      wire,
      entries: entries.map((e) => (e.kind === "tool" && e.status === "running" ? { ...e, status: "error" as const, output: "(会话中断)" } : e)),
    };
  } catch {
    return { wire: [], entries: [] };
  }
}

function loadStoredModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) ?? "";
  } catch {
    return "";
  }
}

export interface UseAgentChat {
  entries: ChatEntry[];
  busy: boolean;
  model: string;
  setModel: (model: string) => void;
  /** 模型白名单加载完后调用:已存模型不在白名单则回落默认 */
  applyModelDefault: (fallback: string, allowed: string[]) => void;
  send: (text: string) => void;
  stop: () => void;
  reset: () => void;
}

export function useAgentChat(): UseAgentChat {
  const [session] = useState(loadSession);
  const [entries, setEntries] = useState<ChatEntry[]>(session.entries);
  const [wire, setWire] = useState<WireMessage[]>(session.wire);
  const [busy, setBusy] = useState(false);
  const [model, setModelState] = useState<string>(loadStoredModel);
  const abortRef = useRef<AbortController | null>(null);
  /** 当前流式 assistant 条目在 entries 里的索引;遇到工具调用置 null。 */
  const streamingIdx = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ wire, entries }));
    } catch {
      // 存储满等静默:会话功能不受影响
    }
  }, [wire, entries]);

  const setModel = useCallback((next: string) => {
    setModelState(next);
    try {
      localStorage.setItem(MODEL_KEY, next);
    } catch {
      // 静默
    }
  }, []);

  const applyModelDefault = useCallback((fallback: string, allowed: string[]) => {
    setModelState((prev) => {
      const next = prev !== "" && allowed.includes(prev) ? prev : fallback;
      try {
        localStorage.setItem(MODEL_KEY, next);
      } catch {
        // 静默
      }
      return next;
    });
  }, []);

  const pushError = useCallback((text: string) => {
    streamingIdx.current = null;
    setEntries((prev) => [...prev, { kind: "error", text }]);
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === "" || busy) return;
      const nextWire: WireMessage[] = [...wire, { role: "user", content: trimmed }];
      setWire(nextWire);
      setEntries((prev) => [...prev, { kind: "user", text: trimmed }]);
      setBusy(true);
      streamingIdx.current = null;
      const controller = new AbortController();
      abortRef.current = controller;
      let doneReceived = false;

      void streamAgentChat(
        { messages: nextWire, model },
        {
          delta: (d) => {
            const chunk = (JSON.parse(d) as { text: string }).text;
            setEntries((prev) => {
              const idx = streamingIdx.current;
              if (idx !== null && prev[idx]?.kind === "assistant") {
                const cur = prev[idx] as Extract<ChatEntry, { kind: "assistant" }>;
                const next = [...prev];
                next[idx] = { kind: "assistant", text: cur.text + chunk };
                return next;
              }
              streamingIdx.current = prev.length;
              return [...prev, { kind: "assistant", text: chunk }];
            });
          },
          tool_call: (d) => {
            const parsed = JSON.parse(d) as { callId: string; name: string; args: string };
            streamingIdx.current = null;
            setEntries((prev) => [
              ...prev,
              { kind: "tool", callId: parsed.callId, name: parsed.name, args: parsed.args, status: "running", output: "", durationMs: null },
            ]);
          },
          tool_result: (d) => {
            const parsed = JSON.parse(d) as { callId: string; ok: boolean; output: string; durationMs: number };
            setEntries((prev) =>
              prev.map((e) =>
                e.kind === "tool" && e.callId === parsed.callId
                  ? { ...e, status: parsed.ok ? "ok" : "error", output: parsed.output, durationMs: parsed.durationMs }
                  : e,
              ),
            );
          },
          done: (d) => {
            doneReceived = true;
            const messages = (JSON.parse(d) as { messages: WireMessage[] }).messages;
            setWire(messages);
          },
          error: (d) => {
            const parsed = JSON.parse(d) as { message: string };
            setWire(nextWire); // 保留用户消息,允许重试
            pushError(parsed.message);
          },
        },
        controller.signal,
      )
        .catch((e) => {
          if (controller.signal.aborted) {
            setWire(nextWire);
            pushError("已停止");
            return;
          }
          setWire(nextWire);
          pushError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!doneReceived && controller.signal.aborted) pushError("已停止");
          streamingIdx.current = null;
          if (abortRef.current === controller) abortRef.current = null;
          setBusy(false);
        });
    },
    [wire, model, busy, pushError],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    streamingIdx.current = null;
    setEntries([]);
    setWire([]);
    setBusy(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 静默
    }
  }, []);

  return { entries, busy, model, setModel, applyModelDefault, send, stop, reset };
}
