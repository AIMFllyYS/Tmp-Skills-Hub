import { randomUUID } from "node:crypto";

/** 生成短随机后缀(8 位 hex),用于避免同毫秒 TMP/旁路路径冲突。 */
export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

/** 生成进程+毫秒+随机后缀唯一 ID,用于原子写临时文件命名。 */
export function uniqueTmpId(): string {
  return `${process.pid}-${Date.now()}-${uniqueSuffix()}`;
}
