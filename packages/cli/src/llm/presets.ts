/** Public defaults only. Each provider reads credentials exclusively from its own namespace. */
export const AI_PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", env: "DEEPSEEK" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini", env: "OPENROUTER" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", env: "OPENAI" },
  { id: "qiniu", label: "七牛云", baseUrl: "https://api.qnaigc.com/v1", model: "deepseek/deepseek-v4-flash-20260731", env: "QINIU" },
] as const;

export function environmentConnection(env: NodeJS.ProcessEnv = process.env) {
  const requested = env.SKILLS_HUB_AI_PROVIDER?.trim().toLowerCase();
  const provider = requested ? AI_PROVIDERS.find(p => p.id === requested) :
    AI_PROVIDERS.find(p => env[p.env + "_API_KEY"]?.trim()) ??
    AI_PROVIDERS.find(p => env[p.env + "_MODEL"] || env[p.env + "_BASE_URL"]) ?? AI_PROVIDERS[0];
  if (!provider) return { provider: null, baseUrl: "", model: "", apiKey: "" };
  return {
    provider,
    baseUrl: (env[provider.env + "_BASE_URL"]?.trim() || provider.baseUrl).replace(/\/+$/, ""),
    model: env[provider.env + "_MODEL"]?.trim() || provider.model,
    apiKey: env[provider.env + "_API_KEY"]?.trim() ?? "",
  };
}
