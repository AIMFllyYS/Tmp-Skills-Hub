import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readHubConfig, writeFileAtomicSafe, writeHubConfig, type HubConfig, type HubPaths } from "@skills-hub/core";
import { POINTER_REL } from "./store-shared.js";

type Preferences = Pick<HubConfig, "git" | "autoLaunch" | "silentTray">;
const writes = new Map<string, Promise<void>>();

export function serializePreferenceWrite<T>(home: string, action: () => Promise<T>): Promise<T> {
  const key = path.resolve(home);
  const result = (writes.get(key) ?? Promise.resolve()).then(action);
  const completion = result.then(() => undefined, () => undefined);
  writes.set(key, completion);
  void completion.then(() => { if (writes.get(key) === completion) writes.delete(key); });
  return result;
}

export async function readStorePreferences(home: string) {
  const config = await readHubConfig(path.join(home, POINTER_REL));
  return {
    git: config?.git ?? { enabled: false },
    autoLaunch: config?.autoLaunch ?? false,
    silentTray: config?.silentTray ?? false,
  };
}

export async function writeStorePreferences(home: string, paths: HubPaths, preferences: Preferences): Promise<void> {
  const file = path.join(home, POINTER_REL);
  if (paths.layoutMode === "split") {
    await writeHubConfig(file, {
      ...preferences, version: 2, stateRoot: paths.stateRoot, skillsRoot: paths.skillsRoot, storeRoot: paths.stateRoot,
    });
  } else {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomicSafe(file, JSON.stringify({ storeRoot: paths.stateRoot, ...preferences }, null, 2) + "\n");
  }
}
