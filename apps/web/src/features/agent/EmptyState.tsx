/** 空状态(ui-design-v2 §9):标志 + 一句问候 + 四张能力卡片,点击直接发送。 */

import { Library, ScanSearch, Sparkles, Stethoscope, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/ui/logo";

const STARTERS: { icon: LucideIcon; title: string; desc: string; prompt: string }[] = [
  { icon: Library, title: "盘点库存", desc: "有哪些 skill,哪些还没启用", prompt: "盘点一下我的库存:一共多少个 skill,哪些还没挂到任何应用?" },
  { icon: ScanSearch, title: "扫描本机", desc: "各客户端里还有哪些没收录", prompt: "扫描一下我本机各个客户端目录,找出还没收录进库存的 skill。" },
  { icon: Sparkles, title: "找重复与冲突", desc: "相近、重名或作用重叠的 skill", prompt: "帮我找出库存里可能重复或冲突的 skill,并给出整理建议。" },
  { icon: Stethoscope, title: "环境体检", desc: "悬空链接、库存可达性", prompt: "做一次环境自检,看看有没有悬空链接或其它需要处理的问题。" },
];

export function EmptyState({ onPick }: { onPick: (prompt: string) => void }): React.JSX.Element {
  return (
    <div className="flex min-h-full flex-col items-center justify-center py-10">
      <span className="flex size-14 items-center justify-center rounded-2xl border border-line bg-card shadow-lift">
        <Logo className="size-8" />
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink-strong">今天想整理什么?</h2>
      <p className="mt-1.5 max-w-md text-center text-sm leading-relaxed text-ink-mid">
        我能直接查看、启用、收录和归档你的 skill。写操作默认要你批准,每一步都看得见。
      </p>
      <div className="mt-8 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s.prompt)}
            className="group flex items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-left shadow-card outline-none motion-press hover:border-line-strong hover:shadow-lift focus-visible:ring-2 focus-visible:ring-volt-fill/60"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-mid motion-fill group-hover:bg-volt-soft group-hover:text-volt">
              <s.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-strong">{s.title}</span>
              <span className="mt-0.5 block text-xs text-ink-faint">{s.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
