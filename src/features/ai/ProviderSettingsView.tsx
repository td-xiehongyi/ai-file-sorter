import { useState } from "react";

import type {
  AiProviderConfig,
  ProviderKind,
  ProviderStatus,
  PublicAiProviderConfig,
} from "../../types/ai";

export type ProviderRequest = {
  config: AiProviderConfig;
  api_key?: string;
};

type Props = {
  config: PublicAiProviderConfig;
  status: ProviderStatus | null;
  onTest: (request: ProviderRequest) => Promise<ProviderStatus>;
  onSave: (request: ProviderRequest) => Promise<void>;
};

function apiConfigFrom(config: AiProviderConfig, kind: ProviderKind): AiProviderConfig {
  return kind === "ollama"
    ? { ...config, kind, display_name: "本地 Ollama", base_url: "http://127.0.0.1:11434", model: config.model || "qwen2.5:7b" }
    : { ...config, id: "remote-api", kind, display_name: "外部 API", base_url: "https://api.example.com/v1", model: config.model || "gpt-4.1-mini" };
}

export function ProviderSettingsView({ config, status, onTest, onSave }: Props) {
  const [kind, setKind] = useState<ProviderKind>(config.config.kind);
  const [draft, setDraft] = useState(() => config.config);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ProviderStatus | null>(status);

  function switchProvider(nextKind: ProviderKind) {
    const switchingToRemote = nextKind === "open_ai_compatible" && kind === "ollama";
    setKind(nextKind);
    setDraft((current) => ({
      ...apiConfigFrom(current, nextKind),
      ...(switchingToRemote ? { model: "gpt-4.1-mini" } : {}),
    }));
    setFeedback(null);
  }

  async function test() {
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback(await onTest({ config: draft, api_key: apiKey || undefined }));
    } catch (error) {
      setFeedback({ available: false, provider: draft.kind, model: draft.model, message: error instanceof Error ? error.message : "连接测试失败" });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      await onSave({ config: draft, api_key: apiKey || undefined });
      setApiKey("");
      setFeedback({ available: true, provider: draft.kind, model: draft.model, message: "配置已保存" });
    } catch (error) {
      setFeedback({ available: false, provider: draft.kind, model: draft.model, message: error instanceof Error ? error.message : "配置保存失败" });
    } finally {
      setBusy(false);
    }
  }

  const isLocal = kind === "ollama";
  return (
    <section aria-labelledby="provider-settings-title" className="provider-settings">
      <div className="provider-settings-heading">
        <div>
          <span className="eyebrow">模型连接</span>
          <h3 id="provider-settings-title">选择模型 Provider</h3>
          <p>API 配置只用于模型请求，不参与文件移动或重命名。</p>
        </div>
        <div className="provider-tabs" role="tablist" aria-label="模型来源">
          <button type="button" role="tab" aria-selected={isLocal} className={isLocal ? "provider-tab is-active" : "provider-tab"} onClick={() => switchProvider("ollama")}>本地模型</button>
          <button type="button" role="tab" aria-selected={!isLocal} className={!isLocal ? "provider-tab is-active" : "provider-tab"} onClick={() => switchProvider("open_ai_compatible")}>API 模型</button>
        </div>
      </div>

      {isLocal ? <div className="provider-local-state"><strong>本地 Ollama</strong><span>127.0.0.1:11434 · {draft.model}</span><span className="provider-state-ready">● 本机连接</span></div> : <div className="provider-api-form">
        <div className="provider-form-grid">
          <label className="prototype-field-label">Provider 类型<select aria-label="Provider 类型" value="open_ai_compatible" className="prototype-select" onChange={() => undefined}><option value="open_ai_compatible">OpenAI 兼容 API</option><option value="anthropic" disabled>Anthropic（暂未支持）</option><option value="custom" disabled>自定义协议（暂未支持）</option></select></label>
          <label className="prototype-field-label">模型名称<input aria-label="模型名称" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} className="prototype-field" /></label>
          <label className="prototype-field-label">API 地址<input aria-label="API 地址" value={draft.base_url} onChange={(event) => setDraft({ ...draft, base_url: event.target.value })} className="prototype-field" /></label>
          <label className="prototype-field-label">API Key<input aria-label="API Key" type="password" autoComplete="off" value={apiKey} placeholder={config.api_key_present ? "已配置 · 输入新 Key 可替换" : "请输入 API Key"} onChange={(event) => setApiKey(event.target.value)} className="prototype-field" /></label>
        </div>
        <div className="provider-security-note">安全提示：API Key 只保存到系统凭据存储，界面不回显完整密钥，也不会写入分析历史或日志。</div>
        <p className="provider-remote-warning">隐私提示：使用 API 模型时，所选文件正文会发送到配置的 API 地址。开始分析前还需要再次确认。</p>
        {feedback && <div role={feedback.available ? "status" : "alert"} className={feedback.available ? "provider-feedback is-ready" : "provider-feedback is-warning"}>{feedback.message}</div>}
        <div className="provider-actions"><button type="button" disabled={busy || !draft.model.trim() || !draft.base_url.trim()} onClick={() => void test()} className="prototype-button">测试连接</button><button type="button" disabled={busy || !draft.model.trim() || !draft.base_url.trim()} onClick={() => void save()} className="prototype-button primary">保存 API 配置</button></div>
      </div>}
      {isLocal && status && <div role="status" className="provider-feedback is-ready">{status.message}</div>}
    </section>
  );
}
