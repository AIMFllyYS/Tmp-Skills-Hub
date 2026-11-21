import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GitSettingsPanel } from "../git/GitSettingsPanel.js";
import { initStore } from "../skills/api.js";
import type { ClientInfo, StoreInitResponse } from "../skills/types.js";
import { FirstRunDialog } from "./FirstRunDialog.js";
import { DualPathOnboardingView } from "./DualPathOnboardingView.js";

interface StoreOnboardingProps {
  title: string;
  clients: ClientInfo[];
  onInit: (enableGit: boolean) => Promise<void>;
  onOpenAgent: () => void;
}

export function StoreOnboarding({ onInit, clients, ...props }: StoreOnboardingProps): React.JSX.Element {
  const [enableGit, setEnableGit] = useState(false);
  const [report, setReport] = useState<NonNullable<StoreInitResponse["guide"]> | null>(null);
  const [root, setRoot] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const desktop = globalThis.window?.skillsHubDesktop;
  const stateRoot = desktop?.stateFolder;
  const targets = clients.map(client => client.skillsDir);

  const install = async (skillsRoot: string | undefined, dirs: string[]): Promise<void> => {
    setInstalling(true);
    setShowProgress(true);
    try {
      const result = await initStore(skillsRoot, dirs);
      if (!result.guide) throw new Error("服务端未返回指南安装结果");
      const latest = result.guide;
      setReport(previous => ({
        ...latest, clients: [...(previous?.clients ?? []).filter(item => !dirs.includes(item.skillsDir)), ...latest.clients],
      }));
      setRoot(skillsRoot);
    } finally { setInstalling(false); }
  };

  if (report) {
    const failed = report.clients.filter(item => !item.ok).map(item => item.skillsDir);
    return (
      <div className="overflow-auto p-6">
        <Card className="max-w-2xl space-y-3">
          <h2 className="text-lg font-semibold">管理指南安装结果</h2>
          {report.error && <p role="alert">{report.error}</p>}
          {!report.error && !report.clients.length && <p>指南已保存到技能文件夹。尚未发现客户端。</p>}
          <ul>{report.clients.map(item => <li key={item.skillsDir} className="break-all">{item.skillsDir} · {item.message}</li>)}</ul>
          {(report.error || failed.length > 0) && <Button disabled={busy} onClick={async () => {
            setBusy(true);
            try { await install(root, failed.length > 0 ? failed : targets); }
            catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
            finally { setBusy(false); }
          }}>重试未完成项</Button>}
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            try { await onInit(enableGit); }
            catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
            finally { setBusy(false); }
          }}>进入库存</Button>
        </Card>
      </div>
    );
  }
  return (
    <><DualPathOnboardingView {...props} clientCount={clients.length} showGitOptions={false}
      {...(stateRoot ? { defaultStateRoot: stateRoot, defaultSkillsRoot: stateRoot + (stateRoot.includes("\\") ? "\\" : "/") + "skills" } : {})}
      {...(desktop?.initialFolder ? { initialSkillsRoot: desktop.initialFolder } : {})}
      gitOptions={<>
        <section className="space-y-2">
          <h3 className="font-semibold">安装 Skills Hub 管理指南</h3>
          <p>点击初始化后，随包的 skills-hub 指南将保存到上方的技能文件夹，并为以下客户端创建目录链接。</p>
          {clients.length ? <ul className="max-h-40 overflow-auto text-xs">{clients.map(client =>
            <li className="break-all" key={client.skillsDir}>{client.clientId} · {client.skillsDir}</li>)}</ul>
            : <p>尚未发现客户端，将仅安装到技能文件夹。</p>}
        </section>
        <GitSettingsPanel enableOnInit={enableGit} onEnabledChange={setEnableGit} />
      </>}
      onInit={({ skillsRoot }) => install(skillsRoot, targets)}
    />
    {installing && showProgress && <FirstRunDialog title="正在准备技能文件夹" detail="正在创建库存并为选定客户端安装管理指南。完成后可以查看每个客户端的安装结果。" waiting action="收起进度" onClose={() => setShowProgress(false)} />}</>
  );
}
