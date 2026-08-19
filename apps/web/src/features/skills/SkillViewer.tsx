import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { marked, type Tokens } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import { getAction } from "../actions/registry.js";
import { fetchSkillFile, fetchSkillTree } from "./api.js";
import { isAbortError } from "./async-resource.js";
import { loadSkillView } from "./skill-view-load.js";
import {
  collectDirPaths,
  countFiles,
  fileTint,
  fileTintClass,
  formatBytes,
  formatInstalledAt,
  originLabel,
  totalSizeBytes,
  treeFromEntries,
  type SkillTreeNode,
} from "./skill-tree.js";
import type { SkillFileEntry, SkillRecord } from "./types.js";

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

function Notice({ text, tone }: { text: string; tone: "warn" | "error" }): React.JSX.Element {
  const cls = tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  return <p className={"rounded-lg px-3 py-2 text-sm " + cls}>{text}</p>;
}

function TreeGlyph({ node, open }: { node: SkillTreeNode; open: boolean }): React.JSX.Element {
  const tint = fileTint(node.path, node.kind);
  const cls = cn("size-4 shrink-0", fileTintClass(tint));
  if (node.kind === "dir") {
    return open ? <FolderOpen className={cls} aria-hidden /> : <Folder className={cls} aria-hidden />;
  }
  if (tint === "md") return <FileText className={cls} aria-hidden />;
  if (tint === "json") return <FileJson className={cls} aria-hidden />;
  if (tint === "code") return <FileCode className={cls} aria-hidden />;
  return <File className={cls} aria-hidden />;
}

