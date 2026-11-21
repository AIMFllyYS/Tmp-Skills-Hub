import { describe, expect, it } from "vitest";
import { formatBytes, validateMigrateTargetPath } from "../shell/SettingsV3Panels.js";
import {
  countReconcilePreviewActions,
  formatReconcileBannerCopy,
  formatReconcileMtime,
  hasReconcileActionableItems,
  type ReconcilePreviewData,
  type ReconcileScanSummary,
} from "./types.js";

function makeSummary(overrides: Partial<ReconcileScanSummary> = {}): ReconcileScanSummary {
  return {
    clientsScanned: 6,
    managedLinks: 42,
    unmanagedRealDirs: 0,
    replacedLinks: 0,
    newConflicts: 0,
    externalSymlinks: 0,
    danglingLinks: 0,
    nonSkillEntries: 2,
    ...overrides,
  };
}

function makePreview(overrides: Partial<ReconcilePreviewData> = {}): ReconcilePreviewData {
  return {
    backupRequired: true,
    backupDir: "~/.skills-hub/backups",
    skillsRoot: "~/.skills-hub/skills",
    toAdopt: [],
    toRelinkIdentical: [],
    conflicts: [],
    skippedExternalLinks: [],
    untouchedNonSkill: [],
    ...overrides,
  };
}

describe("formatBytes", () => {
  it("非正数与异常数值安全返回 0 B", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-512)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
    expect(formatBytes(Number.NEGATIVE_INFINITY)).toBe("0 B");
  });

  it("按 1024 进制格式化 B / KB / MB / GB / TB", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(100 * 1024)).toBe("100 KB");
    expect(formatBytes(18.4 * 1024 * 1024)).toBe("18.4 MB");
    expect(formatBytes(2.5 * 1024 ** 3)).toBe("2.5 GB");
    expect(formatBytes(1.2 * 1024 ** 4)).toBe("1.2 TB");
    expect(formatBytes(250 * 1024 ** 4)).toBe("250 TB");
  });
});

describe("validateMigrateTargetPath", () => {
  it("拒绝空路径、相对路径与裸根目录", () => {
    expect(validateMigrateTargetPath("", "C:\\Users\\a\\.skills-hub\\skills")).not.toBeNull();
    expect(validateMigrateTargetPath("   ", "C:\\Users\\a\\.skills-hub\\skills")).not.toBeNull();
    expect(validateMigrateTargetPath("./skills", "C:\\Users\\a\\.skills-hub\\skills")).not.toBeNull();
    expect(validateMigrateTargetPath("skills", "C:\\Users\\a\\.skills-hub\\skills")).not.toBeNull();
    expect(validateMigrateTargetPath("D:\\", "C:\\Users\\a\\.skills-hub\\skills")).not.toBeNull();
    expect(validateMigrateTargetPath("/", "/Users/a/.skills-hub/skills")).not.toBeNull();
  });

  it("拒绝与当前真源目录等价的路径（含尾斜杠与 Windows 大小写）", () => {
    expect(
      validateMigrateTargetPath("c:/users/alice/.skills-hub/skills/", "C:\\Users\\Alice\\.skills-hub\\skills"),
    ).toBe("目标路径不能与当前技能文件夹相同");
    expect(
      validateMigrateTargetPath("/Users/alice/.skills-hub/skills/", "/Users/alice/.skills-hub/skills"),
    ).toBe("目标路径不能与当前技能文件夹相同");
  });

  it("接受合法的 Windows 盘符、UNC 与 POSIX 绝对路径", () => {
    expect(validateMigrateTargetPath("D:\\skills-hub\\skills", "C:\\Users\\a\\.skills-hub\\skills")).toBeNull();
    expect(validateMigrateTargetPath("\\\\nas\\team\\skills", "C:\\Users\\a\\.skills-hub\\skills")).toBeNull();
    expect(validateMigrateTargetPath("/opt/skills-hub/skills", "/Users/a/.skills-hub/skills")).toBeNull();
  });
});

describe("hasReconcileActionableItems", () => {
  it("空值或全部待处理计数为 0 时返回 false（即便存在外部软链或悬空台账）", () => {
    expect(hasReconcileActionableItems(null)).toBe(false);
    expect(hasReconcileActionableItems(undefined)).toBe(false);
    expect(
      hasReconcileActionableItems(
        makeSummary({
          externalSymlinks: 3,
          danglingLinks: 2,
          nonSkillEntries: 5,
        }),
      ),
    ).toBe(false);
  });

  it("任一未接管真目录、覆写软链或冲突大于 0 时返回 true", () => {
    expect(hasReconcileActionableItems(makeSummary({ unmanagedRealDirs: 1 }))).toBe(true);
    expect(hasReconcileActionableItems(makeSummary({ replacedLinks: 2 }))).toBe(true);
    expect(hasReconcileActionableItems(makeSummary({ newConflicts: 1 }))).toBe(true);
  });
});

