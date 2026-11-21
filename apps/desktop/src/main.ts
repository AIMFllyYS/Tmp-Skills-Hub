import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from "electron";
import {
  checkBundledSelfSkill,
  createUiApp,
  loadEnvFile,
  performReconcileScanL1,
  readDesktopPreferences,
  resolveHome,
  resolveUiHubPaths,
  type DesktopPreferences,
  type UiServerHandle,
} from "@skills-hub/cli";
import {
  APP_ENTRY_URL,
  APP_ORIGIN,
  APP_SCHEME,
  createAppProtocolHandler,
  resolveDesktopTransport,
  startDesktopHttpTransport,
} from "./protocol.js";
import { createDesktopTray, loginItemSettings, startInTray } from "./tray.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let serverHandle: UiServerHandle | null = null;
let resolvedEntryUrl: string | null = null;
let shuttingDown = false;
let desktopPreferences: DesktopPreferences = { autoLaunch: false, silentTray: false };
let tray: ReturnType<typeof createDesktopTray> | null = null;
let windowRequested = false;

function desktopIcon(): string {
  if (process.platform !== "win32") return path.join(resolveResourcePaths().webRoot, "assets", "skills-hub.png");
  return app.isPackaged ? path.join(process.resourcesPath, "icon.ico") : path.join(resolveAppDir(), "build", "icon.ico");
}

async function initialFolder(): Promise<string> {
  if (!app.isPackaged || process.platform !== "win32") return "";
  if (process.env.SKILLS_HUB_HOME && !app.commandLine.hasSwitch("user-data-dir")) return "";
  const hint = await readFile(path.join(app.getPath("userData"), "setup-folder.txt"), "utf16le").catch(() => "");
  return path.isAbsolute(hint) ? hint : "";
}

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

async function showMainWindow(reconcile = false): Promise<void> {
  if (shuttingDown) return;
  if (resolvedEntryUrl === null) {
    windowRequested = true;
    return;
  }
  let win = mainWindow;
  if (win === null || win.isDestroyed()) {
    const entry = new URL(resolvedEntryUrl);
    if (reconcile) entry.hash = "reconcile";
    win = await createMainWindow(entry.href);
  } else if (reconcile) {
    const contents = win.webContents;
    if (contents.isLoadingMainFrame()) {
      contents.once("did-finish-load", () => contents.send("desktop:open-reconcile"));
    } else {
      contents.send("desktop:open-reconcile");
    }
  }
  if (win.isDestroyed() || shuttingDown) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function requestWindow(reconcile = false): void {
  void showMainWindow(reconcile).catch((error: unknown) => {
    console.warn("Unable to open Skills Hub:", error instanceof Error ? error.name : "unknown");
  });
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
    show: false,
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Skills Hub",
    icon: desktopIcon(),
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
      additionalArguments: [
        "--hub-initial-folder=" + encodeURIComponent(await initialFolder()),
        "--hub-state-folder=" + encodeURIComponent(path.join(resolveHome(), ".skills-hub")),
      ],
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

  win.on("close", (event) => {
    if (shuttingDown || !desktopPreferences.silentTray || tray === null) return;
    event.preventDefault();
    win.hide();
  });
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  mainWindow = win;
  try {
    await win.loadURL(entryUrl);
  } catch (error) {
    if (!win.isDestroyed()) win.destroy();
    throw error;
  }
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

  const sandbox = Boolean(process.env.SKILLS_HUB_HOME);
  const platform = process.platform;
  const openedAtLogin = platform === "darwin" && !sandbox && app.getLoginItemSettings().wasOpenedAtLogin;
  const reconcile = () => performReconcileScanL1(home);
  let scan: Promise<void> | null = null;
  const rescan = () => {
    if (scan !== null) return;
    scan = reconcile().then((result) => tray?.report(result)).catch((error: unknown) => {
      console.warn("Startup scan failed:", error instanceof Error ? error.name : "unknown");
    }).finally(() => { scan = null; });
  };
  const onDesktopPreferences = (next: DesktopPreferences, startup = false) => {
    if (startup || desktopPreferences.autoLaunch !== next.autoLaunch) {
      const settings = loginItemSettings(next.autoLaunch, platform, app.isPackaged, sandbox);
      if (settings !== null && (!startup || app.getLoginItemSettings({ args: settings.args }).openAtLogin !== next.autoLaunch)) {
        app.setLoginItemSettings(settings);
      }
    }
    desktopPreferences = next;
    tray?.setAutoLaunch(next.autoLaunch);
  };
  onDesktopPreferences(await readDesktopPreferences(home), true);
  let submitPreference: ((enabled: boolean) => Promise<Response>) | null = null;
  const setAutoLaunch = async (enabled: boolean) => {
    try {
      const response = await submitPreference?.(enabled);
      if (response?.ok !== true) throw new Error();
      if (mainWindow !== null && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:preferences-changed");
    } catch {
      tray?.setAutoLaunch(desktopPreferences.autoLaunch);
      dialog.showErrorBox("开机自启设置未保存", "请先打开 Skills Hub 完成库存初始化，再从设置修改开机自启。");
    }
  };

  const transport = resolveDesktopTransport();
  const preferenceRequest = (enabled: boolean, origin: string): RequestInit => ({
    method: "PATCH", headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ autoLaunch: enabled }),
  });
  if (transport === "http") {
    serverHandle = await startDesktopHttpTransport({ home, webRoot, onDesktopPreferences });
    resolvedEntryUrl = serverHandle.url.endsWith("/") ? serverHandle.url : `${serverHandle.url}/`;
    const origin = new URL(resolvedEntryUrl).origin;
    submitPreference = (enabled) => fetch(origin + "/api/settings", preferenceRequest(enabled, origin));
  } else {
    const paths = await resolveUiHubPaths(home);
    if (paths !== null) await checkBundledSelfSkill(home, paths);
    const honoApp = createUiApp({ paths, home, webRoot, desktop: true, onDesktopPreferences });
    protocol.handle(APP_SCHEME, createAppProtocolHandler(honoApp));
    resolvedEntryUrl = APP_ENTRY_URL;
    submitPreference = async (enabled) => honoApp.fetch(new Request(
      "http://skills-hub/api/settings", preferenceRequest(enabled, APP_ORIGIN),
    ));
  }

  tray = createDesktopTray({
    open: requestWindow,
    rescan,
    setAutoLaunch: (enabled) => void setAutoLaunch(enabled),
    quit: () => app.quit(),
  }, desktopPreferences.autoLaunch, desktopIcon());
  registerIpcHandlers();
  rescan();
  if (windowRequested || !startInTray(process.argv, openedAtLogin)) await showMainWindow();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  if (process.platform === "win32") app.setAppUserModelId("dev.skills-hub.desktop");
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

  app.on("second-instance", (_event, secondArgv) => {
    if (!secondArgv.includes("--hidden")) requestWindow();
  });

  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    shuttingDown = true;
    tray?.destroy();
    tray = null;
    if (serverHandle === null) return;
    event.preventDefault();
    const handle = serverHandle;
    serverHandle = null;
    void handle.close().catch(() => undefined).finally(() => {
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    requestWindow();
  });

  void app.whenReady().then(() => bootstrapDesktop()).catch((error: unknown) => {
    console.error("Failed to start Skills Hub Desktop:", error);
    app.quit();
  });
}
