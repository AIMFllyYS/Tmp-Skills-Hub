import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-client";

interface Provider { id: string; label: string; baseUrl: string; model: string; env: string }
interface Directory { ok: true; providers: Provider[]; environment: string | null }

interface Connection {
  ok: true;
  mode: "environment" | "custom";
  persistent: boolean;
  warning?: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

export function AiSettingsSection() {
  const [saved, setSaved] = useState<Connection | null>(null);
  const [mode, setMode] = useState<Connection["mode"]>("environment");
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [preset, setPreset] = useState("custom");
  const [models, setModels] = useState<string[]>([]);
  const [baseUrl, setUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    void Promise.all([apiRequest<Connection>("/api/settings/ai", { signal: request.signal }), apiRequest<Directory>("/api/settings/ai/providers", { signal: request.signal })]).then(([data, list]) => {
      if (request.signal.aborted) return;
      setDirectory(list); setPreset(list.providers.find(p => p.baseUrl === data.baseUrl)?.id ?? "custom");
      setSaved(data); setMode(data.mode); setUrl(data.baseUrl); setModel(data.model); setMessage(data.warning ?? "");
    }).catch((error: Error) => { if (!request.signal.aborted) setMessage(error.message); });
    return () => request.abort();
  }, [revision]);
  const envProvider = directory?.providers.find(p => p.id === directory.environment);
  const fields = () => mode === "environment" ? { mode } : { mode, baseUrl, model, apiKey: key };
  const probe = async (operation: "models" | "test") => {
    setBusy(true);
    setMessage(operation === "models" ? "正在读取服务商的模型列表…" : "正在发送测试消息…");
    try {
      const result = await apiRequest<{ ok: true; models?: string[]; model?: string }>("/api/settings/ai/" + operation, { method: "POST", body: fields() });
      if (result.models) setModels(result.models);
      setMessage(result.models ? "已读取 " + result.models.length + " 个模型，可从下方选择。" : "已收到 " + result.model + " 的回复，连接正常。");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const data = await apiRequest<Connection>("/api/settings/ai", {
        method: "PUT", body: fields(),
      });
      setSaved(data); setPreset(directory?.providers.find(p => p.baseUrl === data.baseUrl)?.id ?? "custom"); setKey(""); setUrl(data.baseUrl); setModel(data.model);
      setMessage("设置已保存，下次 AI 请求将使用此连接。");
      window.dispatchEvent(new Event("skills-hub-ai-changed"));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <section className="mb-6 space-y-3 border-b border-line pb-5" aria-label="AI 连接">
    <h3 className="text-base font-semibold">AI 连接</h3>
    <p className="text-xs text-ink-mid">Agent 对话、翻译和技能分析共用这个连接。</p>
    {saved && <fieldset disabled={busy} className="space-y-3">
      <Label htmlFor="ai-source">配置来源</Label>
      <NativeSelect id="ai-source" value={mode} onChange={e => { setMode(e.target.value === "custom" ? "custom" : "environment"); setKey(""); setModels([]); setMessage(""); }}>
        <option value="environment">本地环境变量</option><option value="custom">手动配置</option>
      </NativeSelect>
      {mode === "custom" ? <>
        <Label htmlFor="ai-provider">服务商</Label>
        <NativeSelect id="ai-provider" value={preset} onChange={e => {
          const selected = directory?.providers.find(p => p.id === e.target.value);
          setPreset(e.target.value); setUrl(selected?.baseUrl ?? ""); setModel(selected?.model ?? "");
          setKey(""); setModels([]); setMessage("");
        }}>{directory?.providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}<option value="custom">自定义兼容服务</option></NativeSelect>
        <Label htmlFor="ai-url">服务地址（Base URL）</Label>
        <Input id="ai-url" type="url" value={baseUrl} readOnly={preset !== "custom"} onChange={e => { setUrl(e.target.value); setKey(""); setModels([]); }} placeholder="https://example.com/v1" />
        <Label htmlFor="ai-model">模型 ID</Label>
        <Input id="ai-model" value={model} onChange={e => setModel(e.target.value)} placeholder="填写服务商提供的模型 ID" />
        {models.length > 0 && <NativeSelect aria-label="服务商返回的模型" value={models.includes(model) ? model : ""} onChange={e => setModel(e.target.value)}><option value="" disabled>选择模型</option>{models.map(id => <option key={id} value={id}>{id}</option>)}</NativeSelect>}
        <Label htmlFor="ai-key">API Key</Label>
        <Input id="ai-key" type="password" autoComplete="new-password" value={key} onChange={e => setKey(e.target.value)}
          placeholder={saved.mode === "custom" && saved.hasKey && saved.baseUrl === baseUrl ? "已配置，留空沿用" : "输入此服务的密钥"} />
        <p className="text-xs text-ink-mid">支持 OpenAI 兼容接口。{saved.persistent ? "密钥由系统加密保存。" : "手动配置仅在本次本地服务运行期间有效。"}</p>
      </> : <div className="space-y-1 rounded-xl bg-surface p-3 text-xs text-ink-mid">
        <p>{envProvider ? `当前服务为 ${envProvider.label}。读取 ${envProvider.env}_API_KEY，可用 ${envProvider.env}_MODEL、${envProvider.env}_BASE_URL 覆盖默认值。` : "SKILLS_HUB_AI_PROVIDER 指定的服务商无法识别。"}</p>
        <p>配置了多家服务时，可用 SKILLS_HUB_AI_PROVIDER 指定 deepseek、openrouter、openai 或 qiniu。</p>
        {saved.mode === "environment" ? <p className="break-all">{saved.model} · {saved.baseUrl} · {saved.hasKey ? "已读取密钥" : "尚未读取到密钥"}</p> :
          <p>保存后会清除手动配置，改用本地环境。</p>}
      </div>}
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void save()}>保存 AI 设置</Button>
        {mode === "custom" && <Button size="sm" variant="outline" onClick={() => void probe("models")}>加载模型</Button>}
        <Button size="sm" variant="outline" onClick={() => void probe("test")}>测试连接</Button></div>
      <p className="text-xs text-ink-mid">测试连接会向所选模型发送一条简短消息，按服务商规则计费。</p>
    </fieldset>}
    {message && <p role="status" className="text-xs">{message}</p>}
    {!saved && (message ? <Button variant="outline" onClick={() => setRevision(v => v + 1)}>重新读取</Button> : <p>正在读取连接设置…</p>)}
  </section>;
}