describe("formatReconcileBannerCopy", () => {
  it("存在冲突时使用 warning 语义并提示数量与零丢失留底", () => {
    const copy = formatReconcileBannerCopy(
      makeSummary({
        unmanagedRealDirs: 5,
        replacedLinks: 2,
        newConflicts: 3,
        externalSymlinks: 1,
      }),
    );
    expect(copy.tone).toBe("warning");
    expect(copy.title).toContain("7 个本地未接管 Skill");
    expect(copy.title).toContain("3 个存在同名版本冲突");
    expect(copy.description).toContain("5 个野生真目录");
    expect(copy.description).toContain("2 个被覆写链接");
    expect(copy.description).toContain("~/.skills-hub/backups/");
    expect(copy.description).toContain("1 个外部托管软链接");
  });

  it("无冲突但有未接管真目录时使用 neutral 语义", () => {
    const copy = formatReconcileBannerCopy(makeSummary({ unmanagedRealDirs: 4 }));
    expect(copy.tone).toBe("neutral");
    expect(copy.title).toContain("4 个本地新增/未接管 Skill");
    expect(copy.description).toContain("复制到技能文件夹");
    expect(copy.description).toContain("更新客户端链接");
  });

  it("仅有被覆写受管链接时给出精准提示", () => {
    const copy = formatReconcileBannerCopy(makeSummary({ replacedLinks: 3 }));
    expect(copy.tone).toBe("neutral");
    expect(copy.title).toContain("3 个受管软链接被替换为真实目录");
  });

  it("仅有冲突时仍走 warning 且提示冲突数量", () => {
    const copy = formatReconcileBannerCopy(makeSummary({ newConflicts: 2 }));
    expect(copy.tone).toBe("warning");
    expect(copy.title).toContain("2 个同名多版本 Skill 冲突");
  });

  it("全部健康时返回中性无待处理文案", () => {
    const copy = formatReconcileBannerCopy(makeSummary());
    expect(copy.tone).toBe("neutral");
    expect(copy.title).toContain("受管纯软链接");
  });
});

describe("formatReconcileMtime & countReconcilePreviewActions", () => {
  it("格式化有效 UTC 时间戳并兜底非法输入", () => {
    expect(formatReconcileMtime(0, true)).toBe("未知时间");
    expect(formatReconcileMtime(-100, true)).toBe("未知时间");
    expect(formatReconcileMtime(Number.NaN, true)).toBe("未知时间");
    expect(formatReconcileMtime(Date.UTC(2026, 10, 20, 14, 5), true)).toBe("2026-11-20 14:05");
  });

  it("按是否勾选外部软链接准确汇总待处理条目数", () => {
    expect(countReconcilePreviewActions(null, false)).toBe(0);
    const preview = makePreview({
      toAdopt: [
        {
          skillName: "code-video-craft",
          action: "adopt",
          sourceClients: ["codex"],
          hash: "abc123def456",
          fileCount: 8,
          totalBytes: 24576,
        },
      ],
      toRelinkIdentical: [
        {
          skillName: "hyperframes",
          action: "relink-identical",
          sourceClients: ["claude-code"],
          replacesBrokenLink: true,
          hash: "def456abc123",
          fileCount: 3,
          totalBytes: 4096,
        },
      ],
      conflicts: [
        {
          skillName: "gb-standard-docx-pdf",
          provisionalWinnerClient: "codex",
          maxMtimeMs: Date.UTC(2026, 10, 20, 12, 0),
          variantCount: 2,
          shorterContentWarning: true,
          involvedClients: ["codex", "claude-code"],
        },
      ],
      skippedExternalLinks: [
        {
          skillName: "ego-browser",
          clientId: "codex",
          linkPath: "~/.codex/skills/ego-browser",
          targetPath: "D:/tools/ego-browser",
          validSkill: true,
        },
      ],
    });
    expect(countReconcilePreviewActions(preview, false)).toBe(3);
    expect(countReconcilePreviewActions(preview, true)).toBe(4);
  });
});
