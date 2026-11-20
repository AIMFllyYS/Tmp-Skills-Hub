import { describe, expect, it } from "vitest";
import {
  buildConflictAgentPrompt,
  formatConflictBytes,
  isActiveConflictVariant,
  selectConflictTarget,
  validateSplitSkillName,
  type ConflictRecordView,
} from "./types.js";

function makeConflict(overrides: Partial<ConflictRecordView> = {}): ConflictRecordView {
  return {
    skillName: "code-review",
    activeHash: "abc1234567890000111122223333",
    variants: [
      {
        variantId: "abc123456789",
        hash: "abc1234567890000111122223333",
        sourceClients: ["claude"],
        maxMtimeMs: 1_760_000_000_000,
        fileCount: 3,
        totalBytes: 4096,
        detectedAt: "2026-11-20T10:00:00Z",
        isActive: true,
      },
      {
        variantId: "def987654321",
        hash: "def9876543219999888877776666",
        sourceClients: ["codex", "cursor"],
        maxMtimeMs: 1_759_900_000_000,
        fileCount: 4,
        totalBytes: 6144,
        detectedAt: "2026-11-20T10:00:00Z",
      },
    ],
    shorterContentWarning: false,
    createdAt: "2026-11-20T10:00:00Z",
    updatedAt: "2026-11-20T10:05:00Z",
    ...overrides,
  };
}

it("falls back to the next available skill and its non-active variant after resolution", () => {
  const first = makeConflict();
  const next = makeConflict({ skillName: "deploy" });
  expect(selectConflictTarget([first, next], { skillName: "deploy", variantId: "def987654321" })).toEqual({
    record: next, variantId: "def987654321",
  });
  expect(selectConflictTarget([next], { skillName: "code-review", variantId: "removed" })).toEqual({
    record: next, variantId: "def987654321",
  });
  expect(selectConflictTarget([], { skillName: "deploy", variantId: "def987654321" })).toEqual({ record: null, variantId: null });
});

describe("buildConflictAgentPrompt", () => {
  it("包含冲突 Skill 名、工具指导与所有变体摘要", () => {
    const prompt = buildConflictAgentPrompt(makeConflict());

    expect(prompt).toContain("code-review");
    expect(prompt).toContain("abc123456789");
    expect(prompt).toContain("def987654321");
    expect(prompt).toContain("codex, cursor");
    expect(prompt).toContain("当前真源");
    expect(prompt).toContain("冲突变体");
    expect(prompt).toContain("diff_conflict_variants");
    expect(prompt).toContain("read_conflict_file");
    expect(prompt).toContain("apply_conflict_resolution");
    expect(prompt).not.toContain("shorterContentWarning");
  });

  it("在 shorterContentWarning 为 true 时追加防误删提醒", () => {
    const prompt = buildConflictAgentPrompt(makeConflict({ shorterContentWarning: true }));

    expect(prompt).toContain("shorterContentWarning");
    expect(prompt).toContain("较新版本字节数少于较早版本");
  });

  it("兼容 variants 仅包含非活跃变体的情况", () => {
    const prompt = buildConflictAgentPrompt(
      makeConflict({
        variants: [
          {
            variantId: "def987654321",
            hash: "def9876543219999888877776666",
            sourceClients: ["codex"],
            maxMtimeMs: 1_759_900_000_000,
            fileCount: 2,
            totalBytes: 512,
            detectedAt: "2026-11-20T10:00:00Z",
          },
        ],
      }),
    );

    expect(prompt).toContain("abc123456789");
    expect(prompt).toContain("def987654321");
    expect(prompt).toContain("512 B");
  });
});

describe("validateSplitSkillName & helpers", () => {
  it("接受合法 kebab-case 名称并拒绝非法名称与重名", () => {
    expect(validateSplitSkillName("code-review-v2", "code-review")).toBeNull();
    expect(validateSplitSkillName("my123", "code-review")).toBeNull();
    expect(validateSplitSkillName("", "code-review")).not.toBeNull();
    expect(validateSplitSkillName("   ", "code-review")).not.toBeNull();
    expect(validateSplitSkillName("CodeReview", "code-review")).not.toBeNull();
    expect(validateSplitSkillName("-leading", "code-review")).not.toBeNull();
    expect(validateSplitSkillName("has_underscore", "code-review")).not.toBeNull();
    expect(validateSplitSkillName("code-review", "code-review")).toContain("同名");
  });

  it("正确判定活跃变体与格式化体积", () => {
    const conflict = makeConflict();
    expect(isActiveConflictVariant(conflict.variants[0]!, conflict.activeHash)).toBe(true);
    expect(isActiveConflictVariant(conflict.variants[1]!, conflict.activeHash)).toBe(false);
    expect(formatConflictBytes(512)).toBe("512 B");
    expect(formatConflictBytes(2048)).toBe("2.0 KB");
  });
});
