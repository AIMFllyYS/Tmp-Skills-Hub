import { isIgnoredSkillEntry } from "./skill-ignore.js";

/** Skill names are a single portable on-disk directory segment. */
export function isPortableSkillName(name: string): boolean {
  return name.trim() === name && name !== "" && !/[. ]$/.test(name) &&
    !/[<>:"/\\|?*]/.test(name) && !Array.from(name).some((char) => char.charCodeAt(0) < 32) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) &&
    !isIgnoredSkillEntry(name) && name !== ".system" && name !== "builtin_skills";
}
