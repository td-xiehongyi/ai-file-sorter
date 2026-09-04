use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use ai_file_organizer_lib::models::ai_provider::{AiProviderConfig, ProviderKind};
use ai_file_organizer_lib::services::provider_registry::{
    default_provider_config, ensure_remote_content_consent, resolve_provider,
};
use ai_file_organizer_lib::services::secret_store::SecretStore;

#[derive(Default, Clone)]
struct FakeSecretStore {
    values: Arc<Mutex<HashMap<(String, String), String>>>,
}

impl SecretStore for FakeSecretStore {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, String> {
        Ok(self
            .values
            .lock()
            .unwrap()
            .get(&(service.into(), account.into()))
            .cloned())
    }

    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), String> {
        self.values
            .lock()
            .unwrap()
            .insert((service.into(), account.into()), value.into());
        Ok(())
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), String> {
        self.values
            .lock()
            .unwrap()
            .remove(&(service.into(), account.into()));
        Ok(())
    }
}

fn remote_config() -> AiProviderConfig {
    AiProviderConfig {
        id: "remote".into(),
        kind: ProviderKind::OpenAiCompatible,
        display_name: "外部 API".into(),
        base_url: "https://api.example.com/v1".into(),
        model: "gpt-test".into(),
        enabled: true,
    }
}

#[test]
fn default_provider_configuration_is_local_ollama() {
    let config = default_provider_config();

    assert_eq!(config.kind, ProviderKind::Ollama);
    assert_eq!(config.model, "qwen2.5:7b");
    assert_eq!(config.base_url, "http://127.0.0.1:11434");
}

#[test]
fn remote_provider_requires_explicit_content_consent() {
    assert!(ensure_remote_content_consent(&ProviderKind::OpenAiCompatible, false).is_err());
    assert!(ensure_remote_content_consent(&ProviderKind::OpenAiCompatible, true).is_ok());
    assert!(ensure_remote_content_consent(&ProviderKind::Ollama, false).is_ok());
}

#[test]
fn resolver_rejects_remote_provider_without_a_secret() {
    let store = FakeSecretStore::default();

    let error = match resolve_provider(Some(remote_config()), &store) {
        Ok(_) => panic!("missing API Key should reject the provider"),
        Err(error) => error,
    };

    assert!(error.contains("API Key"));
    assert!(!error.contains("secret"));
}
