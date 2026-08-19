import { useState } from "react";
import { getAction } from "../actions/registry.js";
import { formatBatchResult } from "../skills/batch-links.js";
import type { AdoptResponse } from "../skills/types.js";

interface AdoptFormProps {
  clientIds?: string[];
  onDone: () => void;
  onNotice?: (text: string) => void;
}

/** 集合列顶部的收录入口:粘贴路径或链接,不浏览目录。 */
export function AdoptForm({ clientIds = [], onDone, onNotice }: AdoptFormProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [enableAll, setEnableAll] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const adopt = getAction("adopt");

  const submit = async (): Promise<void> => {
    const trimmed = source.trim();
    if (trimmed === "") return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const report: AdoptResponse = await adopt.execute({ source: trimmed });
      let extra = "";
      const hashes = report.outcomes
        .map((o) => o.hash ?? o.existingHash)
        .filter((h): h is string => typeof h === "string" && h !== "");
      if (enableAll && hashes.length > 0 && clientIds.length > 0) {
        const linked = await getAction("apply-clean-links").execute({
          hashes,
          clientIds,
          action: "enable",
        });
        extra = "。 " + formatBatchResult("enable", linked.created.length, linked.removed.length, linked.skipped);
        onNotice?.(formatBatchResult("enable", linked.created.length, linked.removed.length, linked.skipped));
      }
      setResult(
        "新增 " + String(report.adopted) + " / 重复 " + String(report.duplicates) +
          " / 冲突 " + String(report.conflicts) + " / 未达标 " + String(report.invalid) + extra,
      );
      if (report.adopted > 0 || report.duplicates > 0) onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 border-b border-line px-4 py-2">
      <button
        type="button"
        data-testid="adopt-open"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong"
      >
        {adopt.verb}
      </button>
      {open && (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            data-testid="adopt-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="本地路径 / GitHub / skills.sh 链接"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong placeholder:text-ink-faint"
          />
          <label className="flex items-center gap-2 text-xs text-ink-mid">
            <input
              type="checkbox"
              data-testid="adopt-enable-all"
              checked={enableAll}
              onChange={(e) => setEnableAll(e.target.checked)}
            />
            同时启用到全部已发现应用
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              data-testid="adopt-submit"
              disabled={busy || source.trim() === ""}
              className="rounded-full bg-ink-strong px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {busy ? "收录中…" : adopt.verb}
            </button>
            {result !== null && <p className="text-xs text-ink-mid">{result}</p>}
            {error !== null && <p className="text-xs text-red-700">{error}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
