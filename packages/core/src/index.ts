export type { SkillMeta, SkillHash, SkillSource, SkillSourceKind, SkillRecord, LinkScope } from "./types.js";
export type { StorageProvider, SourceProvider, ClientAdapter, IdentityProvider } from "./interfaces.js";
export { hashSkillFolder } from "./hash.js";
export { parseSkillMeta, readSkillMeta } from "./skill-md.js";
export { discoverClientRoots, discoverClientRootsAt, isExcludedRoot } from "./clients.js";
export type { ClientRoot } from "./clients.js";
export { resolveStoreRoot, readPointerStoreRoot } from "./store-location.js";
export type { StoreRootOptions, StoreRootResolution, StoreRootSource } from "./store-location.js";
export {
  initializeStoreLayout,
  STORE_ARCHIVE_DIR,
  STORE_DATA_FILES,
  STORE_LAYOUT_VERSION,
  STORE_SKILLS_DIR,
  STORE_TMP_DIR,
} from "./store-layout.js";
export type { InitLayoutResult, StoreManifest } from "./store-layout.js";
export {
  adoptMany,
  adoptSkillFolder,
  readStoreIndex,
  writeStoreIndex,
  STORE_INDEX_VERSION,
} from "./store.js";
export type { AdoptionOutcome, AdoptionReport, AdoptInput, AdoptOptions, StoreIndexFile } from "./store.js";
export { findDanglingLinks, probeLinkTypes, readLinkTarget } from "./link-probe.js";
export type { DanglingLink, LinkTypeProbe } from "./link-probe.js";
export {
  checkLinksLedger,
  LINKS_LEDGER_VERSION,
  queryLinksByClient,
  readLinksLedger,
  removeLinkEntries,
  upsertLinkEntries,
  writeLinksLedger,
} from "./links.js";
export type { LinkEntry, LinkEntryCheck, LinkEntryKind, LinkEntryState, LinksLedgerFile } from "./links.js";
export { applyLinkSet } from "./link-switch.js";
export type { ApplyOptions, LinkSetFailed, LinkSetOk, LinkSetPlan, LinkSetResult } from "./link-switch.js";
