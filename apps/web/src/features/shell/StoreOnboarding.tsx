import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface StoreOnboardingProps {
  title: string;
  clientCount: number;
  onInit: (storeRoot?: string) => Promise<void>;
  onOpenAgent: () => void;
}

/** 库存未配置时的引导页:可直接在面板初始化或切入 Agent 对话。 */
export function StoreOnboarding({
  title,
  clientCount,
  onInit,
  onOpenAgent,
}: StoreOnboardingProps): React.JSX.Element {
  const [customPath, setCustomPath] = useState("");
  const [busy, setBusy] = useState(false);

  const handleInit = async (): Promise<void> => {
    setBusy(true);
    try {
      await onInit(customPath);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">{title}</h1>
        <p className="mt-1 text-sm text-ink-mid">
          本地技能库存尚未初始化。
          {clientCount > 0 ? "已检测到 " + String(clientCount) + " 个本机应用。" : ""}
        </p>
        <Card className="mt-6 max-w-xl space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-medium text-ink-strong">初始化技能库存</h2>
            <p className="text-sm text-ink-mid">
              点击下方按钮会在默认位置创建库存目录，也可以填写自定义路径。不会修改任何已有客户端文件。
            </p>
          </div>
          <Input
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="库存路径(留空使用默认 ~/.skills-hub/store)"
            disabled={busy}
            data-testid="store-init-path"
          />
          <div className="flex flex-wrap items-center gap-2">
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
