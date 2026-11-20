/**
 * `@skills-hub/cli` 编程式入口(供 Electron 桌面壳等进程内嵌入使用)。
 * 严格不得导入 `index.ts`(避免触发 CLI `runMain`)。
 */

export {
  createUiApp,
  DEFAULT_UI_PORT,
  MAX_API_BODY_BYTES,
  MAX_TRANSLATE_CHARS,
  resolveUiStoreRoot,
  startUiServer,
  TRANSLATE_SYSTEM_PROMPT,
} from "./ui-server.js";
export type {
  StartUiServerOptions,
  TranslateStreamEvent,
  TranslateStreamFn,
  UiAppOptions,
  UiServerHandle,
} from "./ui-server.js";
export { loadEnvFile } from "./env.js";
export { resolveHome } from "./home.js";
export { performInit, POINTER_REL, writePointerFile } from "./store-cmds.js";
export type { PerformInitFailure, PerformInitResult } from "./store-cmds.js";
export { adoptAndEnableSelfSkill, migrateAllSkills, runBootstrap } from "./bootstrap.js";
export type { BootstrapArgs, BootstrapOptions } from "./bootstrap.js";
export { performReset } from "./reset-cmds.js";
export type { ResetFailure, ResetFailureCode, ResetSuccess } from "./reset-cmds.js";
export { collectDoctorReport } from "./doctor.js";
export type { DoctorReport, DoctorStoreInfo } from "./doctor.js";
export { AGENT_MODELS, DEFAULT_AGENT_MODEL } from "./agent/models.js";
export type { AgentModel } from "./agent/models.js";
