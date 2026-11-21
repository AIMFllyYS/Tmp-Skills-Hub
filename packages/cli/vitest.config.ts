import { defineConfig } from "vitest/config";
import { AI_PROVIDERS } from "./src/llm/presets.js";

// Tests may launch the CLI as a child. Never inherit a developer's paid provider configuration.
const env: Record<string, string> = { SKILLS_HUB_AI_PROVIDER: "" };
for (const { env: prefix } of AI_PROVIDERS) {
  for (const suffix of ["API_KEY", "MODEL", "BASE_URL"]) env[prefix + "_" + suffix] = "";
}
export default defineConfig({ test: { env } });
