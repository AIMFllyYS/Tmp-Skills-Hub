import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isStoreUnconfiguredError } from "@/lib/api-client";
import { getAction } from "../actions/registry.js";
import { toggleGit } from "../git/api.js";
import { sortClientsForApps } from "../shell/apps-layout.js";
import {
  fetchArchive,
  fetchBackups,
  fetchCatalog,
  fetchClientSkillStates,
  fetchDoctor,
  fetchGroups,
  fetchStats,
} from "./api.js";
import { fileResourceKey, invalidateResource, invalidateResourcePrefix, treeResourceKey } from "./async-resource.js";
import {
  loadCatalogRefresh,
  loadPrimaryCatalog,
  patchClientStates,
  patchSkillVisibility,
  renameSkillHash,
  type CatalogLoadState,
  type PrimaryCatalogResult,
} from "./catalog.js";
import type {
  ArchivedSkill,
  ClientInfo,
  ClientSkillStatesResponse,
  DoctorResponse,
  GroupDef,
  SkillRecord,
  StatsResponse,
  UsageCounters,
} from "./types.js";

export type { CatalogLoadState };

export interface UseCatalogOptions {
  /** 应用 tab 可见时按选中应用拉行级开关。 */
  loadClientStates: boolean;
}

/** 远程目录状态与渐进水合:主壳只等 /api/skills + /api/clients,次级数据独立并行填充。 */
export function useCatalog({ loadClientStates }: UseCatalogOptions) {
  const [status, setStatus] = useState<CatalogLoadState>("loading");
  const [firstRun, setFirstRun] = useState(false);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [storeRoot, setStoreRoot] = useState("");
  const [gitEnabled, setGitEnabled] = useState(false);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [usageByHash, setUsageByHash] = useState<Map<string, UsageCounters>>(new Map());
  const [ranking, setRanking] = useState<StatsResponse["ranking"]>([]);
  const [archived, setArchived] = useState<ArchivedSkill[]>([]);
  const [doctor, setDoctor] = useState<DoctorResponse | null>(null);
  const [latestSnapshotId, setLatestSnapshotId] = useState<string | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);

  const [statsLoading, setStatsLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [focusedHash, setFocusedHash] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientStates, setClientStates] = useState<ClientSkillStatesResponse | null>(null);
  const [pendingHash, setPendingHash] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const loadGenRef = useRef(0);

  const hydrateSecondary = useCallback((gen: number): void => {
    const active = (): boolean => mountedRef.current && loadGenRef.current === gen;

    setStatsLoading(true);
    void fetchStats()
      .then((res) => {
        if (!active()) return;
        setUsageByHash(new Map(Object.entries(res.stats.counters)));
        setRanking(res.ranking);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active()) setStatsLoading(false);
      });

    setArchiveLoading(true);
    void fetchArchive()
      .then((list) => {
        if (active()) setArchived(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active()) setArchiveLoading(false);
      });

    setDoctorLoading(true);
    void fetchDoctor()
      .then((doc) => {
        if (active()) setDoctor(doc);
      })
      .catch(() => {
        if (active()) setDoctor(null);
      })
      .finally(() => {
        if (active()) setDoctorLoading(false);
      });

    setBackupsLoading(true);
    void fetchBackups()
      .then((bk) => {
        if (!active()) return;
        setLatestSnapshotId(bk.latest);
        setSnapshotCount(bk.snapshots.length);
      })
      .catch(() => {
        if (active()) return;
        setLatestSnapshotId(null);
        setSnapshotCount(0);
      })
      .finally(() => {
        if (active()) setBackupsLoading(false);
      });

    setGroupsLoading(true);
    void fetchGroups()
      .then((list) => {
        if (active()) setGroups(list);
      })
      .catch(() => {
        if (active()) setGroups([]);
      })
      .finally(() => {
        if (active()) setGroupsLoading(false);
      });
  }, []);

  const applyPrimary = useCallback(
    (primary: PrimaryCatalogResult, gen: number): void => {
      if (!mountedRef.current || loadGenRef.current !== gen) return;
      if (primary.kind === "unconfigured") {
        setStoreRoot("");
        setGitEnabled(false);
        setSkills([]);
        setClients(sortClientsForApps(primary.clients, []));
        setStatus("unconfigured");
        return;
      }
      const ordered = sortClientsForApps(primary.clients, primary.skills);
      setStoreRoot(primary.storeRoot);
      setGitEnabled(primary.gitEnabled);
      setSkills(primary.skills);
      setClients(ordered);
      setSelectedClientId((prev) => prev ?? ordered[0]?.clientId ?? null);
      setStatus("ready");
      hydrateSecondary(gen);
    },
    [hydrateSecondary],
  );

  useEffect(() => {
    mountedRef.current = true;
    const gen = ++loadGenRef.current;
    void loadPrimaryCatalog(() => { if (mountedRef.current && loadGenRef.current === gen) setFirstRun(true); })
      .then((primary) => {
        applyPrimary(primary, gen);
      })
      .catch(() => {
        if (mountedRef.current && loadGenRef.current === gen) setStatus("offline");
      });
    return () => {
      mountedRef.current = false;
      loadGenRef.current += 1;
    };
  }, [applyPrimary]);

  useEffect(() => {
    if (!loadClientStates || selectedClientId === null || status !== "ready") return;
    let cancelled = false;
    void fetchClientSkillStates(selectedClientId)
      .then((s) => {
        if (!cancelled) setClientStates(s);
      })
      .catch(() => {
        if (!cancelled) setClientStates(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadClientStates, selectedClientId, status]);

  const refresh = useCallback((): void => {
    void loadCatalogRefresh(selectedClientId)
      .then((next) => {
        if (!mountedRef.current) return;
        setStoreRoot(next.storeRoot);
        setGitEnabled(next.gitEnabled);
        setSkills(next.skills);
        setGroups(next.groups);
        if (next.clientStates !== null) setClientStates(next.clientStates);
        if (status !== "ready") {
          setStatus("ready");
          hydrateSecondary(++loadGenRef.current);
        }
      })
      .catch((e: unknown) => {
        if (isStoreUnconfiguredError(e) && status === "unconfigured") return;
        toast.error(e instanceof Error ? e.message : String(e));
      });
  }, [selectedClientId, status, hydrateSecondary]);

  const reload = useCallback((): void => {
    const gen = ++loadGenRef.current;
    void loadPrimaryCatalog()
      .then((primary) => {
        applyPrimary(primary, gen);
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : String(e));
      });
  }, [applyPrimary]);

  const initializeStore = useCallback(
    async (enableGit = false): Promise<void> => {
      toast.success("库存已初始化");
      if (enableGit) {
        try {
          await toggleGit(true);
        } catch (error) {
          toast.error("Git 版本控制开启失败", { description: error instanceof Error ? error.message : String(error) });
        }
      }
      const gen = ++loadGenRef.current;
      const primary = await loadPrimaryCatalog();
      applyPrimary(primary, gen);
    },
    [applyPrimary],
  );

  const toggle = useCallback((skill: SkillRecord, clientId: string, enable: boolean): void => {
    void (async () => {
      setPendingHash(skill.hash);
      try {
        await getAction(enable ? "enable" : "disable").execute({ hash: skill.hash, clientId });
        setSkills((prev) => patchSkillVisibility(prev, skill.hash, clientId, enable));
        setClientStates((prev) => patchClientStates(prev, skill.hash, clientId, enable));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setPendingHash(null);
      }
    })();
  }, []);

  const markSaved = useCallback((oldHash: string, newHash: string): void => {
    invalidateResource(treeResourceKey(oldHash));
    invalidateResourcePrefix(fileResourceKey(oldHash, ""));
    setSkills((prev) => renameSkillHash(prev, oldHash, newHash));
    setFocusedHash(newHash);
  }, []);

  const restore = useCallback((name: string): void => {
    void (async () => {
      try {
        await getAction("restore").execute({ name });
        setSkills((await fetchCatalog()).skills);
        setArchived(await fetchArchive());
        toast("已恢复 " + name);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const archive = useCallback((hash: string): void => {
    void (async () => {
      try {
        await getAction("archive").execute({ hash });
        setSkills((await fetchCatalog()).skills);
        setArchived(await fetchArchive());
        setFocusedHash(null);
        toast("已归档");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return {
    status,
    storeRoot,
    gitEnabled,
    setGitEnabled,
    skills,
    clients,
    groups,
    usageByHash,
    ranking,
    archived,
    doctor,
    latestSnapshotId,
    snapshotCount,
    statsLoading,
    archiveLoading,
    doctorLoading,
    backupsLoading,
    groupsLoading,
    focusedHash,
    setFocusedHash,
    selectedClientId,
    setSelectedClientId,
    clientStates,
    pendingHash,
    toggle,
    markSaved,
    refresh,
    reload,
    initializeStore,
    firstRun,
    restore,
    archive,
  };
}
