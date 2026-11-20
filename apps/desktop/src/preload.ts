import { contextBridge, ipcRenderer } from "electron";

export interface OpenPathResult {
  ok: boolean;
  error?: string;
}

export interface SkillsHubDesktopBridge {
  isDesktop: true;
  pickDirectory: () => Promise<string | null>;
  openInExplorer: (targetPath: string) => Promise<OpenPathResult>;
}

const bridge: SkillsHubDesktopBridge = {
  isDesktop: true,
  pickDirectory: () => ipcRenderer.invoke("desktop:pick-directory") as Promise<string | null>,
  openInExplorer: (targetPath: string) =>
    ipcRenderer.invoke("desktop:open-path", targetPath) as Promise<OpenPathResult>,
};

contextBridge.exposeInMainWorld("skillsHubDesktop", bridge);
