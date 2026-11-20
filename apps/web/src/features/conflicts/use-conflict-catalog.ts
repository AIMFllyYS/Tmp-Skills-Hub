import { useCallback, useEffect, useRef, useState } from "react";
import { fetchConflicts } from "./api.js";
import type { ConflictRecordView } from "./types.js";

interface Result {
  root: string;
  records: ConflictRecordView[];
  error: string | null;
}

const EMPTY: readonly ConflictRecordView[] = [];

export function useConflictCatalog(storeRoot: string | null) {
  const [result, setResult] = useState<Result | null>(null);
  const request = useRef<AbortController | null>(null);
  const activeRoot = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    if (storeRoot === null || activeRoot.current !== storeRoot) return;
    request.current?.abort();
    const current = new AbortController();
    request.current = current;
    try {
      const records = await fetchConflicts(current.signal);
      if (!current.signal.aborted) setResult({ root: storeRoot, records, error: null });
    } catch (error) {
      if (current.signal.aborted) return;
      setResult((previous) => ({
        root: storeRoot, records: previous?.root === storeRoot ? previous.records : [],
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [storeRoot]);

  useEffect(() => {
    activeRoot.current = storeRoot;
    void refresh();
    return () => {
      activeRoot.current = null;
      request.current?.abort();
    };
  }, [refresh, storeRoot]);

  const current = result?.root === storeRoot ? result : null;
  return {
    records: current?.records ?? EMPTY,
    error: current?.error ?? null,
    loading: storeRoot !== null && current === null,
    refresh,
  };
}

export type ConflictCatalog = ReturnType<typeof useConflictCatalog>;
