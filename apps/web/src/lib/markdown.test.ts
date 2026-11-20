// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown.js";

describe("renderMarkdown", () => {
  it("剥离 <script> 与 inline 事件处理器等 XSS 载荷", () => {
    const html = renderMarkdown(
      [
        "# Hello",
        "",
        '<script>alert("xss")</script>',
        "",
        '<img src="https://example.com/a.png" onerror="alert(1)" />',
        "",
        '<svg onload="alert(2)"><circle /></svg>',
        "",
        '<div onclick="alert(3)">safe text</div>',
      ].join("\n"),
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onload");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<svg");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("safe text");
  });

  it("剥离 javascript:/vbscript:/data:text/html 等危险链接协议", () => {
    const html = renderMarkdown(
      [
        "[js](javascript:alert(1))",
        "[vbs](vbscript:msgbox(1))",
        "[data](data:text/html,<script>alert(1)</script>)",
        '<a href="JaVaScRiPt:alert(2)" onclick="steal()">mixed</a>',
      ].join("\n"),
    );

    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/vbscript:/i);
    expect(html).not.toMatch(/data:text\/html/i);
    expect(html).not.toContain("onclick");
    expect(html).toContain("js");
    expect(html).toContain("mixed");
  });

  it("为外部 https/http 链接自动添加 target=_blank 与 rel=noopener noreferrer", () => {
    const html = renderMarkdown(
      "[Docs](https://example.com/docs) and [Local](./SKILL.md)",
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(doc.querySelectorAll("a"));
    expect(links).toHaveLength(2);

    const ext = links[0];
    expect(ext?.getAttribute("href")).toBe("https://example.com/docs");
    expect(ext?.getAttribute("target")).toBe("_blank");
    expect(ext?.getAttribute("rel")).toBe("noopener noreferrer");

    const local = links[1];
    expect(local?.getAttribute("href")).toBe("./SKILL.md");
    expect(local?.getAttribute("target")).toBeNull();
  });

  it("正确渲染安全 Markdown 标题、代码块与高亮类名", () => {
    const html = renderMarkdown(
      [
        "## Title",
        "",
        "Paragraph with `inline()`.",
        "",
        "```ts",
        "const answer = 42;",
        "```",
      ].join("\n"),
    );

    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<code>inline()</code>");
    expect(html).toContain("language-ts");
    expect(html).toContain("hljs");
    expect(html).toContain("42");
  });
});
