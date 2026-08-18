import { useState } from "react";
import { getAction } from "../actions/registry.js";
import { formatBatchResult } from "../skills/batch-links.js";

interface CreateFormProps {
  clientIds?: string[];
  onDone: () => void;
  onNotice?: (text: string) => void;
}

export function CreateForm({ clientIds = [], onDone, onNotice }: CreateFormProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [dirName, setDirName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [enableAll, setEnableAll] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = getAction("create");

  const submit = async (): Promise<void> => {
    const name = dirName.trim();
    const desc = description.trim();
    if (name === "" || desc === "") return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await create.execute({ dirName: name, description: desc });
      let extra = "";
      const hash = "hash" in res ? (res as { hash?: string }).hash : undefined;
      if (enableAll && hash && clientIds.length > 0) {
        const linked = await getAction("apply-clean-links").execute({
          hashes: [hash],
          clientIds,
          action: "enable",
        });
        extra = "。 " + formatBatchResult("enable", linked.created.length, linked.removed.length, linked.skipped);
        onNotice?.(formatBatchResult("enable", linked.created.length, linked.removed.length, linked.skipped));
      }
      setResult("已创建: " + name + extra);
      setDirName("");
      setDescription("");
      onDone();
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
        data-testid="create-open"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong"
      >
        {create.verb}
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
            data-testid="create-name"
            value={dirName}
            onChange={(e) => setDirName(e.target.value)}
            placeholder="skill 名（英文,作为目录名）"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong placeholder:text-ink-faint"
          />
          <input
            data-testid="create-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述（SKILL.md 的 description）"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong placeholder:text-ink-faint"
          />
          <label className="flex items-center gap-2 text-xs text-ink-mid">
            <input
              type="checkbox"
              data-testid="create-enable-all"
              checked={enableAll}
              onChange={(e) => setEnableAll(e.target.checked)}
            />
            同时启用到全部已发现应用
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              data-testid="create-submit"
              disabled={busy || dirName.trim() === "" || description.trim() === ""}
              className="rounded-full bg-ink-strong px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {busy ? "创建中…" : create.verb}
            </button>
            {result !== null && <p className="text-xs text-ink-mid">{result}</p>}
            {error !== null && <p className="text-xs text-red-700">{error}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
