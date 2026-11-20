import { describe, expect, it } from "vitest";
import { formatCommitTimestamp, validateRepoName } from "./types.js";

describe("validateRepoName", () => {
  it("接受合法的 GitHub 仓库名称", () => {
    expect(validateRepoName("my-skills-hub-backup")).toBeNull();
    expect(validateRepoName("skills_backup.v1")).toBeNull();
    expect(validateRepoName("SkillsHub2026")).toBeNull();
    expect(validateRepoName("a")).toBeNull();
  });

  it("拒绝空字符串与包含空白字符的名称", () => {
    expect(validateRepoName("")).toBe("请输入仓库名称");
    expect(validateRepoName("   ")).toBe("请输入仓库名称");
    expect(validateRepoName("my skills")).toContain("空格");
    expect(validateRepoName(" my-skills")).toContain("空格");
    expect(validateRepoName("my-skills ")).toContain("空格");
  });

  it("拒绝非法字符、边界点/连字符、.git 后缀与超长名称", () => {
    expect(validateRepoName("我的仓库")).not.toBeNull();
    expect(validateRepoName("owner/repo")).not.toBeNull();
    expect(validateRepoName(".")).toContain("点");
    expect(validateRepoName("..")).toContain("点");
    expect(validateRepoName(".hidden")).toContain("点");
    expect(validateRepoName("repo.")).toContain("点");
    expect(validateRepoName("-repo")).toContain("连字符");
    expect(validateRepoName("repo-")).toContain("连字符");
    expect(validateRepoName("skills.git")).toContain(".git");
    expect(validateRepoName("skills.GIT")).toContain(".git");
    expect(validateRepoName("a".repeat(101))).toContain("100");
  });
});

describe("formatCommitTimestamp", () => {
  it("正确格式化相对时间与绝对日期，无效字符串原样回退", () => {
    const base = Date.parse("2026-11-20T12:00:00Z");
    expect(formatCommitTimestamp("2026-11-20T11:59:30Z", base)).toBe("刚刚");
    expect(formatCommitTimestamp("2026-11-20T11:45:00Z", base)).toBe("15 分钟前");
    expect(formatCommitTimestamp("2026-11-20T09:00:00Z", base)).toBe("3 小时前");
    expect(formatCommitTimestamp("2026-11-18T12:00:00Z", base)).toBe("2 天前");
    expect(formatCommitTimestamp("2026-10-01T08:05:00Z", base)).toMatch(/^2026-10-01 \d{2}:\d{2}$/);
    expect(formatCommitTimestamp("not-a-date", base)).toBe("not-a-date");
  });
});
