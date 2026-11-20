// @vitest-environment jsdom
import { act, createElement as element, Fragment, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReconcileBanner, RescanTriggerButton } from "./ReconcileBanner.js";
import type { ReconcilePreviewData, ReconcileScanSummary } from "./types.js";
import { useReconcile } from "./use-reconcile.js";

const empty: ReconcileScanSummary = {
  clientsScanned: 1, managedLinks: 0, unmanagedRealDirs: 0, replacedLinks: 0, newConflicts: 0,
  externalSymlinks: 0, danglingLinks: 0, nonSkillEntries: 0,
};

const plan: ReconcilePreviewData = {
  backupRequired: true, backupDir: "state/backups", skillsRoot: "assets",
  toAdopt: [], toRelinkIdentical: [], conflicts: [], untouchedNonSkill: [],
  skippedExternalLinks: [{ clientId: "codex", skillName: "external", linkPath: "link", targetPath: "source" }],
};

const json = (body: object, ok = true) => Response.json({ ok, ...body }, { status: ok ? 200 : 400 });
let root: Root;
let host: HTMLDivElement;
const refreshed = vi.fn();
const conflicts = vi.fn();

function Fixture({ ready }: { ready: boolean }) {
  const reconcile = useReconcile(ready ? "assets" : null, refreshed, conflicts);
  const { dialog } = reconcile;
  return element(Fragment, null,
    element(RescanTriggerButton, { onRescan: reconcile.rescan, scanning: reconcile.scanning }),
    element(ReconcileBanner, {
      summary: reconcile.summary, dismissed: reconcile.dismissed,
      onDismiss: reconcile.dismiss, onOpenDialog: reconcile.showPreview,
    }),
    dialog.open && element("div", null,
      element("p", null, dialog.preview?.backupDir),
      element("p", { "data-testid": "external" }, dialog.externalLinks.map((link) => link.skillName).join(",")),
      element("button", { "data-testid": "include", onClick: () => dialog.onIncludeExternalLinksChange(true) }, "Include"),
      element("button", { "data-testid": "confirm", onClick: () => void dialog.onApply().catch(() => undefined) }, "Apply"),
    ),
  );
}

const find = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function click(id: string) {
  const element = find(id);
  if (element === null) throw new Error("Missing control " + id);
  await act(async () => { element.click(); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  refreshed.mockClear();
  conflicts.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("waits for inventory, runs a single startup scan in StrictMode and shows drift after a manual rescan", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json(empty)).mockResolvedValueOnce(json({ ...empty, unmanagedRealDirs: 2 }));
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(element(StrictMode, null, element(Fixture, { ready: false }))));
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => root.render(element(StrictMode, null, element(Fixture, { ready: true }))));
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/reconcile/scan", {});
  expect(find("reconcile-banner")).toBeNull();
  await click("reconcile-rescan-button");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(find("reconcile-banner")?.textContent).toContain("2 个本地新增/未接管 Skill");
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="暂时收起"]')!.click());
  expect(find("reconcile-banner")).toBeNull();
});

it("replans external opt-in before applying and clears the banner without a background rescan", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(json({ ...empty, unmanagedRealDirs: 1, externalSymlinks: 1 }))
    .mockResolvedValueOnce(json(plan))
    .mockResolvedValueOnce(json({ ...plan, skippedExternalLinks: [] }))
    .mockResolvedValueOnce(json({ linksCreated: 2, conflictCount: 1, failures: [] }));
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(element(Fixture, { ready: true })));
  await click("reconcile-open-dialog");
  expect(host.textContent).toContain("state/backups");
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: "POST", body: '{"includeExternalLinks":false}' });
  await click("include");
  expect(find("external")?.textContent).toBe("external");
  expect(fetch.mock.calls[2]?.[1]).toMatchObject({ method: "POST", body: '{"includeExternalLinks":true}' });
  await click("confirm");
  expect(fetch.mock.calls[3]?.[1]).toMatchObject({ method: "POST", body: '{"includeExternalLinks":true}' });
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(refreshed).toHaveBeenCalledOnce();
  expect(find("reconcile-banner")).toBeNull();
  expect(find("confirm")).toBeNull();
});

it("retains the preview and drift banner after the write is rejected", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(json({ ...empty, replacedLinks: 1 }))
    .mockResolvedValueOnce(json(plan))
    .mockResolvedValueOnce(json({ message: "backup verification failed" }, false)));
  await act(async () => root.render(element(Fixture, { ready: true })));
  await click("reconcile-open-dialog");
  await click("confirm");
  expect(refreshed).not.toHaveBeenCalled();
  expect(find("reconcile-banner")).not.toBeNull();
  expect(find("confirm")).not.toBeNull();
});
