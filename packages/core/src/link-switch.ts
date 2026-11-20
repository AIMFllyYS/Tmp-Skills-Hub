import { lstat, mkdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeHubPaths, type HubPaths } from "./store-location.js";
import { unlinkNoFollow } from "./fs-atomic.js";
import { readLinkTarget } from "./link-probe.js";
import { linkSkillDirName, readLinksLedger, writeLinksLedger, type LinkEntry } from "./links.js";
import { isPortableSkillName } from "./skill-name.js";
import { STORE_TMP_DIR } from "./store-layout.js";
import { uniqueTmpId } from "./tmp-id.js";

/**
 * 受管链接集合的原子切换与失败回滚(#21)。
 *
 * 铁律(与 core-patterns.md §2 一致):
 * - 只操作台账登记过的条目;落点上未登记的同名条目 → 报错中止,绝不覆盖;
 * - 要删除的条目磁盘上不是链接(用户用自己的文件夹占了名)→ 报错中止;
 * - 全程不触碰目标目录本身(无整目录 rename/删除,无递归删除)。
 *
 * 原子性设计(2026-08-16,core-patterns.md §2 同步修订):
 * 库存 tmp 与客户端 skills 目录可能跨卷(如库存 D:、home C:),「tmp 构建 → rename 进目标」跨卷不可行;
 * 改为「journal 先行 + 逐条 unlink/create + 失败按 journal 回滚」。单条 create/unlink 本身原子,
 * 集合级原子性由 journal 回滚保证。
 */

export interface LinkSetPlan {
  /** 落点目录(客户端 skills 根或其下子目录,必须已存在) */
  targetDir: string;
  /** 本次变更后该落点的完整受管条目集合(增/删/改都在这表达) */
  entries: LinkEntry[];
}

export interface LinkSetOk {
  ok: true;
  created: string[];
  removed: string[];
  ledger: LinkEntry[];
}

export interface LinkSetFailed {
  ok: false;
  code: "unregistered-conflict" | "not-link-conflict" | "io-error";
  message: string;
  /** 发生失败的条目路径 */
  at: string;
}

export type LinkSetResult = LinkSetOk | LinkSetFailed;

/** journal:记录本次将做的全部磁盘动作,失败时按它逆序回滚。 */
interface Journal {
  skillsRoot: string;
  targetDir: string;
  /** 本次将新建/替换的条目(回滚时逐个摘掉) */
  created: LinkEntry[];
  /** 本次将摘除的旧条目(含被替换的更新项;回滚时按旧条目重建) */
  removed: LinkEntry[];
}

export interface ApplyOptions {
  /** 测试用:执行第 N 步后注入失败(0 = 第一步前)。缺省不注入。 */
  failAfter?: number;
  /** 根目录迁移仅重定向软链接，已登记的历史副本原地保留。 */
  preserveCopies?: boolean;
  /** 重定向期间失败时，用原真源重建已摘除的条目。 */
  previousSkillsRoot?: string;
  /** 接管只触碰本次已经备份和移出的落点。 */
  entryNames?: ReadonlySet<string>;
}

