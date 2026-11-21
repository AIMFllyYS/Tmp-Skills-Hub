import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-client";

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
  const [baseUrl, setUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    void apiRequest<Connection>("/api/settings/ai", { signal: request.signal }).then(data => {
      if (request.signal.aborted) return;
      setSaved(data); setMode(data.mode); setUrl(data.baseUrl); setModel(data.model); setMessage(data.warning ?? "");
    }).catch((error: Error) => { if (!request.signal.aborted) setMessage(error.message); });
    return () => request.abort();
  }, [revision]);
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const data = await apiRequest<Connection>("/api/settings/ai", {
        method: "PUT", body: mode === "environment" ? { mode } : { mode, baseUrl, model, apiKey: key },
      });
      setSaved(data); setKey(""); setUrl(data.baseUrl); setModel(data.model);
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
      <NativeSelect id="ai-source" value={mode} onChange={e => { setMode(e.target.value === "custom" ? "custom" : "environment"); setKey(""); setMessage(""); }}>
        <option value="environment">本地环境变量</option><option value="custom">手动配置</option>
      </NativeSelect>
      {mode === "custom" ? <>
        <Label htmlFor="ai-url">服务地址（Base URL）</Label>
        <Input id="ai-url" type="url" value={baseUrl} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/v1" />
        <Label htmlFor="ai-model">模型 ID</Label>
        <Input id="ai-model" value={model} onChange={e => setModel(e.target.value)} placeholder="填写服务商提供的模型 ID" />
        <Label htmlFor="ai-key">API Key</Label>
        <Input id="ai-key" type="password" autoComplete="new-password" value={key} onChange={e => setKey(e.target.value)}
          placeholder={saved.mode === "custom" && saved.hasKey && saved.baseUrl === baseUrl ? "已配置，留空沿用" : "输入此服务的密钥"} />
        <p className="text-xs text-ink-mid">支持 OpenAI 兼容接口。{saved.persistent ? "密钥由系统加密保存。" : "手动配置仅在本次本地服务运行期间有效。"}</p>
      </> : <div className="space-y-1 rounded-xl bg-surface p-3 text-xs text-ink-mid">
        <p>从环境变量或 .env 读取 QINIU_BASE_URL、QINIU_MODEL 和 QINIU_API_KEY。</p>
        {saved.mode === "environment" ? <p className="break-all">{saved.model} · {saved.baseUrl} · {saved.hasKey ? "已读取密钥" : "尚未读取到密钥"}</p> :
          <p>保存后会清除手动配置，改用本地环境。</p>}
      </div>}
      <Button size="sm" onClick={() => void save()}>{busy ? "保存中…" : "保存 AI 设置"}</Button>
    </fieldset>}
    {message && <p role="status" className="text-xs">{message}</p>}
    {!saved && (message ? <Button variant="outline" onClick={() => setRevision(v => v + 1)}>重新读取</Button> : <p>正在读取连接设置…</p>)}
  </section>;
}
