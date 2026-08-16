import type { ActionId, ActionMeta } from "./registry.js";

export interface PaletteContext {
  hasFocused: boolean;
  selectedCount: number;
  clientCount: number;
  groupCount: number;
}

/** 按动词或 id 过滤注册表(命令面板唯一数据源)。 */
export function filterActions(actions: readonly ActionMeta[], query: string): ActionMeta[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...actions];
  return actions.filter((a) => a.id.includes(q) || a.verb.toLowerCase().includes(q));
}

/** 缺目标时给出原因;null 表示可执行。 */
export function actionUnavailableReason(id: ActionId, ctx: PaletteContext): string | null {
  if (id === "save" || id === "translate") return "在检查器内容页使用";
  if (id === "enable" || id === "disable" || id === "archive" || id === "analyze") {
    if (!ctx.hasFocused) return "先选一个 skill";
    if ((id === "enable" || id === "disable") && ctx.clientCount === 0) return "未发现客户端";
    return null;
  }
  if (id === "preview-links" || id === "apply-links" || id === "add-to-group" || id === "remove-from-group") {
    if (ctx.selectedCount === 0) return "先勾选 skill";
    if ((id === "preview-links" || id === "apply-links") && ctx.clientCount === 0) return "未发现客户端";
    if ((id === "add-to-group" || id === "remove-from-group") && ctx.groupCount === 0) return "暂无分组";
    return null;
  }
  return null;
}

export function actionNeedsText(id: ActionId): boolean {
  return id === "adopt" || id === "restore" || id === "create-group" || id === "rename-group" || id === "delete-group";
}

export function actionNeedsClient(id: ActionId): boolean {
  return id === "enable" || id === "disable" || id === "preview-links" || id === "apply-links";
}

export function actionNeedsGroup(id: ActionId): boolean {
  return id === "add-to-group" || id === "remove-from-group";
}
