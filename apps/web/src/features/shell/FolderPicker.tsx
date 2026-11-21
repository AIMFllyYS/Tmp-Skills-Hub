import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function FolderPicker({ disabled, onPick }: { disabled: boolean; onPick: (folder: string) => void }) {
  const pick = globalThis.window?.skillsHubDesktop?.pickDirectory;
  if (!pick) return null;
  return <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={async () => {
    try {
      const folder = await pick();
      if (folder) onPick(folder);
    } catch {
      toast.error("无法打开文件夹选择窗口，请直接填写路径。");
    }
  }}>浏览…</Button>;
}
