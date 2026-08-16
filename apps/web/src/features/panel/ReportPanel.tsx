import { useEffect, useState } from "react";
import { fetchDoctor, fetchVerify } from "../skills/api.js";
import type { DoctorResponse, VerifyResponse } from "../skills/types.js";

function Status({ ok, label }: { ok: boolean; label: string }): React.JSX.Element {
  return (
    <li className="flex gap-2 text-sm">
      <span className={ok ? "text-ink-mid" : "text-red-700"}>{ok ? "通过" : "失败"}</span>
      <span className="text-ink-mid">{label}</span>
    </li>
  );
}

/** 作用域「报告」:verify + doctor 只读展示,没有一键修复。 */
export function ReportPanel(): React.JSX.Element {
  const [verify, setVerify] = useState<VerifyResponse | null>(null);
  const [doctor, setDoctor] = useState<DoctorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchVerify(), fetchDoctor()])
      .then(([v, d]) => {
        if (cancelled) return;
        setVerify(v);
        setDoctor(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error !== null) return <p className="text-sm text-red-700">{error}</p>;
  if (verify === null || doctor === null) return <p className="text-sm text-ink-mid">正在生成报告…</p>;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium text-ink-strong">哈希校验 (verify)</h3>
        <p className="mt-1 text-xs text-ink-faint">对照库存快照重算哈希。漂移需在终端处理，本页不提供一键修复。</p>
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
    </div>
  );
}
