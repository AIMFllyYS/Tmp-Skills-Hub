/**
 * Agent 会话:useChat + 本机 /api/agent/chat。服务端无状态;
 * UIMessage[] 存 localStorage(v2,不迁旧 Wire 会话)。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { firstThread, messagesKey } from "./threads.js";
import type { Attachment } from "./attachments.js";
import type { WritePolicy } from "./types.js";

const agentTransport = new DefaultChatTransport({ api: "/api/agent/chat" });

const MODEL_KEY = "skills-hub.agent.model";
const POLICY_KEY = "skills-hub.agent.writePolicy";

function loadMessages(threadId: string): UIMessage[] {
  try {
    const raw = localStorage.getItem(messagesKey(threadId));
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

function policyKey(threadId: string) { return threadId === firstThread ? POLICY_KEY : POLICY_KEY + "." + threadId; }

function loadWritePolicy(threadId: string): WritePolicy {
  try {
    return localStorage.getItem(policyKey(threadId)) === "allow" ? "allow" : "ask";
  } catch {
    return "ask";
  }
}

export interface UseAgentChatOptions {
  /** 当助手写工具成功落盘(output-available)时触发目录刷新。 */
  onMutated?: (() => void) | undefined;
  threadId?: string;
  initialWritePolicy?: WritePolicy | undefined;
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
  send: (text: string, attachments?: Attachment[]) => boolean;
  stop: () => void;
  approve: (approvalId: string) => void;
  deny: (approvalId: string) => void;
}

export function useAgentChat({ onMutated, initialWritePolicy, threadId = firstThread }: UseAgentChatOptions = {}): UseAgentChat {
  const [initialMessages] = useState<UIMessage[]>(() => loadMessages(threadId));
  const [model, setModelState] = useState<string>(loadStoredModel);
  const [writePolicy, setWritePolicyState] = useState<WritePolicy>(() => initialWritePolicy ?? loadWritePolicy(threadId));
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
    addToolApprovalResponse,
  } = useChat({
    transport: agentTransport,
    messages: initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  useEffect(() => {
    if (status === "streaming") return;
    try {
      const cleaned = sanitizePersistedMessages(messages);
      localStorage.setItem(messagesKey(threadId), JSON.stringify(cleaned));
    } catch {
      toast.error("本地空间已满，本次对话未能保存。");
    }
  }, [messages, status, threadId]);

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

  useEffect(() => () => { void stop(); }, [stop]);

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
      localStorage.setItem(policyKey(threadId), next);
    } catch {
      // 静默
    }
  }, [threadId]);

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
    (text: string, attachments: Attachment[] = []) => {
      const trimmed = text.trim();
      if ((!trimmed && !attachments.length) || status === "streaming" || status === "submitted") return false;
      const parts: UIMessage["parts"] = trimmed ? [{ type: "text", text: trimmed }] : [];
      parts.push(...attachments.map(item => item.part));
      if (new TextEncoder().encode(JSON.stringify({ messages: [...messages, { role: "user", parts }], model, writePolicy })).byteLength > 2_080_000) {
        toast.error("这段对话已接近大小上限。请新建对话，或减少附件。"); return false;
      }
      clearError();
      void sendMessage({ role: "user", parts }, { body: { model, writePolicy } });
      return true;
    },
    [clearError, sendMessage, status, model, writePolicy, messages],
  );

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
    approve,
    deny,
  };
}
