/**
 * Agent 页:页头模型 + 写策略 + 消息区流式渲染 + 输入区。
 */

import { useEffect, useRef, useState } from "react";
import { isToolUIPart, type UIMessage } from "ai";
import { ArrowUp, MessagesSquare, Plus, Square, X, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { acceptedFiles, attachmentLimit, readAttachment, type Attachment } from "./attachments.js";
import { firstThread } from "./threads.js";
import { renderMarkdown } from "@/lib/markdown";
import { fetchAgentModels } from "./api.js";
import { ToolCallCard } from "./ToolCallCard.js";
import type { AgentModel, WritePolicy } from "./types.js";
import { useAgentChat } from "./useAgentChat.js";

const SUGGESTIONS = ["扫描一下我本机有哪些 skill", "列出库存,告诉我哪些还没启用", "帮我分析库存里哪些 skill 可能冲突"];

function conversationTitle(message: UIMessage | undefined): string {
  if (!message) return "";
  const first = message.parts.find(part => part.type === "text" || part.type === "file");
  if (first?.type === "text") return first.text.trim().split("\n")[0]?.slice(0, 80) ?? "";
  return first?.filename ?? "图片对话";
}

export function AgentPage({ onMutated, initialPrompt, threadId = firstThread, onTitle, aiRevision = 0 }: {
  threadId?: string;
  onTitle?: (id: string, title: string) => void;
  aiRevision?: number;
  onMutated?: () => void;
  initialPrompt?: string | undefined;
}): React.JSX.Element {
  const {
    messages,
    busy,
    errorText,
    model,
    setModel,
    writePolicy,
    setWritePolicy,
    applyModelDefault,
    send,
    stop,
    approve,
    deny,
  } = useAgentChat({ threadId, onMutated, initialWritePolicy: initialPrompt === undefined ? undefined : "ask" });
  const [models, setModels] = useState<AgentModel[]>([]);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const firstMessage = messages.find(message => message.role === "user");
  const title = conversationTitle(firstMessage);
  useEffect(() => { if (title) onTitle?.(threadId, title); }, [title, onTitle, threadId]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialPrompt !== undefined) inputRef.current?.focus();
  }, [initialPrompt]);

  useEffect(() => {
    let cancelled = false;
    void fetchAgentModels()
      .then((res) => {
        if (cancelled) return;
        setModels(res.models);
        applyModelDefault(
          res.defaultModel,
          res.models.map((m) => m.id),
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) toast.error("模型列表加载失败: " + (e instanceof Error ? e.message : String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [aiRevision, applyModelDefault]);

  useEffect(() => {
    if (errorText !== null && errorText !== lastErrorRef.current) {
      toast.error(errorText);
    }
    lastErrorRef.current = errorText;
  }, [errorText]);

  useEffect(() => {
    const el = scrollViewportRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = (): void => {
    if (reading || !send(input, attachments)) return;
    setInput(""); setAttachments([]);
  };

  const onPolicyChange = (next: WritePolicy): void => {
    setWritePolicy(next);
    if (next === "allow") toast.message("写操作将不再逐条确认");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-3">
        <MessagesSquare size={16} className="text-ink-mid" />
        <h1 className="truncate text-sm font-medium">{title || "新对话"}</h1>
      </header>
      <ScrollArea viewportRef={scrollViewportRef} className="min-h-0 flex-1">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col space-y-5 px-4 py-5 sm:px-7">
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
              <MessagesSquare className="size-7 text-ink-mid" /><h2 className="text-xl font-semibold">想处理哪些技能？</h2>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} type="button" variant="outline" size="sm" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className="space-y-2">
              {message.role === "user" ? (
                <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-xl bg-surface px-4 py-2 text-sm text-ink-strong">
                  {message.parts.map((part, i) => part.type === "file" && part.url.startsWith("data:image/") ? <img key={i} src={part.url} alt={part.filename ?? "图片附件"} className="my-2 max-h-40 rounded-lg" /> : part.type === "text" && part.text.startsWith("附件 · ") ? <details key={i} className="mt-1"><summary className="cursor-pointer">{part.text.split("\n")[0]}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{part.text.slice(part.text.indexOf("\n") + 1)}</pre></details> : part.type === "text" ? <span key={i}>{part.text}</span> : null)}
                </div>
              ) : (
                message.parts.map((part, i) =>
                  part.type === "text" ? (
                    <div
                      key={message.id + "-t-" + String(i)}
                      className="skill-md max-w-full text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text) }}
                    />
                  ) : isToolUIPart(part) ? (
                    <ToolCallCard key={part.toolCallId} part={part} onApprove={approve} onDeny={deny} />
                  ) : null,
                )
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="mx-auto w-full max-w-4xl shrink-0 px-3 pb-4 pt-2 sm:px-6">
        {errorText && <p role="alert" className="mb-2 text-xs text-red-700">{errorText}</p>}
        <div className="rounded-2xl border border-line bg-white px-3 pb-2 pt-3 shadow-[var(--shadow-card)] focus-within:border-line-strong">
          {attachments.length > 0 && <ul className="mb-2 flex flex-wrap gap-2">{attachments.map(item =>
            <li key={item.id} className="flex max-w-full items-center gap-1 rounded-lg bg-surface px-2 py-1 text-xs"><Paperclip size={12}/><span className="truncate">{item.name}</span><button aria-label={"移除 " + item.name} onClick={() => setAttachments(old => old.filter(a => a.id !== item.id))}><X size={13}/></button></li>
          )}</ul>}
          <textarea ref={inputRef} data-testid="agent-input" rows={2} value={input} aria-label="消息"
            placeholder="给 Agent 发消息…" onChange={ev => setInput(ev.target.value)}
            onKeyDown={ev => { if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing && ev.nativeEvent.keyCode !== 229) { ev.preventDefault(); submit(); } }}
            className="block max-h-36 min-h-14 w-full resize-none bg-transparent px-1 text-sm leading-relaxed outline-none [field-sizing:content]" />
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <input ref={fileInput} type="file" multiple hidden accept={acceptedFiles} onChange={async ev => {
              const files = Array.from(ev.target.files ?? []); ev.target.value = "";
              if (!files.length) return;
              if (files.reduce((n, f) => n + f.size, 0) + attachments.reduce((n, a) => n + a.bytes, 0) > attachmentLimit) { toast.error("单次附件总大小上限为 768 KB。"); return; }
              setReading(true);
              try { const items = await Promise.all(files.map(readAttachment)); setAttachments(old => [...old, ...items]); }
              catch (e) { toast.error(e instanceof Error ? e.message : "附件读取失败"); }
              finally { setReading(false); }
            }} />
            <Button variant="ghost" size="sm" className="size-8 rounded-full p-0" aria-label="添加附件" title="添加文本或图片" disabled={reading || busy} onClick={() => fileInput.current?.click()}><Plus size={18}/></Button>
            <NativeSelect aria-label="写策略" value={writePolicy} onChange={e => onPolicyChange(e.target.value === "allow" ? "allow" : "ask")} className="h-8 w-auto max-w-36 border-0 bg-transparent text-xs shadow-none">
              <option value="ask">修改前询问</option><option value="allow">允许修改</option>
            </NativeSelect>
            <div className="ml-auto flex min-w-0 items-center gap-1">
              <NativeSelect aria-label="模型" value={model} disabled={busy} onChange={e => setModel(e.target.value)} className="h-8 w-auto max-w-36 border-0 bg-transparent text-xs shadow-none sm:max-w-52">
                {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </NativeSelect>
              {busy ? <Button aria-label="停止生成" title="停止生成" className="size-8 rounded-full p-0" onClick={stop}><Square size={13}/></Button>
                : <Button aria-label="发送" title="发送" data-testid="agent-send" disabled={reading || (!input.trim() && !attachments.length)} className="size-8 rounded-full p-0" onClick={submit}><ArrowUp size={16}/></Button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
