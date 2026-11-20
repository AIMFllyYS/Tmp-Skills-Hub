import { apiRequest } from "@/lib/api-client";
import type { ReconcileApplyResult, ReconcilePreviewData, ReconcileScanSummary } from "./types.js";

export function scanReconcile(): Promise<ReconcileScanSummary> {
  return apiRequest<ReconcileScanSummary & { ok: true }>("/api/reconcile/scan");
}

export function previewReconcile(includeExternalLinks: boolean, signal: AbortSignal): Promise<ReconcilePreviewData> {
  return apiRequest<ReconcilePreviewData & { ok: true }>("/api/reconcile/preview", {
    method: "POST", body: { includeExternalLinks }, signal,
  });
}

export function applyReconcile(includeExternalLinks: boolean): Promise<ReconcileApplyResult> {
  return apiRequest<ReconcileApplyResult & { ok: true }>("/api/reconcile/apply", {
    method: "POST", body: { includeExternalLinks },
  });
}
