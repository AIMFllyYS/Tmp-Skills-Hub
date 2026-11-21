import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { applyReconcile, previewReconcile, scanReconcile } from "./api.js";
import {
  hasReconcileActionableItems,
  type ReconcileExternalLinkItem,
  type ReconcilePreviewData,
  type ReconcileScanSummary,
} from "./types.js";

export function useReconcile(storeRoot: string | null, refresh: () => void, openConflicts: () => void) {
  const [summary, setSummary] = useState<ReconcileScanSummary | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ReconcilePreviewData | null>(null);
  const [externalLinks, setExternalLinks] = useState<readonly ReconcileExternalLinkItem[]>([]);
  const [includeExternalLinks, setIncludeExternalLinks] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastStore = useRef<string | null>(null);
  const scanRequest = useRef<Promise<ReconcileScanSummary> | null>(null);
  const previewRequest = useRef<AbortController | null>(null);

  const scan = useCallback(async () => {
    if (scanRequest.current !== null) return scanRequest.current;
    const request = scanReconcile();
    scanRequest.current = request;
    setScanning(true);
    setScanError(null);
    try {
      const result = await request;
      if (request === scanRequest.current) {
        setSummary(result);
        setDismissed(false);
      }
      return result;
    } catch (error) {
      if (request === scanRequest.current) setScanError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (request === scanRequest.current) {
        scanRequest.current = null;
        setScanning(false);
      }
    }
  }, []);

  useEffect(() => {
    if (lastStore.current === storeRoot) return;
    lastStore.current = storeRoot;
    scanRequest.current = null;
    setSummary(null);
    setScanning(false);
    if (storeRoot !== null) void Promise.resolve().then(() => {
      if (lastStore.current === storeRoot) return scan();
    }).catch(() => undefined);
  }, [scan, storeRoot]);

  useEffect(() => () => previewRequest.current?.abort(), []);

  const loadPreview = useCallback(async (include: boolean, closeOnError = false) => {
    previewRequest.current?.abort();
    const request = new AbortController();
    previewRequest.current = request;
    setLoading(true);
    try {
      const plan = await previewReconcile(include, request.signal);
      if (request.signal.aborted) return;
      setPreview(plan);
      setIncludeExternalLinks(include);
      if (!include) setExternalLinks(plan.skippedExternalLinks);
    } catch (error) {
      if (!request.signal.aborted) {
        toast.error(error instanceof Error ? error.message : String(error));
        if (closeOnError) setOpen(false);
      }
    } finally {
      if (previewRequest.current === request) setLoading(false);
    }
  }, []);

  const showPreview = useCallback(() => {
    setPreview(null);
    setIncludeExternalLinks(false);
    setExternalLinks([]);
    setOpen(true);
    void loadPreview(false, true);
  }, [loadPreview]);

  const rescan = async () => {
    const result = await scan();
    const needsAttention: boolean = hasReconcileActionableItems(result);
    if (needsAttention) return;
    if (result.externalSymlinks > 0) {
      toast("扫描完成，发现外部托管软链接", { action: { label: "查看接管预览", onClick: showPreview } });
    } else {
      toast.success("扫描完成，暂无待接管技能");
    }
  };

  const apply = async () => {
    const result = await applyReconcile(includeExternalLinks);
    scanRequest.current = null;
    setScanning(false);
    setOpen(false);
    refresh();
    const failures = result.failures ?? [];
    if (failures.length === 0) setSummary(null);
    const action = result.conflictCount > 0 ? { label: "处理冲突", onClick: openConflicts } : undefined;
    const options = action === undefined ? {} : { action };
    if (failures.length > 0) {
      const failure = failures[0]!;
      toast.error(String(failures.length) + " 项接管失败", {
        ...options, description: failure.skillName + " · " + failure.reason,
      });
    } else {
      toast.success("已验证备份并切换 " + String(result.linksCreated) + " 条软链接", options);
    }
  };

  return {
    summary, scanning, scanError, rescan, dismissed, dismiss: () => setDismissed(true), showPreview,
    dialog: {
      open, preview, loading, includeExternalLinks, externalLinks, onApply: apply,
      onIncludeExternalLinksChange: (include: boolean) => void loadPreview(include),
      onOpenChange: (next: boolean) => {
        if (!next) previewRequest.current?.abort();
        setOpen(next);
      },
    },
  };
}
