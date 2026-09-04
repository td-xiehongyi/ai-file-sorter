use std::net::IpAddr;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Ollama,
    OpenAiCompatible,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct AiProviderConfig {
    pub id: String,
    pub kind: ProviderKind,
    pub display_name: String,
    pub base_url: String,
    pub model: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct SaveAiProviderConfigRequest {
    pub config: AiProviderConfig,
    #[serde(default)]
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct PublicAiProviderConfig {
    pub config: AiProviderConfig,
    pub api_key_present: bool,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct TestAiProviderRequest {
    pub config: AiProviderConfig,
    #[serde(default)]
    pub api_key: Option<String>,
}

pub fn validate_provider_config(config: &AiProviderConfig) -> Result<(), String> {
    if config.model.trim().is_empty() {
        return Err("模型名称不能为空".into());
    }
    let base_url = config.base_url.trim();
    if base_url.is_empty() {
        return Err("API 地址不能为空".into());
    }
    let url = reqwest::Url::parse(base_url).map_err(|_| "API 地址无效".to_string())?;
    if url.username() != "" || url.password().is_some() {
        return Err("API 地址不能包含用户名或密钥".into());
    }

    let loopback = is_loopback_host(url.host_str());
    match config.kind {
        ProviderKind::Ollama if url.scheme() != "http" || !loopback => {
            Err("Ollama 只允许本机环回 HTTP 地址".into())
        }
        ProviderKind::OpenAiCompatible if url.scheme() != "https" && !loopback => {
            Err("远程 API 地址必须使用 HTTPS".into())
        }
        _ => Ok(()),
    }
}

fn is_loopback_host(host: Option<&str>) -> bool {
    match host {
        Some("localhost") => true,
        Some(value) => value
            .parse::<IpAddr>()
            .is_ok_and(|address| address.is_loopback()),
        None => false,
    }
}
