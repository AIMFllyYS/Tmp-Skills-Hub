/**
 * v0.3 客户端巡检与纯软链接接管（Reconcile）前端契约类型与纯函数。
 * 口径对齐 docs/specs/single-source-sync-and-versioning/PRD.md#L168-L270。
 */

export interface ReconcileScanSummary {
  /** 本次 L1 扫描覆盖的客户端目录总数 */
  clientsScanned: number;
  /** 已正确指向唯一真源且在 links.json 登记的受管软链接数 */
  managedLinks: number;
  /** 客户端中发现的未接管真实目录数（unmanaged-real-dir） */
  unmanagedRealDirs: number;
  /** 原受管软链接被外部覆写为真实目录的数量（replaced-link-real-dir） */
  replacedLinks: number;
  /** 同名多版本冲突数量（name-conflict） */
  newConflicts: number;
  /** 指向唯一真源之外的外部托管软链接数（external-symlink） */
  externalSymlinks: number;
  /** links.json 中失效的悬空链接数（dangling-link） */
  danglingLinks: number;
  /** 跳过的系统保留目录或非 skill 条目数（non-skill-entry） */
  nonSkillEntries: number;
  /** 本次 L1 扫描耗时（毫秒） */
  scanDurationMs?: number;
  /** 扫描时间（ISO 8601） */
  scannedAt?: string;
}

export type ReconcileAdoptAction = "adopt" | "relink-identical";

export interface ReconcileNewSkillItem {
  skillName: string;
  /** adopt = 新收录入唯一真源并换纯软链；relink-identical = 与真源同内容，仅安全替换软链 */
  action: ReconcileAdoptAction;
  /** 发现该真目录的客户端 ID 列表 */
  sourceClients: readonly string[];
  /** 是否修复被外部覆写为真实目录的受管软链（replaced-link-real-dir） */
  replacesBrokenLink?: boolean;
  /** 内容哈希（完整 SHA-256 或前 12 位摘要） */
  hash: string;
  fileCount: number;
  totalBytes: number;
  maxMtimeMs?: number;
}

export interface ReconcileConflictVariantPreview {
  variantId: string;
  hash: string;
  sourceClients: readonly string[];
  maxMtimeMs: number;
  fileCount: number;
  totalBytes: number;
  isProvisionalWinner?: boolean;
}

export interface ReconcileConflictPreviewItem {
  skillName: string;
  /** 按目录内有效文件 maxMtime 暂定为唯一真源的来源客户端（如 "codex" 或 "store"） */
  provisionalWinnerClient: string;
  /** 暂定赢家变体 ID（hash 前 12 位） */
  provisionalWinnerVariantId?: string;
  /** 暂定赢家目录内所有有效文件的最大修改时间戳（epoch ms） */
  maxMtimeMs: number;
  /** 本次涉及的不同内容变体总数 */
  variantCount: number;
  /** 最新变体体积 < 其他变体 65% 或时间差 < 10 秒时触发，防范 Windows 复制 mtime 欺骗 */
  shorterContentWarning: boolean;
  /** 涉及的客户端或真源标签列表（如 ["codex", "claude-code", "store"]） */
  involvedClients: readonly string[];
  /** 可选变体明细列表 */
  variants?: readonly ReconcileConflictVariantPreview[];
}

export interface ReconcileExternalLinkItem {
  skillName: string;
  clientId: string;
  linkPath: string;
  targetPath: string;
  /** 外部目标是否包含合法 SKILL.md */
  validSkill?: boolean;
}

export type ReconcileUntouchedReason =
  | "system-dir"
  | "non-skill-file"
  | "incomplete-skill"
  | "ignored";

export interface ReconcileUntouchedEntry {
  name: string;
  clientId: string;
  path?: string;
  reason: ReconcileUntouchedReason;
}

export interface ReconcilePreviewData {
  backupRequired: boolean;
  backupDir: string;
  skillsRoot: string;
  toAdopt: readonly ReconcileNewSkillItem[];
  toRelinkIdentical: readonly ReconcileNewSkillItem[];
  conflicts: readonly ReconcileConflictPreviewItem[];
  skippedExternalLinks: readonly ReconcileExternalLinkItem[];
  untouchedNonSkill: readonly ReconcileUntouchedEntry[];
  danglingToPrune?: number;
}

export interface ReconcileApplyFailure {
  clientId: string;
  skillName: string;
  reason: string;
  rolledBack: boolean;
}

