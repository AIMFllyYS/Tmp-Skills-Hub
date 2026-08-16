import { useState } from "react";
import type { ClientInfo, SkillRecord, UsageCounters } from "./types.js";
import { SkillViewer } from "./SkillViewer.js";

interface SkillCardProps {
  skill: SkillRecord;
  clients: ClientInfo[];
  /** 调用次数(无记录时为零,不空白不报错) */
  usage: UsageCounters | undefined;
  /** 本卡片正在执行写操作(禁止重复提交) */
  pending: boolean;
  /** 最近一次操作失败的可读原因(展示在卡片内,不静默) */
  error: string | null;
  onToggle: (clientId: string, enable: boolean) => void;
}

/** 单个 skill 卡片:名称、描述、来源徽标、调用次数、每个客户端的启用开关;点击标题展开内容查看器。 */
export function SkillCard({ skill, clients, usage, pending, error, onToggle }: SkillCardProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const origins = skill.origins.map((o) => o.kind).join(" / ");
  const total = (usage?.show ?? 0) + (usage?.enable ?? 0);
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="block w-full text-left">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium text-ink-strong hover:underline">{skill.dirName}</h2>
          <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-ink-mid">{origins}</span>
        </div>
        <p className="mt-1 text-sm text-ink-mid">{skill.meta.description}</p>
        <div className="mt-2 flex items-center justify-between gap-4">
          <p className="font-mono text-xs text-ink-faint">{skill.hash.slice(0, 12)}</p>
          <p className="text-xs text-ink-mid">
            {total} 次调用 · {skill.visibleIn.length > 0 ? "可见于: " + skill.visibleIn.join(", ") : "未在客户端启用"}
          </p>
        </div>
      </button>
      {open && <SkillViewer hash={skill.hash} onClose={() => setOpen(false)} />}
      <ul className="mt-3 space-y-1.5">
        {clients.map((client) => {
          const enabled = skill.visibleIn.includes(client.clientId);
          return (
            <li key={client.clientId} className="flex items-center justify-between">
              <span className="text-xs text-ink-mid">{client.clientId}</span>
              <button
                type="button"
                aria-pressed={enabled}
                disabled={pending}
                onClick={() => onToggle(client.clientId, !enabled)}
                className={[
                  "rounded-full px-3 py-1 text-xs transition-colors duration-150",
                  enabled ? "bg-ink-strong text-white" : "border border-line bg-white text-ink-mid hover:border-line-strong",
                  pending ? "opacity-60" : "",
                ].join(" ")}
              >
                {pending ? "…" : enabled ? "已启用" : "停用"}
              </button>
            </li>
          );
        })}
      </ul>
      {error !== null && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </li>
  );
}
