import { FolderSearch, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function FirstRunDialog({ title, detail, waiting, action, onAction, onClose }: {
  title: string; detail: string; waiting: boolean; action: string; onAction?: () => void; onClose: () => void;
}) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-sm">
      <div className="mb-4 inline-flex rounded-xl bg-surface p-2.5">{waiting ? <FolderSearch size={20} /> : <Check size={20} />}</div>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{detail}</DialogDescription>
      {waiting && <progress aria-label={title} className="mt-4 h-1.5 w-full accent-current" />}
      <div className="mt-5 flex justify-end"><Button size="sm" onClick={onAction ?? onClose}>{action}</Button></div>
    </DialogContent>
  </Dialog>;
}
