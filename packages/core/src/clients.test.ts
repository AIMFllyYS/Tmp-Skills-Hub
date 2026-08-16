import path from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_CLIENTS, resolveSkillsDir } from "./clients.js";

/**
 * resolveSkillsDir 的 home 显式化:core 内部不得自行决定写入位置,
 * 不同 home 必须解析出完全不同的目录(沙箱重定向的根基)。
 */

describe("resolveSkillsDir", () => {
  it("global 范围:不同 home 解析出不同目录", () => {
    const a = resolveSkillsDir(KNOWN_CLIENTS[0]!, "global", "C:\\sandbox-home-a");
    const b = resolveSkillsDir(KNOWN_CLIENTS[0]!, "global", "C:\\sandbox-home-b");
    expect(a).not.toBe(b);
  });

  it("global 范围:解析结果 = home + 客户端相对目录", () => {
    const home = "D:/fake-home";
    const dir = resolveSkillsDir({ id: "claude", relativeSkillsDir: ".claude/skills" }, "global", home);
    expect(dir).toBe(path.join(home, ".claude/skills"));
  });

  it("project 范围:使用 projectRoot 而非 home", () => {
    const dir = resolveSkillsDir(KNOWN_CLIENTS[0]!, "project", "C:\\home", "D:\\proj");
    expect(dir.startsWith(path.join("D:\\proj"))).toBe(true);
    expect(dir).not.toContain("home");
  });

  it("project 范围缺 projectRoot 时报错", () => {
    expect(() => resolveSkillsDir(KNOWN_CLIENTS[0]!, "project", "C:\\home")).toThrow(/projectRoot/);
  });

  it("KNOWN_CLIENTS 的目录约定相对 home,不包含绝对路径", () => {
    for (const client of KNOWN_CLIENTS) {
      expect(client.relativeSkillsDir.startsWith("/")).toBe(false);
      expect(client.relativeSkillsDir.startsWith("\\")).toBe(false);
      expect(/^[A-Za-z]:/.test(client.relativeSkillsDir)).toBe(false);
    }
  });
});
