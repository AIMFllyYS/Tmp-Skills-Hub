/**
 * 工具元数据注册表(ui-design-v2 §9):把工具名翻成给人看的动作、参数摘要与结果摘要。
 * 纯函数,输入输出都是 unknown(web 不 import cli 的 Zod schema),读不到就返回空串。
 */

export type ToolKind = "read" | "write" | "plan";

export type ToolIconName =
  | "library"
  | "file"
  | "scan"
  | "folder"
  | "archive"
  | "history"
  | "stethoscope"
  | "shield"
  | "sparkles"
  | "list"
  | "link"
  | "unlink"
  | "download"
  | "share"
  | "pen"
  | "check"
  | "trash"
  | "restore"
  | "users"
  | "wrench";

export interface ToolMeta {
  label: string;
  icon: ToolIconName;
  kind: ToolKind;
  /** 审批卡上「将要做什么」的一句话。 */
  intent?: (input: unknown) => string;
  input: (input: unknown) => string;
  output: (output: unknown) => string;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function str(value: unknown, key: string): string {
  const v = field(value, key);
  return typeof v === "string" ? v : "";
}

function list(value: unknown, key: string): string[] {
  const v = field(value, key);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** 名单缩写:「a、b 等 5 个」。 */
export function names(items: string[], max = 2): string {
  if (items.length === 0) return "";
  const head = items.slice(0, max).join("、");
  return items.length > max ? head + " 等 " + String(items.length) + " 个" : head;
}

function countOf(output: unknown, unit: string): string {
  if (Array.isArray(output)) return String(output.length) + " " + unit;
  return failureOf(output);
}

/** 工具失败信封 { ok:false, message }。 */
export function failureOf(output: unknown): string {
  return field(output, "ok") === false ? str(output, "message") : "";
}

function okOr(output: unknown, text: string): string {
  const fail = failureOf(output);
  return fail !== "" ? fail : text;
}

const NONE = (): string => "";

const TOOL_META: Record<string, ToolMeta> = {
  list_skills: { label: "查看库存", icon: "library", kind: "read", input: NONE, output: (o) => countOf(o, "个 skill") },
  show_skill: { label: "查看 skill", icon: "file", kind: "read", input: (i) => str(i, "target"), output: (o) => okOr(o, str(o, "dirName")) },
  scan_clients: { label: "扫描客户端目录", icon: "scan", kind: "read", input: NONE, output: (o) => countOf(o, "个发现") },
  read_skill_file: {
    label: "读取文件",
    icon: "file",
    kind: "read",
    input: (i) => [str(i, "target"), str(i, "path")].filter((s) => s !== "").join(" / "),
    output: (o) => {
      const content = field(o, "content");
      return typeof content === "string" ? String(content.split("\n").length) + " 行" : failureOf(o);
    },
  },
  list_groups: { label: "查看分组", icon: "folder", kind: "read", input: NONE, output: (o) => countOf(field(o, "groups") ?? o, "个分组") },
  list_archive: { label: "查看归档区", icon: "archive", kind: "read", input: NONE, output: (o) => countOf(o, "项") },
  list_backups: { label: "查看备份快照", icon: "history", kind: "read", input: NONE, output: (o) => countOf(o, "份") },
  doctor: { label: "环境自检", icon: "stethoscope", kind: "read", input: NONE, output: (o) => okOr(o, "") },
  verify: { label: "校验哈希", icon: "shield", kind: "read", input: NONE, output: (o) => okOr(o, "") },
  analyze_skill: { label: "分析相近 / 冲突", icon: "sparkles", kind: "read", input: (i) => str(i, "target"), output: (o) => okOr(o, "") },
  update_plan: { label: "更新计划", icon: "list", kind: "plan", input: (i) => str(i, "title"), output: NONE },

  enable_skills: {
    label: "启用 skill",
    icon: "link",
    kind: "write",
    intent: (i) => "把 " + names(list(i, "targets")) + " 链接到 " + (str(i, "clientId") || "客户端"),
    input: (i) => names(list(i, "targets")) + " → " + str(i, "clientId"),
    output: (o) => okOr(o, "已启用"),
  },
  disable_skills: {
    label: "停用 skill",
    icon: "unlink",
    kind: "write",
    intent: (i) => "从 " + (str(i, "clientId") || "客户端") + " 摘掉 " + names(list(i, "targets")) + " 的链接(库存原件保留)",
    input: (i) => names(list(i, "targets")) + " ← " + str(i, "clientId"),
    output: (o) => okOr(o, "已停用"),
  },
  adopt_skill: {
    label: "收录进库存",
    icon: "download",
    kind: "write",
    intent: (i) => "把 " + (str(i, "source") || "来源") + " 复制进库存(不会移走原件)",
    input: (i) => str(i, "source"),
    output: (o) => {
      const n = field(o, "adopted");
      return typeof n === "number" ? "收录 " + String(n) + " 个" : Array.isArray(n) ? "收录 " + String(n.length) + " 个" : failureOf(o);
    },
  },
  archive_skill: {
    label: "归档",
    icon: "archive",
    kind: "write",
    intent: (i) => "把 " + str(i, "target") + " 移入归档区(可恢复)",
    input: (i) => str(i, "target"),
    output: (o) => okOr(o, "已归档"),
  },
  restore_archived: {
    label: "从归档恢复",
    icon: "restore",
    kind: "write",
    intent: (i) => "把归档里的 " + str(i, "name") + " 恢复到库存",
    input: (i) => str(i, "name"),
    output: (o) => okOr(o, "已恢复"),
  },
  share_skill: {
    label: "分享到共享仓库",
    icon: "share",
    kind: "write",
    intent: (i) => "把 " + str(i, "target") + " 推到" + (str(i, "repo") !== "" ? " " + str(i, "repo") : "授信仓库"),
    input: (i) => [str(i, "target"), str(i, "repo")].filter((s) => s !== "").join(" → "),
    output: (o) => okOr(o, "已推送"),
  },
  create_draft: {
    label: "创建草稿",
    icon: "pen",
    kind: "write",
    intent: (i) => "在库存里占名 " + str(i, "dirName") + " 并写入模板",
    input: (i) => str(i, "dirName"),
    output: (o) => okOr(o, "草稿已建"),
  },
  commit_draft: {
    label: "定稿草稿",
    icon: "check",
    kind: "write",
    intent: (i) => "把草稿 " + str(i, "dirName") + " 定稿进正式清单",
    input: (i) => str(i, "dirName"),
    output: (o) => okOr(o, "已定稿"),
  },
  discard_draft: {
    label: "放弃草稿",
    icon: "trash",
    kind: "write",
    intent: (i) => "放弃草稿 " + str(i, "dirName") + "(移入归档区)",
    input: (i) => str(i, "dirName"),
    output: (o) => okOr(o, "已放弃"),
  },
  write_skill_file: {
    label: "写入文件",
    icon: "pen",
    kind: "write",
    intent: (i) => "改写 " + str(i, "target") + " / " + str(i, "path") + "(内容变了会产生新哈希)",
    input: (i) => [str(i, "target"), str(i, "path")].filter((s) => s !== "").join(" / "),
    output: (o) => okOr(o, "已保存"),
  },
  group_create: {
    label: "创建分组",
    icon: "folder",
    kind: "write",
    intent: (i) => "新建分组 " + (str(i, "name") || str(i, "id")),
    input: (i) => str(i, "name") || str(i, "id"),
    output: (o) => okOr(o, "已创建"),
  },
  group_update: {
    label: "修改分组",
    icon: "folder",
    kind: "write",
    intent: (i) => "修改分组 " + str(i, "id"),
    input: (i) => str(i, "id"),
    output: (o) => okOr(o, "已更新"),
  },
  group_delete: {
    label: "删除分组",
    icon: "trash",
    kind: "write",
    intent: (i) => "删除分组定义 " + str(i, "id") + "(不删 skill)",
    input: (i) => str(i, "id"),
    output: (o) => okOr(o, "已删除"),
  },
  group_members: {
    label: "调整分组成员",
    icon: "users",
    kind: "write",
    intent: (i) => (str(i, "action") === "remove" ? "从分组 " + str(i, "id") + " 移除 " : "向分组 " + str(i, "id") + " 加入 ") + names(list(i, "targets")),
    input: (i) => (str(i, "action") === "remove" ? "− " : "+ ") + names(list(i, "targets")) + " @ " + str(i, "id"),
    output: (o) => okOr(o, "已更新"),
  },
};

export function toolMeta(name: string): ToolMeta {
  return TOOL_META[name] ?? { label: name, icon: "wrench", kind: "read", input: NONE, output: (o) => failureOf(o) };
}

export interface PlanStep {
  title: string;
  status: "pending" | "in_progress" | "done";
}

export interface PlanView {
  title: string;
  steps: PlanStep[];
}

/** 从 update_plan 的输出(优先)或输入里读计划;形状不对返回 null。 */
export function readPlan(value: unknown): PlanView | null {
  const steps = field(value, "steps");
  if (!Array.isArray(steps)) return null;
  const parsed: PlanStep[] = [];
  for (const s of steps) {
    const title = str(s, "title");
    const status = str(s, "status");
    if (title === "") continue;
    parsed.push({ title, status: status === "done" || status === "in_progress" ? status : "pending" });
  }
  return parsed.length > 0 ? { title: str(value, "title"), steps: parsed } : null;
}
