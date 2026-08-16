import type { ClientInfo, SkillRecord } from "./types.js";

interface ClientSwitchesProps {
  skill: SkillRecord;
  clients: ClientInfo[];
  pending: boolean;
  onToggle: (skill: SkillRecord, clientId: string, enable: boolean) => void;
}

/** 单个 skill 的客户端行级开关(检查器里用;不画在集合行上)。 */
export function ClientSwitches({ skill, clients, pending, onToggle }: ClientSwitchesProps): React.JSX.Element {
  if (clients.length === 0) {
    return <p className="px-4 pb-4 text-xs text-ink-faint">未发现客户端</p>;
  }
  return (
    <ul className="space-y-1.5 px-4 pb-4">
      {clients.map((client) => {
        const enabled = skill.visibleIn.includes(client.clientId);
        return (
          <li key={client.clientId} className="flex items-center justify-between">
            <span className="text-xs text-ink-mid">{client.clientId}</span>
            <button
              type="button"
              data-testid="client-switch"
              aria-pressed={enabled}
              disabled={pending}
              onClick={() => onToggle(skill, client.clientId, !enabled)}
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
  );
}
