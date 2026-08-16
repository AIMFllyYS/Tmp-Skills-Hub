import type { ClientInfo, ClientLinkRow, SkillRecord } from "./types.js";

interface ClientSwitchesProps {
  skill: SkillRecord;
  clients: ClientInfo[];
  links: ClientLinkRow[] | null;
  pending: boolean;
  onToggle: (skill: SkillRecord, clientId: string, enable: boolean) => void;
}

function labelOf(state: ClientLinkRow["state"]): string {
  if (state === "managed") return "受管链接";
  if (state === "dangling") return "悬空链接";
  if (state === "unregistered-conflict") return "落点被占用";
  return "未启用";
}

/** 单个 skill 的客户端行:开关 + 状态来源(D5)。占用/悬空不可操作。 */
export function ClientSwitches({ skill, clients, links, pending, onToggle }: ClientSwitchesProps): React.JSX.Element {
  if (clients.length === 0) {
    return <p className="px-4 pb-4 text-xs text-ink-faint">未发现客户端</p>;
  }
  return (
    <ul className="space-y-2 px-4 pb-4">
      {clients.map((client) => {
        const row = links?.find((l) => l.clientId === client.clientId);
        const state = row?.state ?? (skill.visibleIn.includes(client.clientId) ? "managed" : "off");
        const blocked = state === "unregistered-conflict" || state === "dangling";
        const enabled = state === "managed";
        return (
          <li key={client.clientId} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-ink-mid">{client.clientId}</p>
              <p className="text-xs text-ink-faint">{row?.detail ?? labelOf(state)}</p>
            </div>
            <button
              type="button"
              data-testid="client-switch"
              aria-pressed={enabled}
              disabled={pending || blocked}
              title={blocked ? (row?.detail ?? labelOf(state)) : undefined}
              onClick={() => onToggle(skill, client.clientId, !enabled)}
              className={[
                "shrink-0 rounded-full px-3 py-1 text-xs transition-colors duration-150",
                enabled ? "bg-ink-strong text-white" : "border border-line bg-white text-ink-mid hover:border-line-strong",
                pending || blocked ? "opacity-60" : "",
              ].join(" ")}
            >
              {pending ? "…" : blocked ? labelOf(state) : enabled ? "已启用" : "停用"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
