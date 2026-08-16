import { lstat } from "node:fs/promises";
import { readLinkTarget } from "./link-probe.js";

export type ClientLinkState = "managed" | "off" | "unregistered-conflict" | "dangling";

export interface ClientLinkStatus {
  state: ClientLinkState;
  detail: string;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 只读判定一个客户端落点相对某 skill 名的状态(D5)。
 * inLedger = 台账里有该 client × entryName。
 */
export async function classifyClientLink(dest: string, inLedger: boolean): Promise<ClientLinkStatus> {
  if (!(await pathExists(dest))) {
    if (inLedger) return { state: "dangling", detail: "台账有记录但落点已不存在" };
    return { state: "off", detail: "未启用" };
  }
  const target = await readLinkTarget(dest);
  if (target === null) {
    return { state: "unregistered-conflict", detail: "落点被用户目录占用,绝不覆盖" };
  }
  if (!(await pathExists(target))) {
    return { state: "dangling", detail: "链接目标已不存在" };
  }
  if (inLedger) return { state: "managed", detail: "受管链接" };
  return { state: "unregistered-conflict", detail: "落点已存在且台账未登记,绝不覆盖" };
}
