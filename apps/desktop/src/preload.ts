import { contextBridge, ipcRenderer } from "electron";

export interface OpenPathResult {
  ok: boolean;
  error?: string;
}

export interface SkillsHubDesktopBridge {
  isDesktop: true;
  pickDirectory: () => Promise<string | null>;
  openInExplorer: (targetPath: string) => Promise<OpenPathResult>;
  onReconcileRequested: (callback: () => void) => () => void;
  onPreferencesChanged: (callback: () => void) => () => void;
}

function subscribe(channel: "desktop:open-reconcile" | "desktop:preferences-changed", callback: () => void) {
  const listener = () => callback();
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}

const bridge: SkillsHubDesktopBridge = {
  isDesktop: true,
  pickDirectory: () => ipcRenderer.invoke("desktop:pick-directory") as Promise<string | null>,
  openInExplorer: (targetPath: string) =>
    ipcRenderer.invoke("desktop:open-path", targetPath) as Promise<OpenPathResult>,
  onReconcileRequested: (callback) => subscribe("desktop:open-reconcile", callback),
  onPreferencesChanged: (callback) => subscribe("desktop:preferences-changed", callback),
};

contextBridge.exposeInMainWorld("skillsHubDesktop", bridge);
