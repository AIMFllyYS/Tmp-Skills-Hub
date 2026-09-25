import { cn } from "@/lib/utils";

/** 按 origins[0].kind 取色(ui-design-v2 §2.3);只出现在行首方块里。 */
const KIND_COLOR: Record<string, string> = {
  "local-scan": "var(--color-volt-fill)",
  github: "#e0845e",
  "skills-sh": "#a293ff",
  authored: "#ffb547",
};

const KIND_LABEL: Record<string, string> = {
  "local-scan": "本机收录",
  github: "GitHub",
  "skills-sh": "skills.sh",
  authored: "自建",
  "archive-restore": "归档恢复",
};

export function sourceLabel(kind: string | undefined): string {
  return kind === undefined || kind === "" ? "未标记" : KIND_LABEL[kind] ?? kind;
}

/** 名称缩写:连字符取首字母,否则取前两位。 */
export function glyphText(name: string): string {
  const parts = name.split(/[-_\s]+/).filter((p) => p !== "");
  const raw = parts.length > 1 ? (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "") : name.slice(0, 2);
  return raw.toUpperCase();
}

export function SourceGlyph({
  name,
  kind,
  size = "md",
  className,
}: {
  name: string;
  kind?: string | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}): React.JSX.Element {
  const bg = (kind !== undefined && KIND_COLOR[kind]) || "var(--color-surface-strong)";
  return (
    <span
      aria-hidden
      title={sourceLabel(kind)}
      style={{ background: bg }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-mono font-semibold text-ink-strong ring-1 ring-ink-strong/5 ring-inset",
        size === "sm" && "size-5 rounded-[5px] text-[9px]",
        size === "md" && "size-7 rounded-md text-[10px]",
        size === "lg" && "size-10 rounded-lg text-xs",
        className,
      )}
    >
      {glyphText(name)}
    </span>
  );
}
