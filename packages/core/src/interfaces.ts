/**
 * 四个接口抽象点:与 docs/designs/architecture-initial-spec.md 第 5 章一一对应。
 * 原则:走到可以停的地方停下来,把接口先抽象出来;第一版只做最简实现。
 */

import type { LinkScope, SkillHash, SkillRecord } from "./types.js";

/**
 * 存储介质接口。第一版实现:文件系统目录。
 * 未来(只登记不做):1000+ skill 时换数据库或其他介质。
 */
export interface StorageProvider {
  /** 列出库存中的全部 skill 记录。 */
  list(): Promise<SkillRecord[]>;
  /** 按哈希取一条记录,不存在返回 null。 */
  get(hash: SkillHash): Promise<SkillRecord | null>;
  /** 将一个标准化的 skill 文件夹收进库存,返回记录(内容相同则幂等返回已有记录)。 */
  add(folderPath: string, record: Omit<SkillRecord, "hash">): Promise<SkillRecord>;
  /** 从库存移除记录(不负责删除各 Agent 侧链接)。 */
  remove(hash: SkillHash): Promise<void>;
}

/**
 * 收录来源接口:一个来源 → 一个标准化的 skill 文件夹(落在临时目录)。
 * 第一版实现:本地目录扫描、GitHub 链接。
 * 未来(只登记不做):浏览器插件、Agent 对话代存、市场页面。
 */
export interface SourceProvider {
  /** 该来源能否处理这个输入(路径 / URL / 其他)。 */
  canHandle(input: string): boolean;
  /** 拉取并标准化,返回可供 StorageProvider.add 使用的本地文件夹路径列表。 */
  fetch(input: string): Promise<string[]>;
}

/**
 * 客户端适配接口:统一库 → 某个 Agent 的目录约定。
 * 第一版实现:Claude、Codex/.agents、Cursor(通用层 + symlink)。
 * 未来(只登记不做):各家 YAML 精致适配、更多客户端。
 */
export interface ClientAdapter {
  /** 客户端标识,如 "claude" | "codex" | "cursor"。 */
  id: string;
  /** 该客户端在指定范围下的 skills 目录绝对路径。 */
  skillsDir(scope: LinkScope, projectRoot?: string): string;
  /** 在客户端目录创建指回库存原件的符号链接。 */
  link(record: SkillRecord, storePath: string, scope: LinkScope, projectRoot?: string): Promise<void>;
  /** 删除链接(≠ 删除原件;Agent 读不到即等于卸下)。 */
  unlink(record: SkillRecord, scope: LinkScope, projectRoot?: string): Promise<void>;
}

/**
 * 身份接入接口:谁在写共享仓库。
 * 第一版实现:授信成员名单(全员授信)。
 * 未来(只登记不做):账号系统 / 统一登录;接入必须幂等。
 */
export interface IdentityProvider {
  /** 当前用户是否可写共享仓库。第一版恒真(全员授信)。 */
  canWrite(): Promise<boolean>;
}
