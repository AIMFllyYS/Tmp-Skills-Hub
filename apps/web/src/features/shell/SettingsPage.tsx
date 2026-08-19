import { useState } from "react";
import { startReset } from "../skills/api.js";
import type { ClientInfo } from "../skills/types.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

interface SettingsPageProps {
  storeRoot: string;
  clients: ClientInfo[];
  latestSnapshotId: string | null;
  onResetDone: () => void;
}

/** 左下角设置:只读路径与应用,重置入口 + 确认弹窗。 */
export function SettingsPage({
  storeRoot,
  clients,
  latestSnapshotId,
  onResetDone,
}: SettingsPageProps): React.JSX.Element {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">设置</h1>
      <p className="mt-1 text-sm text-ink-mid">不常改、但要找得到的东西。</p>

      <section className="mt-8">
        <h2 className="text-base font-medium text-ink-strong">库存</h2>
        <p className="mt-2 break-all text-sm text-ink-mid">{storeRoot === "" ? "未配置" : storeRoot}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-medium text-ink-strong">已发现的应用</h2>
        {clients.length === 0 ? (
          <p className="mt-2 text-sm text-ink-mid">未发现应用。</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {clients.map((c) => (
              <li key={c.clientId} className="text-sm text-ink-mid">{c.clientId}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" data-testid="reset-panel">
        <h2 className="text-base font-medium text-ink-strong">重置</h2>
        <p className="mt-1 text-sm text-ink-mid">按备份快照回到初始化前,再自动收录。请再次确认后才会执行。</p>
        <button
          type="button"
          data-testid="reset-button"
          disabled={busy || latestSnapshotId === null}
          onClick={() => {
            setNotice(null);
            setAsk(true);
          }}
          className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:border-red-300 disabled:border-line disabled:text-ink-faint"
        >
          重置
        </button>
        {latestSnapshotId === null && <p className="mt-2 text-sm text-ink-mid">尚无备份快照,无法重置。</p>}
        {notice !== null && <p className="mt-2 text-sm text-ink-mid">{notice}</p>}
      </section>

      {ask && (
        <ConfirmDialog
          title="请再次确认"
          body="将按最近一份备份还原各应用里的 skills,并旁路旧库存后再收录。此操作不能用撤销按钮收回。"
          confirmLabel="确认重置"
          busy={busy}
          onCancel={() => setAsk(false)}
          onConfirm={() => {
            if (latestSnapshotId === null) return;
            setBusy(true);
            startReset(latestSnapshotId, "reset")
              .then((r) => {
                setNotice("已重置。重新收录 " + String(r.adopted) + " 份。");
                setAsk(false);
                onResetDone();
              })
              .catch((e: unknown) => {
                setNotice(e instanceof Error ? e.message : String(e));
                setAsk(false);
              })
              .finally(() => setBusy(false));
          }}
        />
      )}
    </div>
  );
}
