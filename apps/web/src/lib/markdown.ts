/**
 * Markdown 渲染共用件:hljs 代码块高亮挂在 marked 自定义 renderer 上
 * (marked 新版移除了内置 highlight 选项)。SkillViewer 与 Agent 消息共用。
 *
 * 安全:渲染结果会进 dangerouslySetInnerHTML,而 skill 文件与模型输出都不可信
 * (skill 里可以夹带让模型吐 HTML 的文字)。所以原始 HTML 一律转义成文本,
 * 链接只放行 http(s) / mailto / 站内相对地址,图片只放行 http(s)。
 */

import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import { marked, type Tokens } from "marked";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_LINK = /^(https?:|mailto:|#|\/(?!\/)|\.{1,2}\/)/i;
const SAFE_IMAGE = /^https?:/i;

/** 放行的地址原样返回,其余(javascript:、data:、vbscript: 等)返回 null。 */
export function safeHref(href: string, image = false): string | null {
  const trimmed = href.trim();
  // 去掉控制字符与空白后再判协议,防 "java\tscript:" 之类绕过
  const probe = Array.from(trimmed)
    .filter((c) => c.charCodeAt(0) > 0x20)
    .join("");
  return (image ? SAFE_IMAGE : SAFE_LINK).test(probe) ? trimmed : null;
}

marked.use({
  renderer: {
    code(token: Tokens.Code): string {
      const lang = token.lang !== undefined && hljs.getLanguage(token.lang) ? token.lang : "plaintext";
      const html = hljs.highlight(token.text, { language: lang }).value;
      return "<pre><code class='hljs language-" + lang + "'>" + html + "</code></pre>";
    },
    html(token: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(token.text);
    },
    link(token: Tokens.Link): string {
      const text = this.parser.parseInline(token.tokens);
      const href = safeHref(token.href);
      if (href === null) return text;
      const title = token.title ? ' title="' + escapeHtml(token.title) + '"' : "";
      const external = /^https?:/i.test(href) ? ' target="_blank" rel="noreferrer noopener"' : "";
      return '<a href="' + escapeHtml(href) + '"' + title + external + ">" + text + "</a>";
    },
    image(token: Tokens.Image): string {
      const href = safeHref(token.href, true);
      if (href === null) return escapeHtml(token.text);
      const title = token.title ? ' title="' + escapeHtml(token.title) + '"' : "";
      return '<img src="' + escapeHtml(href) + '" alt="' + escapeHtml(token.text) + '"' + title + ' loading="lazy" />';
    },
  },
});

/** 预览时去掉开头的 YAML frontmatter(元信息已在页面上单独展示);编辑时不要用。 */
export function stripFrontmatter(md: string): string {
  const m = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(md);
  return m === null ? md : md.slice(m[0].length).replace(/^\s*\n/, "");
}

export function renderMarkdown(md: string): string {
  return marked.parse(md) as string;
}
