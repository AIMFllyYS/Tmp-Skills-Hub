/** 用户/助手/错误消息渲染(工具条目走 ToolCallCard)。 */

import { renderMarkdown } from "../../lib/markdown.js";
import type { ChatEntry } from "./types.js";

export function MessageBubble({ entry }: { entry: ChatEntry }): React.JSX.Element | null {
  if (entry.kind === "user") {
    return (
      <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-xl bg-surface px-4 py-2 text-sm text-ink-strong">
        {entry.text}
      </div>
    );
  }
  if (entry.kind === "assistant") {
    return (
      <div
        className="skill-md max-w-full text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.text) }}
      />
    );
  }
  if (entry.kind === "error") {
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{entry.text}</p>;
  }
  return null;
}
