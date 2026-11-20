import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from "electron";
import {
  createUiApp,
  loadEnvFile,
  resolveHome,
  resolveUiStoreRoot,
  type UiServerHandle,
} from "@skills-hub/cli";
import {
  APP_ENTRY_URL,
  APP_SCHEME,
  createAppProtocolHandler,
  resolveDesktopTransport,
  startDesktopHttpTransport,
} from "./protocol.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let serverHandle: UiServerHandle | null = null;
let resolvedEntryUrl: string | null = null;
let shuttingDown = false;

function resolveAppDir(): string {
  return app.isPackaged ? app.getAppPath() : path.resolve(currentDir, "..");
}

function resolveResourcePaths(): { webRoot: string; selfSkillDir: string } {
  if (app.isPackaged) {
    return {
      webRoot: path.join(process.resourcesPath, "web"),
      selfSkillDir: path.join(process.resourcesPath, "self-skill"),
    };
  }
  const appDir = resolveAppDir();
  return {
    webRoot: path.resolve(appDir, "../web/dist"),
    selfSkillDir: path.resolve(appDir, "../../packages/cli/self-skill"),
  };
}

function isSameAppOrigin(targetUrl: string, entryUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    const entry = new URL(entryUrl);
    return parsed.protocol === entry.protocol && parsed.host.toLowerCase() === entry.host.toLowerCase();
  } catch {
    return false;
  }
}

function focusMainWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function registerIpcHandlers(): void {
  ipcMain.handle("desktop:pick-directory", async (): Promise<string | null> => {
    const opts: Electron.OpenDialogOptions = { properties: ["openDirectory"] };
    const result =
      mainWindow !== null && !mainWindow.isDestroyed()
        ? await dialog.showOpenDialog(mainWindow, opts)
        : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(
    "desktop:open-path",
    async (_event, targetPath: unknown): Promise<{ ok: boolean; error?: string }> => {
      if (typeof targetPath !== "string") {
        return { ok: false, error: "invalid-path" };
      }
      const trimmed = targetPath.trim();
      if (trimmed === "" || !path.isAbsolute(trimmed)) {
        return { ok: false, error: "invalid-path" };
      }
      const resolved = path.resolve(trimmed);
      const info = await stat(resolved).catch(() => null);
      if (info === null) {
        return { ok: false, error: "not-found" };
      }
      if (info.isDirectory()) {
        const errMessage = await shell.openPath(resolved);
        return errMessage === "" ? { ok: true } : { ok: false, error: errMessage };
      }
      shell.showItemInFolder(resolved);
      return { ok: true };
    },
  );
}

async function createMainWindow(entryUrl: string): Promise<BrowserWindow> {
  const preloadPath = path.join(currentDir, "preload.cjs");
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Skills Hub",
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });

  win.webContents.on("will-navigate", (event, navigationUrl) => {
    if (isSameAppOrigin(navigationUrl, entryUrl)) return;
    event.preventDefault();
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        void shell.openExternal(navigationUrl);
      }
    } catch {
      // ignore invalid URLs
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        void shell.openExternal(url);
      }
    } catch {
      // ignore invalid URLs
    }
    return { action: "deny" };
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  mainWindow = win;
  await win.loadURL(entryUrl);
  return win;
}

async function bootstrapDesktop(): Promise<void> {
  const home = resolveHome();
  await loadEnvFile(path.join(home, ".skills-hub", ".env"));
  await loadEnvFile();

  const { webRoot, selfSkillDir } = resolveResourcePaths();
  if (process.env.SKILLSHUB_SELF_SKILL_DIR === undefined || process.env.SKILLSHUB_SELF_SKILL_DIR === "") {
    process.env.SKILLSHUB_SELF_SKILL_DIR = selfSkillDir;
  }

  const transport = resolveDesktopTransport();
  if (transport === "http") {
    serverHandle = await startDesktopHttpTransport({ home, webRoot });
    resolvedEntryUrl = serverHandle.url.endsWith("/") ? serverHandle.url : `${serverHandle.url}/`;
  } else {
    const storeRoot = await resolveUiStoreRoot(home);
    const honoApp = createUiApp({ storeRoot, home, webRoot });
    protocol.handle(APP_SCHEME, createAppProtocolHandler(honoApp));
    resolvedEntryUrl = APP_ENTRY_URL;
  }

  registerIpcHandlers();
  await createMainWindow(resolvedEntryUrl);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);

  app.on("second-instance", () => {
    focusMainWindow();
  });

  app.on("before-quit", (event) => {
    if (serverHandle === null || shuttingDown) return;
    shuttingDown = true;
    event.preventDefault();
    const handle = serverHandle;
    serverHandle = null;
    void handle.close().finally(() => {
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && resolvedEntryUrl !== null) {
      void createMainWindow(resolvedEntryUrl);
    }
  });

  void app.whenReady().then(() => bootstrapDesktop()).catch((error: unknown) => {
    console.error("Failed to start Skills Hub Desktop:", error);
    app.quit();
  });
}
