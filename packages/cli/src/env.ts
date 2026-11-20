import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveHome } from "./home.js";

/**
 * .env 加载器(#42):密钥等配置只从环境变量读取,env 文件只是把
 * 变量放进进程环境的方式。规则:
 * - 只读 KEY=VALUE(允许 # 注释与空行),不做变量展开
 * - 不覆盖进程已有的同名变量(环境变量优先)
 * - 无参调用时先读当前工作目录 .env,再回落 <home>/.skills-hub/.env
 * - 文件缺失或解析失败静默(未配置密钥由调用方给出可读提示)
 */
async function loadSingleEnvFile(file: string): Promise<void> {
  const raw = await readFile(file, "utf8").catch(() => null);
  if (raw === null) return;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (value.length >= 2 && ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export async function loadEnvFile(file?: string): Promise<void> {
  if (file !== undefined) {
    await loadSingleEnvFile(file);
    return;
  }
  await loadSingleEnvFile(path.join(process.cwd(), ".env"));
  await loadSingleEnvFile(path.join(resolveHome(), ".skills-hub", ".env"));
}
