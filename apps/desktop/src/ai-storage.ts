import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { app, safeStorage } from "electron";
import type { AiConnectionStorage } from "@skills-hub/cli";

export function desktopAiStorage(): AiConnectionStorage | undefined {
  if (process.env.SKILLS_HUB_HOME && !app.commandLine.hasSwitch("user-data-dir")) return undefined;
  if (!safeStorage.isEncryptionAvailable() || (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")) return undefined;
  const file = join(app.getPath("userData"), "ai-connection.bin");
  return {
    load() {
      try {
        return JSON.parse(safeStorage.decryptString(readFileSync(file))) as ReturnType<AiConnectionStorage["load"]>;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new Error("无法读取已保存的 AI 连接");
      }
    },
    save(connection) {
      if (!connection) { rmSync(file, { force: true }); return; }
      const temp = file + "." + randomUUID();
      try {
        writeFileSync(temp, safeStorage.encryptString(JSON.stringify(connection)), { mode: 0o600 });
        renameSync(temp, file);
      } finally { rmSync(temp, { force: true }); }
    },
  };
}
