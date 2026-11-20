import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { acceptDrifted, loadStoreHealth, pruneDangling } from "./store-operations-api.js";

export function useStoreMaintenance(active: boolean, storeRoot: string, onMutated: () => void) {
  const [version, refresh] = useState(0);
  const [data, setData] = useState<{
    storeRoot: string;
    health: Awaited<ReturnType<typeof loadStoreHealth>> | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!active || storeRoot === "") return;
    const request = new AbortController();
    void loadStoreHealth(request.signal).then(
      (health) => {
        if (!request.signal.aborted) setData({ storeRoot, health, error: null });
      },
      (error: unknown) => {
        if (!request.signal.aborted) {
          setData({ storeRoot, health: null, error: error instanceof Error ? error.message : String(error) });
        }
      },
    );
    return () => request.abort();
  }, [active, storeRoot, version]);

  const reload = useCallback((): void => {
    refresh((value) => value + 1);
    onMutated();
  }, [onMutated]);

  const onPruneDangling = async (): Promise<void> => {
    const result = await pruneDangling();
    toast.success("已清理 " + String(result.count) + " 条失效台账记录");
    reload();
  };

  const onAcceptDrifted = async (names: readonly string[]): Promise<void> => {
    const result = await acceptDrifted(names);
    toast.success("已同步 " + String(result.count) + " 个技能的指纹");
    if (result.missing.length > 0) toast.warning("已跳过缺失技能 " + result.missing.map((skill) => skill.name).join("、"));
    reload();
  };

  return {
    health: data?.storeRoot === storeRoot ? data.health : null,
    error: data?.storeRoot === storeRoot ? data.error : null,
    reload,
    onPruneDangling,
    onAcceptDrifted,
  };
}

export type StoreMaintenance = ReturnType<typeof useStoreMaintenance>;
