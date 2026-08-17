import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked, type Tokens } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import { getAction } from "../actions/registry.js";
import { fetchSkillFile, fetchSkillTree } from "./api.js";
import { isAbortError } from "./async-resource.js";
import { loadSkillView } from "./skill-view-load.js";
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
  /** 保存成功回调(旧哈希,新哈希),上层按 key 替换,不整表重拉 */
  onSaved: (oldHash: string, newHash: string) => void;
}

/** skill 内容查看器:文件树 + 选中文件内容;Markdown 可读渲染,代码块高亮。 */
export function SkillViewer({ hash, onSaved }: SkillViewerProps): React.JSX.Element {
  const [entries, setEntries] = useState<SkillFileEntry[]>([]);
  const [selected, setSelected] = useState("SKILL.md");
  const [content, setContent] = useState("");
  const [treeError, setTreeError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const loadGen = useRef(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedHash, setSavedHash] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const gen = loadGen.current;
    const ac = new AbortController();
    void loadSkillView(hash, {
      fetchTree: (h) => fetchSkillTree(h, ac.signal),
      fetchFile: (h, p) => fetchSkillFile(h, p, ac.signal),
      isCancelled: () => cancelled || gen !== loadGen.current,
    }).then((result) => {
      if (result.status === "cancelled") return;
      if (result.status === "tree-error") {
        setTreeError(result.message);
        return;
      }
      setEntries(result.entries);
      if (result.status === "empty") {
        setSelected("");
        return;
      }
      setSelected(result.selected);
      if (result.status === "file-error") {
        setFileError(result.message);
        return;
      }
      setContent(result.content);
    }).finally(() => {
      if (!cancelled && gen === loadGen.current) setLoading(false);
    });
    return () => {
      cancelled = true;
      ac.abort();
      loadGen.current += 1;
    };
  }, [hash]);

  const load = useCallback(
    async (rel: string) => {
      const gen = ++loadGen.current;
      setFileError(null);
      setContent("");
      setSelected(rel);
      setFileLoading(true);
      setEditing(false);
      setSaveError(null);
      setSavedHash(null);
      setShowTranslated(false);
      setTranslateError(null);
      setTranslated(null);
      try {
        const res = await fetchSkillFile(hash, rel);
        if (gen !== loadGen.current) return;
        setContent(res.content);
      } catch (e) {
        if (gen !== loadGen.current || isAbortError(e)) return;
        setFileError(e instanceof Error ? e.message : String(e));
      } finally {
        if (gen === loadGen.current) setFileLoading(false);
      }
    },
    [hash],
  );

  /** 翻译/切回:点击"译"→ 中文;再点 → 原文。未配置或失败给可读提示,原文不丢。 */
  const toggleTranslate = useCallback(async () => {
    if (showTranslated) {
      setShowTranslated(false);
      return;
    }
    if (translated !== null) {
      setShowTranslated(true);
      return;
    }
    setTranslating(true);
    setTranslateError(null);
    try {
      const t = await getAction("translate").execute({ text: content });
      setTranslated(t);
      setShowTranslated(true);
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranslating(false);
    }
  }, [showTranslated, translated, content]);

  const startEdit = useCallback(() => {
    setDraft(content);
    setSaveError(null);
    setEditing(true);
  }, [content]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const newHash = await getAction("save").execute({ hash, relPath: selected, content: draft });
      setSavedHash(newHash);
      setEditing(false);
      setContent(draft);
      onSaved(hash, newHash);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [hash, selected, draft, onSaved]);

  const html = useMemo(() => {
    if (content === "") return "";
    return marked.parse(content) as string;
  }, [content]);

  if (loading) return <p className="px-4 pb-4 text-xs text-ink-mid" data-testid="skill-loading">加载内容…</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)] gap-4 p-4">
        <nav className="min-h-0 overflow-y-auto">
          {treeError !== null && <Notice text={treeError} tone="error" />}
          <ul className="space-y-0.5">
            {entries.map((e) => (
              <li key={e.path}>
                {e.kind === "dir" ? (
                  <span className="block truncate text-xs text-ink-faint">{e.path}/</span>
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
        <div className="min-h-24 overflow-y-auto">
          {savedHash !== null && <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">已保存</p>}
          {fileError !== null && <Notice text={fileError} tone={fileError.startsWith("二进制") || fileError.startsWith("文件过大") ? "warn" : "error"} />}
          {fileError === null && !editing && html !== "" && (
            <div className="mb-2 flex justify-end gap-2">
              <button
                type="button"
                disabled={translating}
                onClick={() => void toggleTranslate()}
                className={[
                  "rounded-full border px-3 py-1 text-xs transition-colors duration-150",
                  showTranslated
                    ? "border-line-strong bg-surface text-ink-strong"
                    : "border-line bg-white text-ink-mid hover:border-line-strong hover:text-ink-strong",
                  translating ? "opacity-60" : "",
                ].join(" ")}
              >
                {translating ? "翻译中…" : showTranslated ? "原文" : "译成中文"}
              </button>
              <button
                type="button"
                onClick={startEdit}
                className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong hover:text-ink-strong"
              >
                编辑
              </button>
            </div>
          )}
          {translateError !== null && <Notice text={translateError} tone={translateError.includes("DEEPSEEK_API_KEY") ? "warn" : "error"} />}
          {editing && (
            <div className="mb-2 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(false)}
                className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className={[
                  "rounded-full px-3 py-1 text-xs",
                  saving ? "bg-ink-faint text-white" : "bg-ink-strong text-white hover:opacity-90",
                ].join(" ")}
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          )}
          {saveError !== null && <Notice text={saveError} tone="error" />}
          {fileLoading && <p className="text-xs text-ink-mid" data-testid="skill-loading">加载中…</p>}
          {!fileLoading && selected === "" && fileError === null && treeError === null && (
            <p className="text-xs text-ink-mid">此 skill 没有可显示的文件</p>
          )}
          {fileError === null && !editing && html !== "" && (
            <div className="skill-md text-sm leading-relaxed" data-testid="skill-md" dangerouslySetInnerHTML={{ __html: showTranslated && translated !== null ? (marked.parse(translated) as string) : html }} />
          )}
          {fileError === null && editing && (
            <textarea
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              spellCheck={false}
              className="h-72 w-full resize-y rounded-lg border border-line bg-white p-2 font-mono text-xs text-ink-strong focus:border-line-strong focus:outline-none"
            />
          )}
        </div>
      </div>
    </div>
  );
}
