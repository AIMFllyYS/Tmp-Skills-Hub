import { useEffect, useState } from "react";
import { fetchBackups, fetchDoctor, fetchVerify, previewReset, startReset } from "../skills/api.js";
import type { BackupsListResponse, BackupsPreviewResponse, DoctorResponse, VerifyResponse } from "../skills/types.js";

function Status({ ok, label }: { ok: boolean; label: string }): React.JSX.Element {
  return (
    <li className="flex gap-2 text-sm">
      <span className={ok ? "text-ink-mid" : "text-red-700"}>{ok ? "通过" : "失败"}</span>
      <span className="text-ink-mid">{label}</span>
    </li>
  );
}

/** 作用域「报告」:verify + doctor + 一键 reset(预览后输入确认短语)。 */
export function ReportPanel(): React.JSX.Element {
  const [verify, setVerify] = useState<VerifyResponse | null>(null);
  const [doctor, setDoctor] = useState<DoctorResponse | null>(null);
  const [backups, setBackups] = useState<BackupsListResponse | null>(null);
  const [snapshotId, setSnapshotId] = useState("");
  const [preview, setPreview] = useState<BackupsPreviewResponse | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchVerify(), fetchDoctor(), fetchBackups()])
      .then(([v, d, b]) => {
        if (cancelled) return;
        setVerify(v);
        setDoctor(d);
        setBackups(b);
        const initial = b.latest ?? b.snapshots[0]?.snapshotId ?? "";
        setSnapshotId(initial);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error !== null) return <p className="text-sm text-red-700">{error}</p>;
  if (verify === null || doctor === null || backups === null) {
    return <p className="text-sm text-ink-mid">正在生成报告…</p>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium text-ink-strong">哈希校验 (verify)</h3>
        <p className="mt-1 text-xs text-ink-faint">对照库存快照重算哈希。漂移需在终端处理。</p>
        <ul className="mt-2 space-y-1">
          {verify.passed.map((name) => (
            <Status key={"ok-" + name} ok label={name + " 与记录一致"} />
          ))}
          {verify.drifted.map((d) => (
            <Status
              key={"drift-" + d.name}
              ok={false}
              label={d.name + " 漂移（记录 " + d.recordedHash.slice(0, 12) + " ≠ 实际 " + d.actualHash.slice(0, 12) + "）"}
            />
          ))}
          {verify.missing.map((m) => (
            <Status key={"miss-" + m.name} ok={false} label={m.name + " 目录缺失"} />
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-sm font-medium text-ink-strong">环境自检 (doctor)</h3>
        <ul className="mt-2 space-y-1">
          <Status
            ok={doctor.store.resolved && doctor.store.reachable}
            label={
              doctor.store.storeRoot !== null
                ? "库存 " + doctor.store.storeRoot + (doctor.store.reachable ? " 可达" : " 不可达: " + (doctor.store.error ?? ""))
                : "库存未配置"
            }
          />
          <Status ok={doctor.roots.length > 0} label={"客户端 root " + String(doctor.roots.length) + " 个"} />
          {doctor.roots.map((r) => (
            <li key={r.clientId} className="font-mono text-xs text-ink-faint break-all">
              {r.clientId} → {r.skillsDir}
            </li>
          ))}
          <Status ok={doctor.linkTypes.junction || doctor.linkTypes.symlink} label={"junction " + (doctor.linkTypes.junction ? "可用" : "不可用") + " / symlink " + (doctor.linkTypes.symlink ? "可用" : "不可用")} />
          <Status ok={doctor.danglingLinks.length === 0} label={"悬空链接 " + String(doctor.danglingLinks.length) + " 条"} />
          {doctor.danglingLinks.map((d) => (
            <Status key={d.linkPath} ok={false} label={d.linkPath + " → " + d.target} />
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-sm font-medium text-ink-strong">恢复到初始化前</h3>
        <p className="mt-1 text-xs text-ink-faint">
          先预览将覆盖的客户端 skills，再输入 reset 确认。确认后会打开新窗口跑完还原并重新收录，本页将关闭。
        </p>
        {backups.snapshots.length === 0 ? (
          <p className="mt-2 text-sm text-ink-mid">尚无备份快照。</p>
        ) : (
          <div className="mt-3 space-y-3">
            <label className="block text-xs text-ink-mid">
              快照
              <select
                className="mt-1 block w-full border border-line bg-white px-2 py-1 text-sm text-ink-strong"
                value={snapshotId}
                onChange={(e) => {
                  setSnapshotId(e.target.value);
                  setPreview(null);
                  setNotice(null);
                }}
              >
                {backups.snapshots.map((s) => (
                  <option key={s.snapshotId} value={s.snapshotId}>
                    {s.snapshotId}（文件 {s.files} / 链接 {s.links}）
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="text-sm text-ink-strong underline disabled:text-ink-faint"
              disabled={busy || snapshotId === ""}
              onClick={() => {
                setBusy(true);
                setNotice(null);
                previewReset(snapshotId)
                  .then((p) => setPreview(p))
                  .catch((e: unknown) => setNotice(e instanceof Error ? e.message : String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              预览
            </button>
            {preview !== null && (
              <ul className="space-y-1 text-sm text-ink-mid">
                <li>快照 {preview.snapshotId} · 校验通过</li>
                <li>将还原 {preview.clients} 个客户端 / {preview.skills} 个 skill（文件 {preview.files}，链接 {preview.links}）</li>
                <li>旧库存将旁路为 {preview.asideStore}</li>
                <li>指针将旁路为 {preview.asidePointer}</li>
                {preview.skippedOwnDirs.length > 0 && (
                  <li>跳过本项目目录 {preview.skippedOwnDirs.join(", ")}</li>
                )}
              </ul>
            )}
            <label className="block text-xs text-ink-mid">
              输入 reset 确认
              <input
                className="mt-1 block w-full border border-line bg-white px-2 py-1 text-sm text-ink-strong"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="text-sm text-red-700 underline disabled:text-ink-faint"
              disabled={busy || preview === null || confirm !== "reset"}
              onClick={() => {
                setBusy(true);
                startReset(snapshotId, confirm)
                  .then(() => setNotice("已在新窗口执行，本页将关闭。"))
                  .catch((e: unknown) => setNotice(e instanceof Error ? e.message : String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              确认并开始
            </button>
            {notice !== null && <p className="text-sm text-ink-mid">{notice}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
