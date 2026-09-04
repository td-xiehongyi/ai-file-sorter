use crate::ai::AiProvider;
use crate::ai::ollama::{DEFAULT_MODEL, DEFAULT_OLLAMA_ENDPOINT, OllamaProvider};
use crate::ai::openai_compatible::OpenAiCompatibleProvider;
use crate::models::ai_provider::{AiProviderConfig, ProviderKind, PublicAiProviderConfig};
use crate::services::secret_store::{SECRET_SERVICE, SecretStore};

pub fn default_provider_config() -> AiProviderConfig {
    AiProviderConfig {
        id: "ollama-default".into(),
        kind: ProviderKind::Ollama,
        display_name: "本地 Ollama".into(),
        base_url: DEFAULT_OLLAMA_ENDPOINT.into(),
        model: DEFAULT_MODEL.into(),
        enabled: true,
    }
}

pub fn ensure_remote_content_consent(
    kind: &ProviderKind,
    remote_content_consent: bool,
) -> Result<(), String> {
    if matches!(kind, ProviderKind::OpenAiCompatible) && !remote_content_consent {
        return Err("开始远程分析前必须明确同意发送所选文件正文".into());
    }
    Ok(())
}

pub fn resolve_provider(
    config: Option<AiProviderConfig>,
    secret_store: &dyn SecretStore,
) -> Result<Box<dyn AiProvider>, String> {
    let config = config.unwrap_or_else(default_provider_config);
    resolve_provider_with_key(config, None, secret_store)
}

pub fn resolve_provider_with_key(
    config: AiProviderConfig,
    api_key: Option<String>,
    secret_store: &dyn SecretStore,
) -> Result<Box<dyn AiProvider>, String> {
    if !config.enabled {
        return Err("当前 Provider 已停用".into());
    }
    match config.kind {
        ProviderKind::Ollama => Ok(Box::new(OllamaProvider::new(
            config.base_url,
            config.model,
        )?)),
        ProviderKind::OpenAiCompatible => {
            let api_key = api_key
                .or(secret_store.get(SECRET_SERVICE, &config.id)?)
                .ok_or_else(|| "当前 Provider 未配置 API Key".to_string())?;
            Ok(Box::new(OpenAiCompatibleProvider::new(config, api_key)?))
        }
    }
}

pub fn public_provider_config(
    config: Option<AiProviderConfig>,
    secret_store: &dyn SecretStore,
) -> Result<PublicAiProviderConfig, String> {
    let config = config.unwrap_or_else(default_provider_config);
    let api_key_present = matches!(config.kind, ProviderKind::OpenAiCompatible)
        && secret_store.get(SECRET_SERVICE, &config.id)?.is_some();
    Ok(PublicAiProviderConfig {
        config,
        api_key_present,
    })
}
