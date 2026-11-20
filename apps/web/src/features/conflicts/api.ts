import { apiRequest } from "@/lib/api-client";
import type { ConflictDiffData, ConflictRecordView } from "./types.js";

export type ConflictDecision =
  | { mode: "pick"; winnerVariantId: string }
  | { mode: "split"; variantId: string; newName: string };

export async function fetchConflicts(signal: AbortSignal): Promise<ConflictRecordView[]> {
  const response = await apiRequest<{ ok: true; conflicts: ConflictRecordView[] }>("/api/conflicts", { signal });
  return response.conflicts;
}

function conflictPath(skillName: string): string {
  return "/api/conflicts/" + encodeURIComponent(skillName);
}

export function fetchConflictDiff(skillName: string, variantId: string, signal: AbortSignal): Promise<ConflictDiffData> {
  const query = new URLSearchParams({ a: "active", b: variantId });
  return apiRequest<ConflictDiffData & { ok: true }>(conflictPath(skillName) + "/diff?" + query.toString(), { signal });
}

export async function submitConflictDecision(skillName: string, decision: ConflictDecision): Promise<void> {
  await apiRequest<{ ok: true }>(conflictPath(skillName) + "/resolve", { method: "POST", body: decision });
}
