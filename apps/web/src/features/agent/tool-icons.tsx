import {
  Archive,
  ArchiveRestore,
  Check,
  Download,
  FileText,
  Folder,
  History,
  Library,
  Link2,
  ListChecks,
  PenLine,
  ScanSearch,
  Share2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  Unlink,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ToolIconName } from "./tool-meta.js";

const ICONS: Record<ToolIconName, LucideIcon> = {
  library: Library,
  file: FileText,
  scan: ScanSearch,
  folder: Folder,
  archive: Archive,
  history: History,
  stethoscope: Stethoscope,
  shield: ShieldCheck,
  sparkles: Sparkles,
  list: ListChecks,
  link: Link2,
  unlink: Unlink,
  download: Download,
  share: Share2,
  pen: PenLine,
  check: Check,
  trash: Trash2,
  restore: ArchiveRestore,
  users: Users,
  wrench: Wrench,
};

export function ToolIcon({ name, className }: { name: ToolIconName; className?: string }): React.JSX.Element {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}
