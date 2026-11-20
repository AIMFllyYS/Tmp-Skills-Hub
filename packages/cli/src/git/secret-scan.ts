import { createReadStream } from "node:fs";
import { open, readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { isIgnoredSkillEntry } from "@skills-hub/core";
import { scrub } from "../llm/errors.js";

export interface SecretFinding {
  file: string;
  line: number;
  preview: string;
  rule: string;
}

const RULES = [
  { rule: "github-token", pattern: /\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{16,}/, preview: "GitHub token [redacted]" },
  { rule: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{16,}/, preview: "sk-[redacted]" },
  { rule: "aws-access-key", pattern: /\bAKIA[A-Z0-9]{16}\b/, preview: "AKIA[redacted]" },
  { rule: "private-key", pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/, preview: "PRIVATE KEY [redacted]" },
  { rule: "api-key-assignment", pattern: /\b[A-Z0-9_]*API_KEY\s*=\s*["']?[A-Za-z0-9_+/=.-]{6,}/i, preview: "API_KEY=[redacted]" },
] as const;

const ignoredDirectories = new Set([".venv", "__pycache__"]);

/** Redact subprocess output as well as displayed file names and Git diff text. */
export function redactGitSecrets(text: string): string {
  let result = text
    .replace(/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----|$)/g, "[redacted private key]")
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[redacted]@");
  for (const rule of RULES) result = result.replace(new RegExp(rule.pattern.source, rule.pattern.flags + "g"), "[redacted]");
  return scrub(result);
}

export async function scanSecretsInDir(skillsRoot: string): Promise<SecretFinding[]> {
  const result: SecretFinding[] = [];
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (isIgnoredSkillEntry(entry.name) || ignoredDirectories.has(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      if (!entry.isFile()) continue;
      const handle = await open(file, "r");
      try {
        const header = Buffer.alloc(4096);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        if (header.subarray(0, bytesRead).includes(0)) continue;
        const relative = redactGitSecrets(path.relative(skillsRoot, file).split(path.sep).join("/"));
        const content = createReadStream(file, { fd: handle.fd, start: 0, autoClose: false, encoding: "utf8" });
        const lines = createInterface({ input: content, crlfDelay: Infinity });
        let line = 0;
        for await (const value of lines) {
          line++;
          for (const { rule, pattern, preview } of RULES) {
            if (pattern.test(value)) result.push({ file: relative, line, preview, rule });
          }
        }
      } finally {
        await handle.close();
      }
    }
  };
  await walk(skillsRoot);
  return result;
}
