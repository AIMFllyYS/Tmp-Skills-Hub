import { Folder, GitBranch } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ICON_STROKE, IconBadge } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PathField } from "@/components/ui/path-field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { FolderPicker } from "./FolderPicker.js";
import { cn } from "@/lib/utils";

export interface DualPathInitOptions {
  skillsRoot?: string;
  enableGit?: boolean;
}

export interface DualPathOnboardingViewProps {
  title: string;
  clientCount: number;
  defaultStateRoot?: string;
  defaultSkillsRoot?: string;
  initialSkillsRoot?: string;
  gitDetected?: boolean;
  gitVersion?: string;
  showGitOptions?: boolean;
  gitOptions?: ReactNode;
  onInit: (opts: DualPathInitOptions) => Promise<void>;
  onOpenAgent: () => void;
  className?: string;
}

/** v0.3 双路径库存初始化引导页：清晰区分固定控制备份区、可自定义唯一真源与可选 Git 开关。 */
export function DualPathOnboardingView({
  title,
  clientCount,
  defaultStateRoot = "~/.skills-hub",
  defaultSkillsRoot = "~/.skills-hub/skills",
  initialSkillsRoot,
  gitDetected = true,
  gitVersion,
  showGitOptions = true,
  gitOptions,
  onInit,
  onOpenAgent,
  className,
}: DualPathOnboardingViewProps): React.JSX.Element {
  const [skillsRoot, setSkillsRoot] = useState(initialSkillsRoot || defaultSkillsRoot);
  const [enableGit, setEnableGit] = useState(true);
  const [busy, setBusy] = useState(false);

  const trimmedSkillsRoot = skillsRoot.trim();
  const isCustomSkillsRoot = trimmedSkillsRoot !== "" && trimmedSkillsRoot !== defaultSkillsRoot;
  const effectiveGitEnabled = showGitOptions && gitDetected && enableGit;

  const handleInit = async (): Promise<void> => {
    setBusy(true);
    try {
      const opts: DualPathInitOptions = {
        enableGit: effectiveGitEnabled,
        ...(isCustomSkillsRoot ? { skillsRoot: trimmedSkillsRoot } : {}),
      };
      await onInit(opts);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollArea className={cn("min-h-0 flex-1 bg-canvas/55", className)}>
      <div className="p-6">
        <div className="flex items-start gap-3.5">
          <img src="/skills-hub.png" alt="" width={48} height={48} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">{title}</h1>
            <p className="mt-1 text-sm text-ink-mid">
              选择技能文件夹，开始管理这台电脑上的技能。
              {clientCount > 0 ? "已检测到 " + String(clientCount) + " 个本机应用。" : ""}
            </p>
          </div>
        </div>

        <Card className="mt-6 max-w-2xl space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-ink-strong">设置技能文件夹</h2>
            <p className="text-sm leading-relaxed text-ink-mid">
              每个受管技能只保存一份，Codex、WorkBuddy 等客户端共用这里的原文件。
            </p>
          </div>

          <section className="space-y-2.5" aria-label="技能文件夹">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <IconBadge size="xs" tone="surface">
                  <Folder className="size-3.5" strokeWidth={ICON_STROKE} />
                </IconBadge>
                <Label htmlFor="dual-path-skills-root">技能文件夹</Label>
              </div>
              {isCustomSkillsRoot && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  disabled={busy}
                  onClick={() => setSkillsRoot(defaultSkillsRoot)}
                  className="h-auto px-0 py-0 text-xs text-ink-mid"
                >
                  恢复默认
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="dual-path-skills-root"
                value={skillsRoot}
                onChange={(e) => setSkillsRoot(e.target.value)}
                placeholder={defaultSkillsRoot}
                disabled={busy}
                data-testid="store-init-path"
                className="font-mono text-xs"
              />
              <FolderPicker disabled={busy} onPick={setSkillsRoot} />
            </div>
            <p className="text-xs leading-relaxed text-ink-mid">
              选择空文件夹，或填写一个新文件夹的路径。以后可以在设置里更换。
            </p>
          </section>

          <PathField label="设置与备份" path={defaultStateRoot} tag="由应用管理"
            onCopyError={() => toast.error("无法复制路径")} testId="onboarding-state-root" />

          {gitOptions !== undefined && (
            <>
              <Separator />
              {gitOptions}
            </>
          )}

          {showGitOptions && (
            <>
              <Separator />

              <section className="space-y-2.5" aria-label="Git 版本控制选项">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <IconBadge size="sm" tone={gitDetected ? "success" : "warning"} className="mt-0.5">
                      <GitBranch className="size-4" strokeWidth={ICON_STROKE} />
                    </IconBadge>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor="dual-path-git-toggle">为技能文件夹开启本地 Git 版本控制</Label>
                        {gitDetected ? (
                          <Badge tone="success" dot>
                            {gitVersion !== undefined && gitVersion !== "" ? "Git " + gitVersion : "已检测到 Git"}
                          </Badge>
                        ) : (
                          <Badge tone="warning" dot>
                            未检测到 Git
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-ink-mid">
                        {gitDetected
                          ? "开启后将自动初始化 .git 与 .gitignore，常规新建、编辑与冲突合并自动提交留痕。"
                          : "未检测到本机 Git 可执行文件，已自动跳过，不会阻塞库存初始化。"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="dual-path-git-toggle"
                    checked={effectiveGitEnabled}
                    disabled={busy || !gitDetected}
                    onCheckedChange={setEnableGit}
                    aria-label="为技能文件夹开启本地 Git 版本控制"
                  />
                </div>

                {!gitDetected && (
                  <div className="rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-xs text-ink-mid">
                    如需版本回溯与 GitHub 云端备份，可稍后安装 Git（Windows 可运行{" "}
                    <code className="font-mono text-ink-strong">winget install Git.Git</code> 或访问{" "}
                    <code className="font-mono text-ink-strong">git-scm.com</code>），完成后在设置中随时开启。
                  </div>
                )}
              </section>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <Button
              type="button"
              disabled={busy}
              data-testid="store-init-button"
              onClick={() => void handleInit()}
            >
              {busy ? "初始化中…" : "初始化库存"}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onOpenAgent}>
              打开 Agent
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-line/80 bg-canvas px-3.5 py-2.5">
            <span className="text-xs text-ink-faint">或使用终端命令</span>
            <code className="font-mono text-xs font-medium text-ink-strong">skills-hub init --yes</code>
          </div>
        </Card>
      </div>
    </ScrollArea>
  );
}
