/**
 * Agent 会话:useChat + 本机 /api/agent/chat。服务端无状态;
 * UIMessage[] 存 localStorage(v2,不迁旧 Wire 会话)。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import type { AgentUIMessage, WritePolicy } from "./types.js";

const agentTransport = new DefaultChatTransport({ api: "/api/agent/chat" });

const STORAGE_KEY = "skills-hub.agent.v2";
const MODEL_KEY = "skills-hub.agent.model";
const POLICY_KEY = "skills-hub.agent.writePolicy";
const THINKING_KEY = "skills-hub.agent.thinking";

function loadMessages(): AgentUIMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AgentUIMessage[]) : [];
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

function loadThinking(): boolean {
  try {
    return localStorage.getItem(THINKING_KEY) === "1";
  } catch {
    return false;
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 存储满 / 隐私模式等静默
  }
}

function loadWritePolicy(): WritePolicy {
  try {
    return localStorage.getItem(POLICY_KEY) === "allow" ? "allow" : "ask";
  } catch {
    return "ask";
  }
}

export interface UseAgentChat {
  messages: AgentUIMessage[];
  busy: boolean;
  /** 已提交、还没收到第一段流。 */
  submitted: boolean;
  errorText: string | null;
  thinking: boolean;
  setThinking: (on: boolean) => void;
  retry: () => void;
  dismissError: () => void;
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

export function useAgentChat(): UseAgentChat {
  const [model, setModelState] = useState<string>(loadStoredModel);
  const [writePolicy, setWritePolicyState] = useState<WritePolicy>(loadWritePolicy);
  const [thinking, setThinkingState] = useState<boolean>(loadThinking);
  const { messages, sendMessage, stop, status, error, setMessages, addToolApprovalResponse, regenerate, clearError } = useChat<AgentUIMessage>({
    transport: agentTransport,
    messages: loadMessages(),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // 存储满等静默
    }
  }, [messages]);

  const setModel = useCallback((next: string) => {
    setModelState(next);
    persist(MODEL_KEY, next);
  }, []);

  const setWritePolicy = useCallback((next: WritePolicy) => {
    setWritePolicyState(next);
    persist(POLICY_KEY, next);
  }, []);

  const setThinking = useCallback((on: boolean) => {
    setThinkingState(on);
    persist(THINKING_KEY, on ? "1" : "0");
  }, []);

  const body = useMemo(() => ({ model, writePolicy, thinking }), [model, writePolicy, thinking]);

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
      void sendMessage({ text: trimmed }, { body });
    },
    [sendMessage, status, body],
  );

  const retry = useCallback(() => {
    clearError();
    void regenerate({ body });
  }, [clearError, regenerate, body]);

  const reset = useCallback(() => {
    void stop();
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 静默
    }
  }, [stop, setMessages]);

  const approve = useCallback(
    (approvalId: string) => {
      void addToolApprovalResponse({ id: approvalId, approved: true, options: { body } });
    },
    [addToolApprovalResponse, body],
  );

  const deny = useCallback(
    (approvalId: string) => {
      void addToolApprovalResponse({
        id: approvalId,
        approved: false,
        reason: "用户拒绝",
        options: { body },
      });
    },
    [addToolApprovalResponse, body],
  );

  return {
    messages,
    busy: status === "submitted" || status === "streaming",
    submitted: status === "submitted",
    errorText: error instanceof Error ? error.message : error !== undefined ? String(error) : null,
    thinking,
    setThinking,
    retry,
    dismissError: clearError,
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
