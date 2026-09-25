import { describe, expect, it } from "vitest";
import { renderMarkdown, safeHref, stripFrontmatter } from "./markdown.js";

describe("renderMarkdown 安全", () => {
  it("原始 HTML 转义成文本", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("javascript: 链接只留文字;http 链接新窗口打开", () => {
    expect(renderMarkdown("[点我](javascript:alert(1))")).not.toContain("href");
    const ok = renderMarkdown("[文档](https://example.com)");
    expect(ok).toContain('href="https://example.com"');
    expect(ok).toContain('rel="noreferrer noopener"');
  });

  it("safeHref 防协议绕过;图片只放行 http(s)", () => {
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("/api/skills")).toBe("/api/skills");
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("data:image/png;base64,xx", true)).toBeNull();
    expect(safeHref("https://a.example/x.png", true)).toBe("https://a.example/x.png");
  });

  it("stripFrontmatter 只去开头的 YAML 块", () => {
    expect(stripFrontmatter("---\nname: a\ndescription: b\n---\n\n# 标题\n")).toBe("# 标题\n");
    expect(stripFrontmatter("# 没有 frontmatter\n---\n")).toBe("# 没有 frontmatter\n---\n");
  });

  it("代码块仍高亮,普通 markdown 不受影响", () => {
    expect(renderMarkdown("```ts\nconst a = 1\n```")).toContain("hljs");
    expect(renderMarkdown("**粗体**")).toContain("<strong>粗体</strong>");
  });
});