export async function applyLinkSet(
  storeRoot: string | HubPaths,
  plan: LinkSetPlan,
  options?: ApplyOptions,
): Promise<LinkSetResult> {
  const failAfter = options?.failAfter;
  let steps = 0;
  const step = (): void => {
    if (failAfter !== undefined && steps >= failAfter) {
      throw new Error("注入失败: failAfter=" + failAfter);
    }
    steps++;
  };

  const oldLedger = await readLinksLedger(storeRoot);
  const sameDir = (e: LinkEntry) => e.targetDir === plan.targetDir;
  const selected = (e: LinkEntry) => options?.entryNames?.has(e.entryName) ?? true;
  const desired = plan.entries.filter(selected);
  const entries = options?.preserveCopies
    ? desired.filter((entry) => entry.kind !== "copy")
    : desired;

  // 0. 计划合法性:全部条目必须落在 plan.targetDir
  for (const entry of plan.entries) {
    if (!sameDir(entry)) {
      return { ok: false, code: "io-error", message: "计划条目 targetDir 与 plan.targetDir 不一致", at: entry.id };
    }
    if (!isPortableSkillName(entry.entryName) || !isPortableSkillName(linkSkillDirName(entry))) {
      return { ok: false, code: "io-error", message: "落点名或真源目录名不合法", at: entry.id };
    }
  }

  // 1. 预检 create:落点已存在 → 必须是被台账登记过的条目(更新),否则中止
  for (const entry of entries) {
    const p = path.join(entry.targetDir, entry.entryName);
    if (!(await exists(p))) continue;
    const registered = oldLedger.some((e) => e.targetDir === entry.targetDir && e.entryName === entry.entryName);
    if (!registered) {
      return { ok: false, code: "unregistered-conflict", message: "落点已存在且台账未登记,绝不覆盖", at: p };
    }
  }

  // 2. 计算摘除集 = 旧台账中该落点、不在新计划里的条目 + 被更新替换的旧条目
  const newIds = new Set(desired.map((e) => e.id));
  const prior = oldLedger.filter((e) => sameDir(e) && selected(e));
  const removedEntries = prior.filter((e) => !newIds.has(e.id));
  const replacedEntries = prior.filter((e) => newIds.has(e.id) && !(options?.preserveCopies && e.kind === "copy"));

  // 3. 预检摘除:磁盘上必须是链接(或已缺失),或台账显式登记为 kind === "copy";用户占名 → 中止
  for (const entry of [...removedEntries, ...replacedEntries]) {
    if (!isPortableSkillName(entry.entryName) || !isPortableSkillName(linkSkillDirName(entry))) {
      return { ok: false, code: "io-error", message: "台账包含非法目录名", at: entry.id };
    }
    const p = path.join(entry.targetDir, entry.entryName);
    if (!(await exists(p))) continue;
    if ((await readLinkTarget(p)) === null) {
      const ledgerEntry = oldLedger.find(
        (e) => e.targetDir === entry.targetDir && e.entryName === entry.entryName,
      );
      if (ledgerEntry?.kind !== "copy") {
        return { ok: false, code: "not-link-conflict", message: "台账条目落点已被用户替换为非链接,绝不触碰", at: p };
      }
    }
  }

  // 4. journal 先行(库存 tmp 区)
  const { stateRoot, skillsRoot } = normalizeHubPaths(storeRoot);
  const tmpDir = path.join(stateRoot, STORE_TMP_DIR);
  await mkdir(tmpDir, { recursive: true });
  const journalFile = path.join(tmpDir, "switch." + uniqueTmpId() + ".json");
  const journal: Journal = {
    skillsRoot: options?.previousSkillsRoot ?? skillsRoot,
    targetDir: plan.targetDir,
    created: [],
    removed: [...replacedEntries, ...removedEntries],
  };
  await writeFile(journalFile, JSON.stringify(journal, null, 2), "utf8");

  const createdPaths: string[] = [];
  const removedPaths: string[] = [];
  try {
    // 5. 摘除旧条目(链接 unlink 不跟随;仅台账显式为 kind === "copy" 的受管目录才安全移除)
    for (const entry of [...removedEntries, ...replacedEntries]) {
      step();
      const p = path.join(entry.targetDir, entry.entryName);
      if (!(await exists(p))) continue;
      if ((await readLinkTarget(p)) !== null) {
        await unlink(p);
      } else if (entry.kind === "copy") {
        await unlinkNoFollow(p);
      } else {
        throw new Error("台账条目落点非链接且非受管 copy,拒绝删除: " + p);
      }
      removedPaths.push(p);
    }
    // 6. 建立新条目(按 kind:junction/symlink 建链接,copy 复制目录)
    for (const entry of entries) {
      step();
      const p = path.join(entry.targetDir, entry.entryName);
      if (await exists(p)) {
        // 更新场景残留:摘掉旧链接或受管 copy(预检保证是登记条目)
        const prev = oldLedger.find((e) => e.targetDir === entry.targetDir && e.entryName === entry.entryName);
        if ((await readLinkTarget(p)) !== null) {
          await unlink(p);
        } else if (prev?.kind === "copy") {
          await unlinkNoFollow(p);
        } else {
          throw new Error("落点非链接且未登记为 copy,拒绝删除: " + p);
        }
        removedPaths.push(p);
      }
      const storeSkill = path.join(skillsRoot, linkSkillDirName(entry));
      if (entry.kind === "copy") {
        await copyDir(storeSkill, p);
      } else {
        const type = entry.kind === "junction" && process.platform === "win32" ? "junction" : "dir";
        await symlink(storeSkill, p, type);
      }
      createdPaths.push(p);
    }
    const kept = oldLedger.filter((e) => !sameDir(e) || !selected(e));
    const next = [...kept, ...desired];
    await writeLinksLedger(storeRoot, next);
    await rm(journalFile, { force: true }).catch(() => undefined);
    return { ok: true, created: createdPaths, removed: removedPaths, ledger: next };
  } catch (e) {
    // 7. 回滚:摘掉本次新建(逆序),按 journal 旧条目重建已摘除项
    await rollback(journal, createdPaths, new Set(removedPaths));
    await rm(journalFile, { force: true });
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "io-error", message, at: message };
  }

}

/** 回滚:摘掉本次新建;按 journal 重建已摘除的链接/副本。单条失败不阻断其余(尽力而为)。 */
async function rollback(journal: Journal, createdPaths: string[], removedPaths: ReadonlySet<string>): Promise<void> {
  // 摘掉新建:copy 是真实目录,用 unlinkNoFollow 不跟随内部链接;链接直接 unlink
  for (const p of [...createdPaths].reverse()) {
    if ((await readLinkTarget(p)) !== null) {
      await unlink(p).catch(() => undefined);
    } else {
      await unlinkNoFollow(p).catch(() => undefined);
    }
  }
  // 重建已摘除的旧条目
  for (const old of journal.removed) {
    const p = path.join(old.targetDir, old.entryName);
    if (!removedPaths.has(p) || await exists(p)) continue;
    const storeSkill = path.join(journal.skillsRoot, linkSkillDirName(old));
    if (old.kind === "copy") {
      await copyDir(storeSkill, p).catch(() => undefined);
    } else {
      const type = old.kind === "junction" && process.platform === "win32" ? "junction" : "dir";
      await symlink(storeSkill, p, type).catch(() => undefined);
    }
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** 复制目录(仅用于 kind=copy 的落盘;目标必须不存在或已清空)。 */
async function copyDir(src: string, dest: string): Promise<void> {
  const { cp } = await import("node:fs/promises");
  await cp(src, dest, { recursive: true });
}