function TreeRows({
  nodes,
  depth,
  selected,
  expanded,
  onToggle,
  onOpenFile,
}: {
  nodes: readonly SkillTreeNode[];
  depth: number;
  selected: string;
  expanded: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}): React.JSX.Element {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const open = expanded.has(node.path);
        const pad = 8 + depth * 12;
        if (node.kind === "dir") {
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => onToggle(node.path)}
                style={{ paddingLeft: pad }}
                className="flex w-full items-center gap-1 rounded-lg py-1 pr-2 text-left text-sm text-ink-mid transition-colors duration-[150ms] hover:bg-surface hover:text-ink-strong"
              >
                {open
                  ? <ChevronDown className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
                  : <ChevronRight className="size-3.5 shrink-0 text-ink-faint" aria-hidden />}
                <TreeGlyph node={node} open={open} />
                <span className="truncate">{node.name}</span>
              </button>
              {open && node.children.length > 0 && (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  selected={selected}
                  expanded={expanded}
                  onToggle={onToggle}
                  onOpenFile={onOpenFile}
                />
              )}
            </li>
          );
        }
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onOpenFile(node.path)}
              style={{ paddingLeft: pad + 14 }}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg py-1 pr-2 text-left text-sm transition-colors duration-[150ms]",
                selected === node.path ? "bg-surface text-ink-strong" : "text-ink-mid hover:bg-surface hover:text-ink-strong",
              )}
            >
              <TreeGlyph node={node} open={false} />
              <span className="truncate">{node.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const EMPTY_PATHS: ReadonlySet<string> = new Set();

function MetaCell({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg bg-surface px-3 py-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-ink-strong" title={value}>{value}</p>
    </div>
  );
}

interface SkillViewerProps {
  hash: string;
  skill: SkillRecord;
  actions: ReactNode;
  onSaved: (oldHash: string, newHash: string) => void;
}

/** skill 内容:左侧层级树,右侧元信息 / 描述 / 正文。目录列仍在 SkillsPage。 */
export function SkillViewer({ hash, skill, actions, onSaved }: SkillViewerProps): React.JSX.Element {
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
  const [collapsed, setCollapsed] = useState<{ key: string; paths: Set<string> }>({
    key: "",
    paths: new Set(),
  });

  const tree = useMemo(() => treeFromEntries(entries), [entries]);
  const treeKey = useMemo(() => entries.map((e) => e.path).join("\n"), [entries]);
  const allDirs = useMemo(() => new Set(collectDirPaths(tree)), [tree]);
  const collapsedPaths = collapsed.key === treeKey ? collapsed.paths : EMPTY_PATHS;
  const expanded = useMemo(() => {
    const next = new Set(allDirs);
    for (const p of collapsedPaths) next.delete(p);
    return next;
  }, [allDirs, collapsedPaths]);

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

  const toggleDir = useCallback((path: string) => {
    setCollapsed((prev) => {
      const paths = prev.key === treeKey ? new Set(prev.paths) : new Set<string>();
      if (paths.has(path)) paths.delete(path);
      else paths.add(path);
      return { key: treeKey, paths };
    });
  }, [treeKey]);

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

  const title = skill.meta.name !== "" ? skill.meta.name : skill.dirName;
  const description = skill.meta.description.trim();
  const canPreview = fileError === null && html !== "";

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line">
        <div className="m-3 flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2">
          <Layers className="size-4 shrink-0 text-ink-mid" aria-hidden />
          <span className="truncate text-sm font-medium text-ink-strong">{skill.dirName}</span>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {treeError !== null && <Notice text={treeError} tone="error" />}
          {loading && (
            <p className="px-2 py-2 text-sm text-ink-mid" data-testid="skill-loading">加载内容…</p>
          )}
          {!loading && (
            <TreeRows
              nodes={tree}
              depth={0}
              selected={selected}
              expanded={expanded}
              onToggle={toggleDir}
              onOpenFile={(path) => void load(path)}
            />
          )}
        </nav>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="space-y-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight text-ink-strong">{title}</h2>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
              {canPreview && (
                <>
                  {!editing && (
                    <Button
                      type="button"
                      size="sm"
                      variant={showTranslated ? "default" : "outline"}
                      disabled={translating}
                      onClick={() => void toggleTranslate()}
                    >
                      {translating ? "翻译中…" : showTranslated ? "原文" : "译成中文"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={editing ? "outline" : "default"}
                    disabled={saving}
                    onClick={() => setEditing(false)}
                  >
                    预览
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={editing ? "default" : "outline"}
                    disabled={saving}
                    onClick={() => {
                      if (!editing) startEdit();
                    }}
                  >
                    编辑
                  </Button>
                  {editing && (
                    <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
                      {saving ? "保存中…" : "保存"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-line p-3 sm:grid-cols-4">
            <MetaCell label="来源" value={originLabel(skill.origins)} />
            <MetaCell label="收录" value={formatInstalledAt(skill.installedAt)} />
            <MetaCell label="文件" value={loading ? "…" : String(countFiles(entries))} />
            <MetaCell label="体积" value={loading ? "…" : formatBytes(totalSizeBytes(entries))} />
          </div>
          <section className="space-y-2">
            <h3 className="text-base font-medium text-ink-strong">Description</h3>
            <p className="text-sm leading-relaxed text-ink-mid">
              {description === "" ? "无描述" : description}
            </p>
          </section>
          <section className="space-y-3">
            {savedHash !== null && <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">已保存</p>}
            {fileError !== null && (
              <Notice text={fileError} tone={fileError.startsWith("二进制") || fileError.startsWith("文件过大") ? "warn" : "error"} />
            )}
            {translateError !== null && (
              <Notice text={translateError} tone={translateError.includes("DEEPSEEK_API_KEY") ? "warn" : "error"} />
            )}
            {saveError !== null && <Notice text={saveError} tone="error" />}
            {fileLoading && (
              <div data-testid="skill-loading">
                <span className="sr-only">加载中…</span>
                <div className="h-24 rounded-lg bg-surface motion-safe:animate-pulse" />
              </div>
            )}
            {!fileLoading && selected === "" && fileError === null && treeError === null && !loading && (
              <p className="text-sm text-ink-mid">此 skill 没有可显示的文件</p>
            )}
            {fileError === null && !editing && html !== "" && (
              <div
                className="skill-md text-sm leading-relaxed"
                data-testid="skill-md"
                dangerouslySetInnerHTML={{
                  __html: showTranslated && translated !== null ? (marked.parse(translated) as string) : html,
                }}
              />
            )}
            {fileError === null && editing && (
              <Textarea
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
                spellCheck={false}
                className="h-72 resize-y"
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
