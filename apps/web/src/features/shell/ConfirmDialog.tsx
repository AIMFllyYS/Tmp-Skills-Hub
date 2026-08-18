interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  tone?: "default" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
}

/** 危险操作二次确认:实体白底 + 边框,无阴影。 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy = false,
  tone = "danger",
  onCancel,
  onConfirm,
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-white/80 p-6" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-xl border border-line bg-white p-4">
        <h2 className="text-base font-medium text-ink-strong">{title}</h2>
        <p className="mt-2 text-sm text-ink-mid">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-mid hover:border-line-strong"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={
              tone === "danger"
                ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:border-red-300 disabled:text-ink-faint"
                : "rounded-lg bg-ink-strong px-3 py-2 text-sm text-white disabled:opacity-50"
            }
          >
            {busy ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
