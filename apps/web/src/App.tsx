import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { getAction } from "./features/actions/registry.js";
import { OverviewPage } from "./features/shell/OverviewPage.js";
import { SettingsPage } from "./features/shell/SettingsPage.js";
import { Sidebar } from "./features/shell/Sidebar.js";
import { SkillsPage } from "./features/shell/SkillsPage.js";
import { StatsPage } from "./features/shell/StatsPage.js";
import type { AppPage, SkillsTab } from "./features/shell/page.js";
import { sortClientsForApps } from "./features/shell/apps-layout.js";
import {
  fetchArchive,
  fetchBackups,
  fetchCatalog,
  fetchClientSkillStates,
  fetchClients,
  fetchDoctor,
  fetchGroups,
  fetchStats,
} from "./features/skills/api.js";
import { fileResourceKey, invalidateResource, invalidateResourcePrefix, treeResourceKey } from "./features/skills/async-resource.js";
import type {
  ArchivedSkill,
  BackupsListResponse,
  ClientInfo,
  ClientSkillStatesResponse,
  DoctorResponse,
  GroupDef,
  SkillRecord,
  StatsResponse,
  UsageCounters,
} from "./features/skills/types.js";

type LoadState = "loading" | "ready" | "offline";

export default function App() {
  const [page, setPage] = useState<AppPage>("overview");
  const [skillsTab, setSkillsTab] = useState<SkillsTab>("apps");
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [storeRoot, setStoreRoot] = useState("");
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [usageByHash, setUsageByHash] = useState<Map<string, UsageCounters>>(new Map());
  const [ranking, setRanking] = useState<StatsResponse["ranking"]>([]);
  const [archived, setArchived] = useState<ArchivedSkill[]>([]);
  const [doctor, setDoctor] = useState<DoctorResponse | null>(null);
  const [latestSnapshotId, setLatestSnapshotId] = useState<string | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [state, setState] = useState<LoadState>("loading");
  const [focusedHash, setFocusedHash] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientStates, setClientStates] = useState<ClientSkillStatesResponse | null>(null);
  const [pendingHash, setPendingHash] = useState<string | null>(null);

  const applyCatalog = useCallback((
    catalog: { storeRoot: string; skills: SkillRecord[] },
    nextClients: ClientInfo[],
    st: StatsResponse,
    ar: ArchivedSkill[],
    doc: DoctorResponse | null,
    backups: BackupsListResponse | null,
    nextGroups: GroupDef[],
  ): void => {
    setStoreRoot(catalog.storeRoot);
    setSkills(catalog.skills);
    const ordered = sortClientsForApps(nextClients, catalog.skills);
    setClients(ordered);
    setUsageByHash(new Map(Object.entries(st.stats.counters)));
    setRanking(st.ranking);
    setArchived(ar);
    setDoctor(doc);
    setLatestSnapshotId(backups?.latest ?? null);
    setSnapshotCount(backups?.snapshots.length ?? 0);
    setGroups(nextGroups);
    setSelectedClientId((prev) => prev ?? ordered[0]?.clientId ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCatalog(),
      fetchClients(),
      fetchStats(),
      fetchArchive(),
      fetchDoctor().catch(() => null),
      fetchBackups().catch(() => null),
      fetchGroups().catch(() => []),
    ])
      .then(([catalog, nextClients, st, ar, doc, backups, nextGroups]) => {
        if (cancelled) return;
        applyCatalog(catalog, nextClients, st, ar, doc, backups, nextGroups);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [applyCatalog]);

  useEffect(() => {
    if (page !== "skills" || skillsTab !== "apps" || selectedClientId === null) return;
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
  }, [page, skillsTab, selectedClientId]);

  const handleToggle = useCallback(async (skill: SkillRecord, clientId: string, enable: boolean) => {
    setPendingHash(skill.hash);
    try {
      await getAction(enable ? "enable" : "disable").execute({ hash: skill.hash, clientId });
      setSkills((prev) =>
        prev.map((s) => {
          if (s.hash !== skill.hash) return s;
          const visible = enable
            ? (s.visibleIn.includes(clientId) ? s.visibleIn : [...s.visibleIn, clientId])
            : s.visibleIn.filter((id) => id !== clientId);
          return { ...s, visibleIn: visible };
        }),
      );
      setClientStates((prev) => {
        if (prev === null || prev.clientId !== clientId) return prev;
        const rows = prev.rows.map((r) =>
          r.hash === skill.hash
            ? { ...r, state: enable ? "managed" as const : "off" as const, detail: enable ? "已启用" : "未启用" }
            : r,
        );
        return { ...prev, rows, enabled: rows.filter((r) => r.state === "managed").length };
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingHash(null);
    }
  }, []);

  const handleSaved = useCallback((oldHash: string, newHash: string) => {
    invalidateResource(treeResourceKey(oldHash));
    invalidateResourcePrefix(fileResourceKey(oldHash, ""));
    setSkills((prev) => prev.map((s) => (s.hash === oldHash ? { ...s, hash: newHash } : s)));
    setFocusedHash(newHash);
  }, []);

  const refreshCatalog = useCallback((): void => {
    void Promise.all([
      fetchCatalog(),
      selectedClientId === null ? Promise.resolve(null) : fetchClientSkillStates(selectedClientId),
      fetchGroups().catch(() => []),
    ]).then(([c, states, nextGroups]) => {
      setStoreRoot(c.storeRoot);
      setSkills(c.skills);
      setGroups(nextGroups);
      if (states !== null) setClientStates(states);
    });
  }, [selectedClientId]);

  const handleRestore = useCallback((name: string) => {
    void (async () => {
      try {
        await getAction("restore").execute({ name });
        setSkills((await fetchCatalog()).skills);
        setArchived(await fetchArchive());
        toast("已恢复 " + name);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const handleArchive = useCallback((hash: string) => {
    void (async () => {
      try {
        await getAction("archive").execute({ hash });
        setSkills((await fetchCatalog()).skills);
        setArchived(await fetchArchive());
        setFocusedHash(null);
        toast("已归档");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const go = (next: AppPage, tab?: SkillsTab): void => {
    setPage(next);
    if (tab !== undefined) setSkillsTab(tab);
  };

  const notice = (text: string): void => {
    toast(text);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-white">
      <Toaster />
      <Sidebar page={page} onPage={setPage} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {state === "offline" && (
          <p className="shrink-0 bg-amber-50 px-6 py-3 text-sm text-amber-800">
            未连接到本地数据服务。先运行一键启动,再刷新本页。
          </p>
        )}
        {state === "loading" && <p className="px-6 py-6 text-sm text-ink-mid">加载中…</p>}
        {state === "ready" && page === "overview" && (
          <OverviewPage
            skills={skills}
            clients={clients}
            doctor={doctor}
            snapshotCount={snapshotCount}
            onGo={go}
          />
        )}
        {state === "ready" && page === "stats" && (
          <StatsPage skills={skills} clients={clients} ranking={ranking} counters={usageByHash} onGo={setPage} />
        )}
        {state === "ready" && page === "skills" && (
          <SkillsPage
            tab={skillsTab}
            onTab={setSkillsTab}
            skills={skills}
            clients={clients}
            groups={groups}
            archived={archived}
            focusedHash={focusedHash}
            onFocus={setFocusedHash}
            pendingHash={pendingHash}
            clientStates={clientStates}
            selectedClientId={selectedClientId}
            onSelectClient={setSelectedClientId}
            onToggle={(skill, clientId, enable) => void handleToggle(skill, clientId, enable)}
            onSaved={handleSaved}
            onAdopted={refreshCatalog}
            onRestore={handleRestore}
            onArchive={handleArchive}
            onGroupsChanged={refreshCatalog}
            onNotice={notice}
            onBulkDone={refreshCatalog}
          />
        )}
        {state === "ready" && page === "settings" && (
          <SettingsPage
            storeRoot={storeRoot}
            clients={clients}
            latestSnapshotId={latestSnapshotId}
            onResetDone={() => {
              void Promise.all([
                fetchCatalog(),
                fetchClients(),
                fetchStats(),
                fetchArchive(),
                fetchDoctor().catch(() => null),
                fetchBackups().catch(() => null),
                fetchGroups().catch(() => []),
              ]).then(([catalog, nextClients, st, ar, doc, backups, nextGroups]) => {
                applyCatalog(catalog, nextClients, st, ar, doc, backups, nextGroups);
              });
            }}
          />
        )}
      </main>
    </div>
  );
}