export interface ReconcileApplyResult {
  snapshotId: string;
  backupVerified: boolean;
  adoptedCount: number;
  relinkedCount: number;
  linksCreated: number;
  conflictCount: number;
  externalLinksAdopted: number;
  skippedExternalLinks: number;
  danglingPruned: number;
  failures?: readonly ReconcileApplyFailure[];
}

export interface ReconcileBannerCopy {
  tone: "warning" | "neutral";
  title: string;
  description: string;
}

/** 判断本次扫描摘要是否存在需要用户介入接管或处理的条目。 */
export function hasReconcileActionableItems(
  summary: ReconcileScanSummary | null | undefined,
): summary is ReconcileScanSummary {
  if (summary === null || summary === undefined) return false;
  return summary.unmanagedRealDirs > 0 || summary.replacedLinks > 0 || summary.newConflicts > 0;
}

/** 根据扫描摘要生成非阻塞提醒横幅的语义级别与克制文案。 */
export function formatReconcileBannerCopy(summary: ReconcileScanSummary): ReconcileBannerCopy {
  const unmanaged = Math.max(0, summary.unmanagedRealDirs);
  const replaced = Math.max(0, summary.replacedLinks);
  const conflicts = Math.max(0, summary.newConflicts);
  const external = Math.max(0, summary.externalSymlinks);
  const actionableDirs = unmanaged + replaced;
  const tone: "warning" | "neutral" = conflicts > 0 ? "warning" : "neutral";

  let title: string;
  if (actionableDirs > 0 && conflicts > 0) {
    title =
      "检测到 " +
      String(actionableDirs) +
      " 个本地未接管 Skill（其中 " +
      String(conflicts) +
      " 个存在同名版本冲突）";
  } else if (unmanaged === 0 && replaced > 0) {
    title = "检测到 " + String(replaced) + " 个受管软链接被替换为真实目录";
  } else if (actionableDirs > 0) {
    title = "检测到 " + String(actionableDirs) + " 个本地新增/未接管 Skill";
  } else if (conflicts > 0) {
    title = "检测到 " + String(conflicts) + " 个同名多版本 Skill 冲突";
  } else {
    title = "所有客户端目录均为受管纯软链接";
  }

  const parts: string[] = [];
  if (unmanaged > 0 && replaced > 0) {
    parts.push("包含 " + String(unmanaged) + " 个野生真目录与 " + String(replaced) + " 个被覆写链接。");
  }
  if (conflicts > 0) {
    parts.push("合并前将自动备份至 ~/.skills-hub/backups/，全部冲突异版零丢失留存冲突中心。");
  } else if (actionableDirs > 0) {
    parts.push("建议先备份，再把选中的技能复制到技能文件夹，并更新客户端链接。");
  } else {
    parts.push("未发现待接管的野生真目录或同名版本冲突。");
  }
  if ((actionableDirs > 0 || conflicts > 0) && external > 0) {
    parts.push("另有 " + String(external) + " 个外部托管软链接默认保持不动。");
  }

  return {
    tone,
    title,
    description: parts.join(""),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 将目录有效文件 maxMtimeMs 格式化为紧凑可读时间戳（YYYY-MM-DD HH:mm）。 */
export function formatReconcileMtime(mtimeMs: number, useUtc = false): string {
  if (!Number.isFinite(mtimeMs) || mtimeMs <= 0) return "未知时间";
  const d = new Date(mtimeMs);
  if (Number.isNaN(d.getTime())) return "未知时间";
  const year = useUtc ? d.getUTCFullYear() : d.getFullYear();
  const month = (useUtc ? d.getUTCMonth() : d.getMonth()) + 1;
  const day = useUtc ? d.getUTCDate() : d.getDate();
  const hours = useUtc ? d.getUTCHours() : d.getHours();
  const minutes = useUtc ? d.getUTCMinutes() : d.getMinutes();
  return (
    String(year) +
    "-" +
    pad2(month) +
    "-" +
    pad2(day) +
    " " +
    pad2(hours) +
    ":" +
    pad2(minutes)
  );
}

/** 计算预览计划中本次将被执行接管或换链的条目总数。 */
export function countReconcilePreviewActions(
  preview: ReconcilePreviewData | null,
  includeExternalLinks: boolean,
): number {
  if (preview === null) return 0;
  return (
    preview.toAdopt.length +
    preview.toRelinkIdentical.length +
    preview.conflicts.length +
    (includeExternalLinks ? preview.skippedExternalLinks.length : 0)
  );
}
