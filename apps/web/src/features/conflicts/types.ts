import type { UnifiedDiffFile } from "@/components/ui/diff-viewer";

/** 单个冲突变体的只读视图（对齐 PRD §3.2 T2.2 ConflictVariant 契约）。 */
export interface ConflictVariantView {
  variantId: string;
  hash: string;
  sourceClients: string[];
  maxMtimeMs: number;
  fileCount: number;
  totalBytes: number;
  detectedAt: string;
  isActive?: boolean;
}

/** 单个同名 Skill 的多版本冲突记录视图（对齐 PRD §3.2 T2.2 ConflictRecord 契约）。 */
export interface ConflictRecordView {
  skillName: string;
  activeHash: string;
  variants: ConflictVariantView[];
  shorterContentWarning: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 两个冲突变体之间的逐文件 Unified Diff 载荷。 */
export interface ConflictDiffData {
  skillName: string;
  variantA: string;
  variantB: string;
  files: UnifiedDiffFile[];
}

/** 冲突工作区支持的人工/智能解决动作枚举。 */
export type ConflictResolveAction = "pick" | "split" | "handoff-agent";

/** 拆分独立 Skill 时的合法英文 kebab-case 名称正则。 */
export const SPLIT_SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/** 判断某个变体是否代表当前唯一真源。 */
export function isActiveConflictVariant(
  variant: ConflictVariantView,
  activeHash: string,
): boolean {
  return variant.isActive === true || variant.hash === activeHash;
}

/** 校验拆分后新 Skill 名称是否符合 kebab-case 规范且不与原名冲突。 */
export function validateSplitSkillName(
  name: string,
  currentSkillName?: string,
): string | null {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "请输入新的英文 Skill 名称";
  }
  if (trimmed.length > 64) {
    return "名称不能超过 64 个字符";
  }
  if (!SPLIT_SKILL_NAME_RE.test(trimmed)) {
    return "仅支持小写英文字母、数字与连字符（例如 my-skill-v2）";
  }
  if (currentSkillName !== undefined && trimmed === currentSkillName) {
    return "新名称不能与当前冲突 Skill 同名";
  }
  return null;
}

/** 将字节数格式化为紧凑可读体积。 */
export function formatConflictBytes(bytes: number): string {
  if (bytes < 1024) return String(bytes) + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/** 将毫秒时间戳或 ISO 字符串格式化为 YYYY-MM-DD HH:mm。 */
export function formatConflictTime(input: number | string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return typeof input === "string" ? input : "-";
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    String(date.getFullYear()) +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

/**
 * 构造交给面板内置 Agent 的冲突分析与合并提示词。
 * 明确引导 Agent 先调用 diff_conflict_variants 与 read_conflict_file 核查内容，
 * 再给出结论并发起受审批保护的 apply_conflict_resolution。
 */
export function buildConflictAgentPrompt(conflict: ConflictRecordView): string {
  const activePrefix = conflict.activeHash.slice(0, 12);
  const variantLines = conflict.variants.map((variant) => {
    const role = isActiveConflictVariant(variant, conflict.activeHash) ? "当前真源" : "冲突变体";
    const clients = variant.sourceClients.length > 0 ? variant.sourceClients.join(", ") : "未知来源";
    return (
      "- " +
      variant.variantId +
      "（" +
      role +
      "，来源：" +
      clients +
      "，" +
      String(variant.fileCount) +
      " 个文件，" +
      formatConflictBytes(variant.totalBytes) +
      "）"
    );
  });

  const warningLine = conflict.shorterContentWarning
    ? "\n注意：系统检测到较新版本字节数少于较早版本（shorterContentWarning），请重点检查是否存在内容误删或未写完的情况。"
    : "";

  return [
    "请帮我分析并处理 Skill「" + conflict.skillName + "」的同名多版本冲突（当前暂定真源哈希：" + activePrefix + "）。",
    variantLines.length > 0 ? "当前冲突变体概况：\n" + variantLines.join("\n") : "",
    warningLine.trim(),
    "请严格按以下步骤执行：",
    "1. 先调用 diff_conflict_variants 对比当前真源（active）与各冲突变体的逐文件差异；",
    "2. 对有实质改动的 SKILL.md 及关键脚本调用 read_conflict_file 阅读完整上下文；",
    "3. 判断属于「某版本为完整超集可直接 pick」、「两份功能独立适合 split」还是「多端各有增量经验需要融合 merge」，用中文简明说明差异摘要与推荐理由；",
    "4. 给出方案后调用 apply_conflict_resolution 提交决议，等待我审批后再落盘。",
  ]
    .filter((section) => section !== "")
    .join("\n\n");
}
