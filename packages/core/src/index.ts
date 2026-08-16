export type { SkillMeta, SkillHash, SkillSource, SkillSourceKind, SkillRecord, LinkScope } from "./types.js";
export type { StorageProvider, SourceProvider, ClientAdapter, IdentityProvider } from "./interfaces.js";
export { hashSkillFolder } from "./hash.js";
export { parseSkillMeta, readSkillMeta } from "./skill-md.js";
export { discoverClientRoots, isExcludedRoot } from "./clients.js";
export type { ClientRoot } from "./clients.js";
