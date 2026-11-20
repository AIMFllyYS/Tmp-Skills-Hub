import { Folder, GitBranch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PathField } from "@/components/ui/path-field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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
  gitDetected?: boolean;
  gitVersion?: string;
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
  gitDetected = true,
  gitVersion,
  onInit,
  onOpenAgent,
  className,
}: DualPathOnboardingViewProps): React.JSX.Element {
  const [skillsRoot, setSkillsRoot] = useState(defaultSkillsRoot);
  const [enableGit, setEnableGit] = useState(true);
  const [busy, setBusy] = useState(false);

  const trimmedSkillsRoot = skillsRoot.trim();
  const isCustomSkillsRoot = trimmedSkillsRoot !== "" && trimmedSkillsRoot !== defaultSkillsRoot;
  const effectiveGitEnabled = gitDetected && enableGit;

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
    <ScrollArea className={cn("min-h-0 flex-1", className)}>
      <div className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">{title}</h1>
        <p className="mt-1 text-sm text-ink-mid">
          本地技能库存尚未初始化。
          {clientCount > 0 ? "已检测到 " + String(clientCount) + " 个本机应用。" : ""}
        </p>

        <Card className="mt-6 max-w-2xl space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-medium text-ink-strong">确认目录布局并初始化库存</h2>
            <p className="text-sm text-ink-mid">
              状态数据与技能资产分离存放，便于唯一真源独立纳入版本控制。初始化阶段不会修改任何已有客户端文件。
            </p>
          </div>

          <section className="space-y-1.5" aria-label="控制与备份中心">
            <PathField
              label="控制与备份中心"
              path={defaultStateRoot}
              tag="默认固定，不建议修改"
              hint="配置 / 台账 / 备份 / 冲突池"
              onCopyError={() => toast.error("无法复制路径")}
              testId="onboarding-state-root"
            />
            <p className="text-xs text-ink-mid">
              固定存放 <code className="font-mono text-ink-strong">config.json</code>、软链接台账、去重备份快照与冲突变体池，不直接混入技能仓库。
            </p>
          </section>

          <Separator />

          <section className="space-y-2" aria-label="唯一真源目录">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Folder className="size-4 text-ink-mid" aria-hidden />
                <Label htmlFor="dual-path-skills-root">唯一真源目录（skillsRoot）</Label>
                <Badge>可自定义</Badge>
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
            <Input
              id="dual-path-skills-root"
              value={skillsRoot}
              onChange={(e) => setSkillsRoot(e.target.value)}
              placeholder={defaultSkillsRoot}
              disabled={busy}
              data-testid="store-init-path"
              className="font-mono text-xs"
            />
            <p className="text-xs text-ink-mid">
              所有活跃 Skill 的唯一实体目录，各应用内仅保留指向此处的纯软链接。默认位于{" "}
              <code className="font-mono text-ink-strong">{defaultSkillsRoot}</code>
              ，也可指定到 D 盘独立目录或已有 Git 仓库路径。
            </p>
          </section>

          <Separator />

          <section className="space-y-2" aria-label="Git 版本控制选项">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <GitBranch className="size-4 text-ink-mid" aria-hidden />
                  <Label htmlFor="dual-path-git-toggle">为唯一真源开启本地 Git 版本控制</Label>
                  {gitDetected ? (
                    <Badge tone="success">
                      {gitVersion !== undefined && gitVersion !== "" ? "Git " + gitVersion : "已检测到 Git"}
                    </Badge>
                  ) : (
                    <Badge tone="warning">未检测到 Git</Badge>
                  )}
                </div>
                <p className="text-xs text-ink-mid">
                  {gitDetected
                    ? "开启后将自动初始化 .git 与 .gitignore，常规新建、编辑与冲突合并自动提交留痕。"
                    : "未检测到本机 Git 可执行文件，已自动跳过，不会阻塞库存初始化。"}
                </p>
              </div>
              <Switch
                id="dual-path-git-toggle"
                checked={effectiveGitEnabled}
                disabled={busy || !gitDetected}
                onCheckedChange={setEnableGit}
                aria-label="为唯一真源开启本地 Git 版本控制"
              />
            </div>

            {!gitDetected && (
              <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-mid">
                如需版本回溯与 GitHub 云端备份，可稍后安装 Git（Windows 可运行{" "}
                <code className="font-mono text-ink-strong">winget install Git.Git</code> 或访问{" "}
                <code className="font-mono text-ink-strong">git-scm.com</code>），完成后在设置中随时开启。
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-2 pt-1">
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

          <div className="rounded-lg bg-surface px-3 py-2">
            <p className="text-xs text-ink-faint">或使用终端命令：</p>
            <code className="mt-1 block font-mono text-xs text-ink-strong">skills-hub init --yes</code>
          </div>
        </Card>
      </div>
    </ScrollArea>
  );
}
