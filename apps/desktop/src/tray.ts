import { Menu, Notification, Tray } from "electron";
import type { performReconcileScanL1 } from "@skills-hub/cli";

type ScanResult = Awaited<ReturnType<typeof performReconcileScanL1>>;

interface TrayActions {
  open: (reconcile?: boolean) => void;
  rescan: () => void;
  setAutoLaunch: (enabled: boolean) => void;
  quit: () => void;
}

export function loginItemSettings(openAtLogin: boolean, platform: NodeJS.Platform, packed: boolean, sandbox: boolean) {
  if (!packed || sandbox || (platform !== "win32" && platform !== "darwin")) return null;
  return { openAtLogin, args: ["--hidden"] };
}

export function startInTray(argv: readonly string[], openedAtLogin: boolean): boolean {
  return openedAtLogin || argv.includes("--hidden");
}

export function scanAlert(summary: ScanResult): { count: number; title: string } | null {
  if (summary === null) return null;
  const count = summary.unmanagedRealDirs + summary.replacedLinks;
  return count === 0 ? null : { count, title: "检测到 " + String(count) + " 个本地 Skill 需要接管" };
}

export function createDesktopTray(actions: TrayActions, autoLaunch: boolean, icon: string, platform = process.platform) {
  const tray = new Tray(icon);
  let notice: Notification | null = null;
  let destroyed = false;
  tray.setToolTip("Skills Hub");
  tray.on("click", () => actions.open());
  tray.on("balloon-click", () => actions.open(true));

  const setAutoLaunch = (enabled: boolean): void => {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "打开 Skills Hub", click: () => actions.open() },
      { label: "立即重新扫描", click: actions.rescan },
      {
        label: "开机自启", type: "checkbox", checked: enabled, enabled: platform === "win32" || platform === "darwin",
        click: (item) => actions.setAutoLaunch(item.checked),
      },
      { type: "separator" },
      { label: "退出", click: actions.quit },
    ]));
  };
  setAutoLaunch(autoLaunch);

  return {
    setAutoLaunch,
    report(summary: ScanResult): void {
      if (destroyed) return;
      const alert = scanAlert(summary);
      notice?.close();
      notice = null;
      if (platform === "win32") tray.removeBalloon();
      tray.setToolTip(alert === null ? "Skills Hub" : "Skills Hub · " + String(alert.count) + " 个待接管");
      if (alert === null) return;
      const body = "点击查看并合并";
      const fallback = () => {
        if (!destroyed && platform === "win32") tray.displayBalloon({ icon, title: alert.title, content: body });
      };
      if (!Notification.isSupported()) {
        fallback();
        return;
      }
      notice = new Notification({ title: alert.title, body, icon });
      notice.on("click", () => actions.open(true));
      notice.on("failed", fallback);
      notice.show();
    },
    destroy(): void {
      destroyed = true;
      notice?.close();
      tray.destroy();
    },
  };
}
