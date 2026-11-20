import { useEffect, useState } from "react";
import type { UnifiedDiffFile } from "@/components/ui/diff-viewer";
import { fetchCommitPatch, fetchSkillHistory } from "./api.js";
import { parseCommitPatch } from "./commit-patch.js";
import { SkillHistoryDrawer } from "./SkillHistoryDrawer.js";
import type { GitCommitEntry } from "./types.js";

type LoadResult<T> = { data: T; error?: never } | { error: string; data?: never };
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** This component mounts only on an explicit click of the history button. */
export function SkillHistory({ skillName, close }: { skillName: string; close: () => void }): React.JSX.Element {
  const [history, setHistory] = useState<LoadResult<GitCommitEntry[]> | null>(null);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<{ hash: string } | null>(null);
  const [diff, setDiff] = useState<LoadResult<UnifiedDiffFile[]> | null>(null);

  useEffect(() => {
    const request = new AbortController();
    void fetchSkillHistory(skillName, request.signal).then(
      (data) => { if (!request.signal.aborted) setHistory({ data }); },
      (error: unknown) => { if (!request.signal.aborted) setHistory({ error: message(error) }); },
    );
    return () => request.abort();
  }, [skillName, revision]);

  useEffect(() => {
    if (selected === null) return;
    const request = new AbortController();
    void fetchCommitPatch(skillName, selected.hash, request.signal)
      .then((patch) => parseCommitPatch(patch, skillName))
      .then(
        (data) => { if (!request.signal.aborted) setDiff({ data }); },
        (error: unknown) => { if (!request.signal.aborted) setDiff({ error: message(error) }); },
      );
    return () => request.abort();
  }, [selected, skillName]);

  return (
    <SkillHistoryDrawer
      open
      onOpenChange={(open) => { if (!open) close(); }}
      skillName={skillName}
      gitEnabled
      commits={history?.data ?? []}
      loading={history === null}
      historyError={history?.error}
      onRetry={() => { setHistory(null); setRevision((count) => count + 1); }}
      onSelectCommit={(hash) => {
        setDiff(null);
        setSelected(hash === null ? null : { hash });
      }}
      selectedDiffFiles={diff?.data}
      diffError={diff?.error}
    />
  );
}
