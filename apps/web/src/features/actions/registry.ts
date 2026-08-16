import { adoptSource, analyzeSkill, applyLinks, archiveSkill, changeGroupMembers, createGroup, deleteGroup, previewLinks, renameGroup, restoreSkill, saveSkillFile, setSkillEnabled, shareSkill, translateText } from "../skills/api.js";
import type { LinksBatchParams } from "../skills/types.js";

export type ActionId =
  | "enable"
  | "disable"
  | "archive"
  | "save"
  | "translate"
  | "preview-links"
  | "apply-links"
  | "adopt"
  | "restore"
  | "create-group"
  | "rename-group"
  | "delete-group"
  | "add-to-group"
  | "remove-from-group"
  | "analyze"
  | "share";

export interface ActionMeta {
  id: ActionId;
  verb: string;
  destructive: boolean;
  supportsPreview: boolean;
}

export interface ActionDef<P, R> extends ActionMeta {
  execute: (params: P) => Promise<R>;
}

export interface HashClientParams {
  hash: string;
  clientId: string;
}

export interface ArchiveParams {
  hash: string;
}

export interface SaveParams {
  hash: string;
  relPath: string;
  content: string;
}

export interface TranslateParams {
  text: string;
}

/**
 * 可编程动作表(D10)。按钮/菜单/命令面板只按 id 取这一份。
 * 新动作往表里加,不要在组件里另写请求。
 */
export const ACTION_REGISTRY = {
  enable: {
    id: "enable",
    verb: "启用",
    destructive: false,
    supportsPreview: false,
    execute: (p: HashClientParams) => setSkillEnabled(p.hash, p.clientId, true),
  },
  disable: {
    id: "disable",
    verb: "停用",
    destructive: false,
    supportsPreview: false,
    execute: (p: HashClientParams) => setSkillEnabled(p.hash, p.clientId, false),
  },
  archive: {
    id: "archive",
    verb: "归档",
    destructive: true,
    supportsPreview: false,
    execute: (p: ArchiveParams) => archiveSkill(p.hash),
  },
  restore: {
    id: "restore",
    verb: "恢复",
    destructive: false,
    supportsPreview: false,
    execute: (p: { name: string }) => restoreSkill(p.name),
  },
  save: {
    id: "save",
    verb: "保存",
    destructive: false,
    supportsPreview: false,
    execute: (p: SaveParams) => saveSkillFile(p.hash, p.relPath, p.content),
  },
  translate: {
    id: "translate",
    verb: "翻译",
    destructive: false,
    supportsPreview: false,
    execute: (p: TranslateParams) => translateText(p.text),
  },
  "preview-links": {
    id: "preview-links",
    verb: "预览链接",
    destructive: false,
    supportsPreview: true,
    execute: (p: LinksBatchParams) => previewLinks(p),
  },
  "apply-links": {
    id: "apply-links",
    verb: "应用链接",
    destructive: false,
    supportsPreview: true,
    execute: (p: LinksBatchParams) => applyLinks(p),
  },
  adopt: {
    id: "adopt",
    verb: "收录",
    destructive: false,
    supportsPreview: false,
    execute: (p: { source: string }) => adoptSource(p.source),
  },
  "create-group": {
    id: "create-group",
    verb: "新建分组",
    destructive: false,
    supportsPreview: false,
    execute: (p: { id: string; name: string }) => createGroup(p.id, p.name),
  },
  "rename-group": {
    id: "rename-group",
    verb: "重命名",
    destructive: false,
    supportsPreview: false,
    execute: (p: { id: string; name: string }) => renameGroup(p.id, p.name),
  },
  "delete-group": {
    id: "delete-group",
    verb: "删除分组",
    destructive: true,
    supportsPreview: false,
    execute: (p: { id: string }) => deleteGroup(p.id),
  },
  "add-to-group": {
    id: "add-to-group",
    verb: "挂到分组",
    destructive: false,
    supportsPreview: false,
    execute: (p: { id: string; hashes: string[] }) => changeGroupMembers(p.id, p.hashes, "add"),
  },
  "remove-from-group": {
    id: "remove-from-group",
    verb: "移出分组",
    destructive: false,
    supportsPreview: false,
    execute: (p: { id: string; hashes: string[] }) => changeGroupMembers(p.id, p.hashes, "remove"),
  },
  analyze: {
    id: "analyze",
    verb: "分析",
    destructive: false,
    supportsPreview: false,
    execute: (p: { target: string }) => analyzeSkill(p.target),
  },
  share: {
    id: "share",
    verb: "分享",
    destructive: false,
    supportsPreview: false,
    execute: (p: { target: string }) => shareSkill(p.target),
  },
} as const;

export type ActionRegistry = typeof ACTION_REGISTRY;

export function getAction<K extends ActionId>(id: K): ActionRegistry[K] {
  return ACTION_REGISTRY[id];
}

export function listActions(): ActionRegistry[ActionId][] {
  return (Object.keys(ACTION_REGISTRY) as ActionId[]).map((id) => ACTION_REGISTRY[id]);
}
