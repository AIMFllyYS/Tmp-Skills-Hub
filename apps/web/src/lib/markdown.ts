/**
 * Markdown 渲染共用件:hljs 代码块高亮挂在 marked 自定义 renderer 上,
 * 并通过 DOMPurify 清洗全部 HTML 输出以防止存储型 / 反射型 XSS。
 * SkillViewer 与 Agent 消息共用。
 */

import DOMPurify, { type WindowLike } from "dompurify";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github.css";
import { marked, type Tokens } from "marked";

marked.use({
  renderer: {
    code(token: Tokens.Code): string {
      const lang = token.lang !== undefined && hljs.getLanguage(token.lang) ? token.lang : "plaintext";
      const html = hljs.highlight(token.text, { language: lang }).value;
      return "<pre><code class='hljs language-" + lang + "'>" + html + "</code></pre>";
    },
  },
});

const hookedPurifiers = new WeakSet<object>();

function getPurifier(): typeof DOMPurify | null {
  const candidate = DOMPurify.isSupported
    ? DOMPurify
    : typeof window !== "undefined"
      ? DOMPurify(window as unknown as WindowLike)
      : null;
  if (candidate === null || !candidate.isSupported) return null;
  if (!hookedPurifiers.has(candidate)) {
    hookedPurifiers.add(candidate);
    candidate.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        const href = node.getAttribute("href");
        const isExternalHttp = href !== null && /^https?:\/\//i.test(href);
        if (isExternalHttp || node.getAttribute("target") === "_blank") {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      }
    });
  }
  return candidate;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMarkdown(md: string): string {
  const rawHtml = marked.parse(md, { async: false });
  const purifier = getPurifier();
  if (purifier === null) return escapeHtml(rawHtml);
  return purifier.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["style", "form"],
  });
}
