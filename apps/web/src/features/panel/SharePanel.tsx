import { useState } from "react";
import { getAction } from "../actions/registry.js";
import type { ShareResponse } from "../skills/types.js";

/** 检查器分享:点一下才请求;成功展示可 adopt 的链接;失败只读提示。 */
export function SharePanel({ target }: { target: string }): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const share = getAction("share");

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await share.execute({ target }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        data-testid="share-run"
        disabled={busy}
        onClick={() => void run()}
        className="text-xs text-ink-mid hover:text-ink-strong hover:underline disabled:opacity-50"
      >
        {busy ? "分享中…" : share.verb}
      </button>
      {error !== null && (
        <p data-testid="share-error" className="text-xs text-red-700">{error}</p>
      )}
      {result !== null && (
        <p data-testid="share-url" className="break-all text-xs text-ink-mid">
          {result.idempotent ? "已存在: " : ""}
          {result.url}
        </p>
      )}
    </div>
  );
}
