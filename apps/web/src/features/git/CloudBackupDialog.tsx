import { useState } from "react";
import { CloudUpload, Globe, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBanner } from "@/components/ui/status-banner";
import { Table, TableBody, TableHead, TableRow, TableTd, TableTh } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CLOUD_REPO_NAME,
  validateRepoName,
  type CloudRepoSetupInput,
  type SecretFinding,
} from "./types.js";

export interface CloudBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRepoName?: string;
  busy?: boolean;
  secretFindings?: readonly SecretFinding[];
  onCreateAndPush: (input: CloudRepoSetupInput) => Promise<void>;
}

/** 一键创建 GitHub 云端备份仓库弹窗：仓库名校验 + Private/Public 卡片选择 + Public 敏感密钥二次拦截。 */
export function CloudBackupDialog({
  open,
  onOpenChange,
  defaultRepoName = DEFAULT_CLOUD_REPO_NAME,
  busy = false,
  secretFindings,
  onCreateAndPush,
}: CloudBackupDialogProps): React.JSX.Element {
  const [repoName, setRepoName] = useState(defaultRepoName);
  const [touched, setTouched] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [confirmPublicSecrets, setConfirmPublicSecrets] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const effectiveBusy = busy || localBusy;
  const nameError = validateRepoName(repoName);
  const findings = secretFindings ?? [];
  const hasSecrets = findings.length > 0;
  const needsSecretAck = visibility === "public" && hasSecrets;
  const submitDisabled =
    effectiveBusy || nameError !== null || (needsSecretAck && !confirmPublicSecrets);

  const handleOpenChange = (next: boolean): void => {
    if (effectiveBusy) return;
    if (!next) {
      setSubmitError(null);
      setConfirmPublicSecrets(false);
    }
    onOpenChange(next);
  };

  const selectVisibility = (next: "private" | "public"): void => {
    setVisibility(next);
    setSubmitError(null);
    if (next === "private") {
      setConfirmPublicSecrets(false);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    setTouched(true);
    if (nameError !== null) return;
    if (needsSecretAck && !confirmPublicSecrets) return;

    setLocalBusy(true);
    setSubmitError(null);
    try {
      const payload: CloudRepoSetupInput = {
        repoName: repoName.trim(),
        visibility,
        ...(needsSecretAck ? { confirmPublicSecrets } : {}),
      };
      await onCreateAndPush(payload);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[min(42rem,90vh)] max-w-lg flex-col"
        data-testid="cloud-backup-dialog"
      >
        <DialogTitle>一键创建云端备份仓库</DialogTitle>
        <DialogDescription>
          通过本机 gh CLI 在你的 GitHub 账号下创建仓库，并将唯一真源目录推送至 origin。
        </DialogDescription>

        <ScrollArea className="mt-4 min-h-0 flex-1">
          <form
            id="cloud-backup-form"
            className="space-y-4 pr-0.5"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cloud-repo-name">仓库名称</Label>
              <Input
                id="cloud-repo-name"
                data-testid="cloud-repo-name"
                value={repoName}
                disabled={effectiveBusy}
                placeholder={DEFAULT_CLOUD_REPO_NAME}
                className="font-mono"
                onChange={(e) => {
                  setRepoName(e.target.value);
                  setTouched(true);
                  setSubmitError(null);
                }}
              />
              {touched && nameError !== null ? (
                <p className="text-xs text-red-700" role="alert" data-testid="cloud-repo-name-error">
                  {nameError}
                </p>
              ) : (
                <p className="text-xs text-ink-faint">
                  支持英文字母、数字、连字符（-）、下划线（_）和点（.），最长 100 字符。
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>仓库可见性</Label>
              <div
                role="radiogroup"
                aria-label="仓库可见性"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={visibility === "private"}
                  data-testid="cloud-visibility-private"
                  disabled={effectiveBusy}
                  onClick={() => selectVisibility("private")}
                  className={cn(
                    "motion-press motion-fill flex flex-col gap-1.5 rounded-xl border p-3.5 text-left outline-none focus-visible:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong disabled:pointer-events-none disabled:opacity-50",
                    visibility === "private"
                      ? "border-ink-strong bg-surface"
                      : "border-line bg-white hover:border-line-strong",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-strong">
                      <Lock className="size-4 text-ink-mid" aria-hidden />
                      Private
                    </span>
                    <Badge tone="success">推荐默认</Badge>
                  </div>
                  <p className="text-xs text-ink-mid">
                    仅你自己可见，安全备份个人工作流与私密经验。
                  </p>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={visibility === "public"}
                  data-testid="cloud-visibility-public"
                  disabled={effectiveBusy}
                  onClick={() => selectVisibility("public")}
                  className={cn(
                    "motion-press motion-fill flex flex-col gap-1.5 rounded-xl border p-3.5 text-left outline-none focus-visible:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong disabled:pointer-events-none disabled:opacity-50",
                    visibility === "public"
                      ? "border-ink-strong bg-surface"
                      : "border-line bg-white hover:border-line-strong",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-strong">
                      <Globe className="size-4 text-ink-mid" aria-hidden />
                      Public
                    </span>
                    <Badge tone="warning">公开可见</Badge>
                  </div>
                  <p className="text-xs text-ink-mid">
                    所有人均可浏览与克隆，推送前会强制扫描敏感密钥。
                  </p>
                </button>
              </div>
            </div>

            {visibility === "public" && (
              <StatusBanner
                tone="warning"
                surface="card"
                testId="cloud-public-warning"
                title="公开仓库将向互联网暴露全部 Skill 文件"
                description="请确认唯一真源目录中不含 API Key、内网地址、私人账号或敏感业务数据。除非明确需要对外分享，强烈建议选择 Private（私有仓库）。"
              />
            )}

            {hasSecrets && (
              <div className="space-y-3" data-testid="cloud-secret-findings">
                <StatusBanner
                  tone="danger"
                  surface="card"
                  title={"预检发现 " + String(findings.length) + " 处疑似敏感凭据（已脱敏展示）"}
                  description="强烈建议先清理或脱敏以下行，或改用 Private 私有仓库后再推送。"
                />

                <Table>
                  <TableHead>
                    <TableRow className="h-9">
                      <TableTh>文件</TableTh>
                      <TableTh className="w-16">行号</TableTh>
                      <TableTh>脱敏片段</TableTh>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {findings.map((item, idx) => (
                      <TableRow key={item.file + ":" + String(item.line) + ":" + String(idx)}>
                        <TableTd className="font-mono text-xs text-ink-strong">
                          <span>{item.file}</span>
                          {item.rule !== undefined && item.rule !== "" && (
                            <Badge tone="neutral" className="ml-1.5">
                              {item.rule}
                            </Badge>
                          )}
                        </TableTd>
                        <TableTd className="font-mono text-xs text-ink-mid">
                          L{String(item.line)}
                        </TableTd>
                        <TableTd className="font-mono text-xs text-red-700">
                          {item.preview}
                        </TableTd>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {needsSecretAck && (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <Checkbox
                      checked={confirmPublicSecrets}
                      onCheckedChange={setConfirmPublicSecrets}
                      disabled={effectiveBusy}
                      data-testid="cloud-confirm-public-secrets"
                      className="mt-0.5"
                    />
                    <span>
                      我已逐条核对上述脱敏命中项，确认均为误报或可安全公开的示例文本，仍坚持创建 Public 公开仓库并推送。
                    </span>
                  </label>
                )}
              </div>
            )}

            {submitError !== null && (
              <p className="text-xs text-red-700" role="alert">
                {submitError}
              </p>
            )}
          </form>
        </ScrollArea>

        <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-line pt-3">
          <Button
            type="button"
            variant="outline"
            disabled={effectiveBusy}
            onClick={() => handleOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="submit"
            form="cloud-backup-form"
            variant="default"
            data-testid="cloud-create-submit"
            disabled={submitDisabled}
          >
            <CloudUpload className="size-4 text-white" aria-hidden />
            {effectiveBusy
              ? "创建并推送中…"
              : visibility === "public"
                ? "创建公开仓库并推送"
                : "创建私有仓库并推送"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
