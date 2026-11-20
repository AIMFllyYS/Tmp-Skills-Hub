import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SkeletonRowList } from "@/components/ui/skeleton";
import { StatusBanner } from "@/components/ui/status-banner";
import { fetchConflictDiff, submitConflictDecision, type ConflictDecision } from "./api.js";
import { ConflictsView } from "./ConflictsView.js";
import {
  selectConflictTarget,
  type ConflictAgentHandoff,
  type ConflictDiffData,
  type ConflictTarget,
} from "./types.js";
import type { ConflictCatalog } from "./use-conflict-catalog.js";

interface DiffState {
  key: string;
  data: ConflictDiffData | null;
  error: string | null;
}

export function ConflictsWorkspace({ catalog, onResolved, onAgentHandoff }: {
  catalog: ConflictCatalog;
  onResolved: () => Promise<void>;
  onAgentHandoff: (handoff: ConflictAgentHandoff) => void;
}) {
  const [selected, setSelected] = useState<ConflictTarget>({ skillName: null, variantId: null });
  const [diff, setDiff] = useState<DiffState | null>(null);
  const [diffAttempt, setDiffAttempt] = useState(0);
  const { record, variantId } = selectConflictTarget(catalog.records, selected);
  const skillName = record?.skillName ?? null;
  const diffKey = record === null || variantId === null
    ? null
    : JSON.stringify([record.skillName, record.activeHash, variantId, diffAttempt]);

  useEffect(() => {
    if (diffKey === null || skillName === null || variantId === null) return;
    const request = new AbortController();
    void fetchConflictDiff(skillName, variantId, request.signal).then(
      (data) => { if (!request.signal.aborted) setDiff({ key: diffKey, data, error: null }); },
      (error: unknown) => {
        if (!request.signal.aborted) {
          setDiff({ key: diffKey, data: null, error: error instanceof Error ? error.message : String(error) });
        }
      },
    );
    return () => request.abort();
  }, [diffKey, skillName, variantId]);

  const apply = async (name: string, decision: ConflictDecision) => {
    await submitConflictDecision(name, decision);
    await onResolved();
    toast.success(decision.mode === "split" ? "已拆分为 " + decision.newName : "已保存所选版本并归档异版");
  };

  if (catalog.loading) return <div className="p-6" aria-label="加载冲突记录"><SkeletonRowList rows={4} /></div>;
  const activeDiff = diff !== null && diff.key === diffKey ? diff : null;
  const error = catalog.error ?? activeDiff?.error ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error !== null && (
        <StatusBanner
          tone="warning"
          title={catalog.error !== null ? "冲突记录读取失败" : "差异读取失败"}
          description={error}
          action={<Button size="sm" onClick={() => {
            if (catalog.error !== null) void catalog.refresh();
            else setDiffAttempt((attempt) => attempt + 1);
          }}>重试</Button>}
        />
      )}
      <ConflictsView
        conflicts={catalog.records}
        selectedSkillName={skillName}
        selectedVariantId={variantId}
        onSelectSkill={(name) => setSelected({ skillName: name, variantId: null })}
        onSelectVariant={(id) => setSelected({ skillName, variantId: id })}
        diffFiles={activeDiff?.data?.files ?? []}
        loadingDiff={diffKey !== null && activeDiff === null}
        onKeepActive={(name) => apply(name, { mode: "pick", winnerVariantId: "active" })}
        onPromoteVariant={(name, id) => apply(name, { mode: "pick", winnerVariantId: id })}
        onSplitVariant={(name, id, newName) => apply(name, { mode: "split", variantId: id, newName })}
        onHandoffToAgent={(name, prompt) => onAgentHandoff({ skillName: name, prompt })}
      />
    </div>
  );
}
