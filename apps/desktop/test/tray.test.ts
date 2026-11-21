import { beforeEach, expect, it, vi } from "vitest";
import { createDesktopTray, loginItemSettings, scanAlert, startInTray } from "../src/tray.js";

const os = vi.hoisted(() => ({
  tray: {
    on: vi.fn<(event: string, handler: () => void) => void>(),
    setToolTip: vi.fn(),
    setContextMenu: vi.fn<(items: Electron.MenuItemConstructorOptions[]) => void>(),
    displayBalloon: vi.fn(),
    removeBalloon: vi.fn(),
    destroy: vi.fn(),
  },
  notice: {
    on: vi.fn<(event: string, handler: () => void) => void>(),
    show: vi.fn(),
    close: vi.fn(),
  },
  notificationSupported: vi.fn<() => boolean>(),
}));

vi.mock("electron", () => ({
  Menu: { buildFromTemplate: (items: readonly Electron.MenuItemConstructorOptions[]) => items },
  nativeImage: { createFromBitmap: () => ({}) },
  Tray: class {
    constructor() { return os.tray; }
  },
  Notification: class {
    static isSupported = os.notificationSupported;
    constructor() { return os.notice; }
  },
}));

const clearScan = {
  clientsScanned: 20, managedLinks: 42, unmanagedRealDirs: 0, replacedLinks: 0, newConflicts: 0,
  externalSymlinks: 1, danglingLinks: 0, nonSkillEntries: 1, scanDurationMs: 2, scannedAt: "2026-11-21T00:00:00Z",
};

const actions = () => ({ open: vi.fn(), rescan: vi.fn(), setAutoLaunch: vi.fn(), quit: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  os.notificationSupported.mockReturnValue(true);
});

it("adds the hidden Windows login flag, while development and sandbox builds leave OS settings alone", () => {
  expect(loginItemSettings(true, "win32", true, false)).toEqual({ openAtLogin: true, args: ["--hidden"] });
  expect(loginItemSettings(false, "win32", true, false)).toEqual({ openAtLogin: false, args: ["--hidden"] });
  expect(loginItemSettings(true, "linux", true, false)).toBeNull();
  expect(loginItemSettings(true, "win32", true, true)).toBeNull();
  expect(loginItemSettings(true, "win32", false, false)).toBeNull();
  expect(startInTray(["Skills Hub.exe", "--hidden"], false)).toBe(true);
  expect(startInTray(["Skills Hub.app"], true)).toBe(true);
  expect(startInTray(["Skills Hub.exe"], false)).toBe(false);
});

it("keeps a clean scan silent and opens the reconcile preview from an alert", () => {
  const handlers = actions();
  const tray = createDesktopTray(handlers, false, "icon.ico", "win32");
  expect(scanAlert(null)).toBeNull();
  tray.report(clearScan);
  expect(os.notice.show).not.toHaveBeenCalled();
  expect(os.tray.setToolTip).toHaveBeenLastCalledWith("Skills Hub");
  tray.report({ ...clearScan, unmanagedRealDirs: 2, replacedLinks: 1 });
  expect(os.tray.setToolTip).toHaveBeenLastCalledWith("Skills Hub · 3 个待接管");
  expect(os.notice.show).toHaveBeenCalledOnce();
  os.notice.on.mock.calls.find(([event]) => event === "click")?.[1]();
  expect(handlers.open).toHaveBeenCalledExactlyOnceWith(true);
  tray.destroy();
  expect(os.tray.destroy).toHaveBeenCalledOnce();
  expect(os.notice.close).toHaveBeenCalledOnce();
});

it("uses the Windows balloon when native notifications are unavailable and reflects preference changes", () => {
  const handlers = actions();
  os.notificationSupported.mockReturnValue(false);
  const tray = createDesktopTray(handlers, false, "icon.ico", "win32");
  const original = os.tray.setContextMenu.mock.lastCall?.[0];
  expect(original?.find((item) => item.type === "checkbox")).toMatchObject({ checked: false });
  tray.setAutoLaunch(true);
  const menu = os.tray.setContextMenu.mock.lastCall?.[0];
  expect(menu?.find((item) => item.type === "checkbox")).toMatchObject({ checked: true });
  tray.report({ ...clearScan, replacedLinks: 1 });
  expect(os.tray.displayBalloon).toHaveBeenCalledOnce();
  expect(os.notice.show).not.toHaveBeenCalled();
  os.tray.on.mock.calls.find(([event]) => event === "balloon-click")?.[1]();
  expect(handlers.open).toHaveBeenCalledExactlyOnceWith(true);
  tray.destroy();
});
