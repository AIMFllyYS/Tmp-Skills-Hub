/**
 * Agent 会话:useChat + 本机 /api/agent/chat。服务端无状态;
 * UIMessage[] 存 localStorage(v2,不迁旧 Wire 会话)。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import {
  collectCompletedWriteToolIds,
  parseAgentErrorMessage,
  sanitizePersistedMessages,
} from "./agent-helpers.js";
import type { WritePolicy } from "./types.js";

const agentTransport = new DefaultChatTransport({ api: "/api/agent/chat" });

const STORAGE_KEY = "skills-hub.agent.v2";
const MODEL_KEY = "skills-hub.agent.model";
const POLICY_KEY = "skills-hub.agent.writePolicy";

function loadMessages(): UIMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return sanitizePersistedMessages(parsed);
  } catch {
    return [];
  }
}

function loadStoredModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) ?? "";
  } catch {
    return "";
  }
}

function loadWritePolicy(): WritePolicy {
  try {
    return localStorage.getItem(POLICY_KEY) === "allow" ? "allow" : "ask";
  } catch {
    return "ask";
  }
}

export interface UseAgentChatOptions {
  /** 当助手写工具成功落盘(output-available)时触发目录刷新。 */
  onMutated?: (() => void) | undefined;
}

export interface UseAgentChat {
  messages: UIMessage[];
  busy: boolean;
  errorText: string | null;
  model: string;
  setModel: (model: string) => void;
  writePolicy: WritePolicy;
  setWritePolicy: (policy: WritePolicy) => void;
  applyModelDefault: (fallback: string, allowed: string[]) => void;
  send: (text: string) => void;
  stop: () => void;
  reset: () => void;
  approve: (approvalId: string) => void;
  deny: (approvalId: string) => void;
}

export function useAgentChat({ onMutated }: UseAgentChatOptions = {}): UseAgentChat {
  const [initialMessages] = useState<UIMessage[]>(loadMessages);
  const [model, setModelState] = useState<string>(loadStoredModel);
  const [writePolicy, setWritePolicyState] = useState<WritePolicy>(loadWritePolicy);
  const onMutatedRef = useRef(onMutated);
  const [seenWriteCalls] = useState<Set<string>>(() => new Set(collectCompletedWriteToolIds(initialMessages)));

  useEffect(() => {
    onMutatedRef.current = onMutated;
  }, [onMutated]);

  const {
    messages,
    sendMessage,
    stop,
    status,
    error,
    clearError,
    setMessages,
    addToolApprovalResponse,
  } = useChat({
    transport: agentTransport,
    messages: initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  useEffect(() => {
    if (status !== "ready") return;
    try {
      const cleaned = sanitizePersistedMessages(messages);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    } catch {
      // 存储满等静默
    }
  }, [messages, status]);

  useEffect(() => {
    const completed = collectCompletedWriteToolIds(messages);
    let hasNewMutation = false;
    for (const id of completed) {
      if (!seenWriteCalls.has(id)) {
        seenWriteCalls.add(id);
        hasNewMutation = true;
      }
    }
    if (hasNewMutation) onMutatedRef.current?.();
  }, [messages, seenWriteCalls]);

  const setModel = useCallback((next: string) => {
    setModelState(next);
    try {
      localStorage.setItem(MODEL_KEY, next);
    } catch {
      // 静默
    }
  }, []);

  const setWritePolicy = useCallback((next: WritePolicy) => {
    setWritePolicyState(next);
    try {
      localStorage.setItem(POLICY_KEY, next);
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

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === "" || status === "streaming" || status === "submitted") return;
      clearError();
      void sendMessage({ text: trimmed }, { body: { model, writePolicy } });
    },
    [clearError, sendMessage, status, model, writePolicy],
  );

  const reset = useCallback(() => {
    void stop();
    clearError();
    seenWriteCalls.clear();
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 静默
    }
  }, [stop, clearError, seenWriteCalls, setMessages]);

  const approve = useCallback(
    (approvalId: string) => {
      clearError();
      void addToolApprovalResponse({ id: approvalId, approved: true, options: { body: { model, writePolicy } } });
    },
    [clearError, addToolApprovalResponse, model, writePolicy],
  );

  const deny = useCallback(
    (approvalId: string) => {
      clearError();
      void addToolApprovalResponse({
        id: approvalId,
        approved: false,
        reason: "用户拒绝",
        options: { body: { model, writePolicy } },
      });
    },
    [clearError, addToolApprovalResponse, model, writePolicy],
  );

  return {
    messages,
    busy: status === "submitted" || status === "streaming",
    errorText: parseAgentErrorMessage(error),
    model,
    setModel,
    writePolicy,
    setWritePolicy,
    applyModelDefault,
    send,
    stop: () => {
      void stop();
    },
    reset,
    approve,
    deny,
  };
}
