import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getAction } from "../actions/registry.js";
import { formatBatchResult } from "../skills/batch-links.js";
import type { AdoptResponse } from "../skills/types.js";

interface AdoptFormProps {
  clientIds?: string[];
  onDone: () => void;
  onNotice?: (text: string) => void;
}

/** 收录入口:对话框一次填完,不浏览目录。 */
export function AdoptForm({ clientIds = [], onDone, onNotice }: AdoptFormProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [enableAll, setEnableAll] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const adopt = getAction("adopt");

  const submit = async (): Promise<void> => {
    const trimmed = source.trim();
    if (trimmed === "") return;
    setBusy(true);
    setError(null);
    try {
      const report: AdoptResponse = await adopt.execute({ source: trimmed });
      const hashes = report.outcomes
        .map((o) => o.hash ?? o.existingHash)
        .filter((h): h is string => typeof h === "string" && h !== "");
      let extra = "";
      if (enableAll && hashes.length > 0 && clientIds.length > 0) {
        const linked = await getAction("apply-clean-links").execute({
          hashes,
          clientIds,
          action: "enable",
        });
        extra = "。 " + formatBatchResult("enable", linked.created.length, linked.removed.length, linked.skipped);
      }
      onNotice?.(
        "新增 " + String(report.adopted) + " / 重复 " + String(report.duplicates) +
          " / 冲突 " + String(report.conflicts) + " / 未达标 " + String(report.invalid) + extra,
      );
      if (report.adopted > 0 || report.duplicates > 0) onDone();
      setSource("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" data-testid="adopt-open" onClick={() => setOpen(true)}>
        {adopt.verb}
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
        <DialogContent>
          <DialogTitle>{adopt.verb}</DialogTitle>
          <DialogDescription>粘贴本地路径、GitHub 或 skills.sh 链接。</DialogDescription>
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Input
              data-testid="adopt-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="本地路径 / GitHub / skills.sh 链接"
            />
            <label className="flex items-center gap-2 text-xs text-ink-mid">
              <Checkbox
                data-testid="adopt-enable-all"
                checked={enableAll}
                onCheckedChange={setEnableAll}
              />
              同时启用到全部已发现应用
            </label>
            {error !== null && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit" data-testid="adopt-submit" disabled={busy || source.trim() === ""}>
                {busy ? "收录中…" : adopt.verb}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
