import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  const [error, setError] = useState<string | null>(null);
  const create = getAction("create");

  const submit = async (): Promise<void> => {
    const name = dirName.trim();
    const desc = description.trim();
    if (name === "" || desc === "") return;
    setBusy(true);
    setError(null);
    try {
      const res = await create.execute({ dirName: name, description: desc });
      const hash = res.hash;
      let extra = "";
      if (enableAll && hash !== undefined && hash !== "" && clientIds.length > 0) {
        const linked = await getAction("apply-clean-links").execute({
          hashes: [hash],
          clientIds,
          action: "enable",
        });
        extra = "。 " + formatBatchResult("enable", linked.created.length, linked.removed.length, linked.skipped);
      }
      onNotice?.("已创建: " + name + extra);
      setDirName("");
      setDescription("");
      onDone();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" data-testid="create-open" onClick={() => setOpen(true)}>
        {create.verb}
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
        <DialogContent>
          <DialogTitle>{create.verb}</DialogTitle>
          <DialogDescription>英文名会变成目录名。描述写入 SKILL.md。</DialogDescription>
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Input
              data-testid="create-name"
              value={dirName}
              onChange={(e) => setDirName(e.target.value)}
              placeholder="skill 名（英文,作为目录名）"
            />
            <Input
              data-testid="create-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述（SKILL.md 的 description）"
            />
            <label className="flex items-center gap-2 text-xs text-ink-mid">
              <Checkbox
                data-testid="create-enable-all"
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
              <Button
                type="submit"
                data-testid="create-submit"
                disabled={busy || dirName.trim() === "" || description.trim() === ""}
              >
                {busy ? "创建中…" : create.verb}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
