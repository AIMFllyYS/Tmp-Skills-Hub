import { useCallback, useEffect, useMemo, useState } from "react";
import { marked, type Tokens } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import { fetchSkillFile, fetchSkillTree } from "./api.js";
import type { SkillFileEntry } from "./types.js";

/** 代码块高亮:marked 新版已移除内置 highlight 选项,用自定义 renderer 挂 hljs。 */
marked.use({
  renderer: {
    code(token: Tokens.Code): string {
      const lang = token.lang !== undefined && hljs.getLanguage(token.lang) ? token.lang : "plaintext";
      const html = hljs.highlight(token.text, { language: lang }).value;
      return "<pre><code class='hljs language-" + lang + "'>" + html + "</code></pre>";
    },
  },
});

/** 大文件/二进制降级提示与普通错误共用的小条。 */
function Notice({ text, tone }: { text: string; tone: "warn" | "error" }): React.JSX.Element {
  const cls = tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  return <p className={"rounded-lg px-3 py-2 text-xs " + cls}>{text}</p>;
}

interface SkillViewerProps {
  hash: string;
  onClose: () => void;
}

/** skill 内容查看器:文件树 + 选中文件内容;Markdown 可读渲染,代码块高亮。 */
export function SkillViewer({ hash, onClose }: SkillViewerProps): React.JSX.Element {
  const [entries, setEntries] = useState<SkillFileEntry[]>([]);
  const [selected, setSelected] = useState("SKILL.md");
  const [content, setContent] = useState("");
  const [treeError, setTreeError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 组件每次展开全新挂载,初始 state 即 loading/null,无需同步重置
    let cancelled = false;
    fetchSkillTree(hash)
      .then((e) => {
        if (cancelled) return;
        setEntries(e);
        const md = e.find((x) => x.path === "SKILL.md");
        setSelected(md !== undefined ? "SKILL.md" : (e.find((x) => x.kind === "file")?.path ?? ""));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTreeError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hash]);

  const load = useCallback(
    async (rel: string) => {
      setFileError(null);
      setContent("");
      setSelected(rel);
      try {
        const res = await fetchSkillFile(hash, rel);
        setContent(res.content);
      } catch (e) {
        setFileError(e instanceof Error ? e.message : String(e));
      }
    },
    [hash],
  );

  const html = useMemo(() => {
    if (content === "") return "";
    return marked.parse(content) as string;
  }, [content]);

  if (loading) return <p className="px-4 pb-4 text-xs text-ink-mid">加载内容…</p>;

  return (
    <div className="border-t border-line">
      <div className="flex items-center justify-between px-4 pt-3">
        <h3 className="text-xs font-medium text-ink-strong">内容</h3>
        <button type="button" onClick={onClose} className="text-xs text-ink-mid hover:text-ink-strong">收起</button>
      </div>
      <div className="grid grid-cols-[10rem_1fr] gap-4 p-4">
        <nav className="max-h-72 overflow-y-auto">
          {treeError !== null && <Notice text={treeError} tone="error" />}
          <ul className="space-y-0.5">
            {entries.map((e) => (
              <li key={e.path}>
                {e.kind === "dir" ? (
                  <span className="block truncate text-xs text-ink-faint">📁 {e.path}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void load(e.path)}
                    className={[
                      "block w-full truncate rounded px-1 py-0.5 text-left text-xs",
                      selected === e.path ? "bg-surface text-ink-strong" : "text-ink-mid hover:text-ink-strong",
                    ].join(" ")}
                  >
                    {e.path}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-h-24 max-h-96 overflow-y-auto">
          {fileError !== null && <Notice text={fileError} tone={fileError.startsWith("二进制") || fileError.startsWith("文件过大") ? "warn" : "error"} />}
          {selected !== "" && fileError === null && content === "" && <p className="text-xs text-ink-mid">加载中…</p>}
          {fileError === null && html !== "" && (
            <div className="skill-md text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </div>
    </div>
  );
}
