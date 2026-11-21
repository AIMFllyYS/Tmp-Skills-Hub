import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { app, safeStorage } from "electron";
import type { AiConnectionStorage } from "@skills-hub/cli";

export function desktopAiStorage(): AiConnectionStorage | undefined {
  if (!safeStorage.isEncryptionAvailable() || (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")) return undefined;
  const file = join(app.getPath("userData"), "ai-connection.bin");
  return {
    load() {
      try {
        return JSON.parse(safeStorage.decryptString(readFileSync(file))) as ReturnType<AiConnectionStorage["load"]>;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        // Keep the encrypted file available for recovery. The user can replace it in settings.
        return null;
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
