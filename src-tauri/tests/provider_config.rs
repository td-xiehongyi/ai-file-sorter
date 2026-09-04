use ai_file_organizer_lib::models::ai_provider::{
    AiProviderConfig, ProviderKind, PublicAiProviderConfig, validate_provider_config,
};

fn config(kind: ProviderKind, base_url: &str, model: &str) -> AiProviderConfig {
    AiProviderConfig {
        id: "default".into(),
        kind,
        display_name: "测试 Provider".into(),
        base_url: base_url.into(),
        model: model.into(),
        enabled: true,
    }
}

#[test]
fn rejects_empty_model_and_base_url() {
    assert!(
        validate_provider_config(&config(ProviderKind::OpenAiCompatible, "", "gpt-test",)).is_err()
    );
    assert!(
        validate_provider_config(&config(
            ProviderKind::OpenAiCompatible,
            "https://api.example.com/v1",
            "",
        ))
        .is_err()
    );
}

#[test]
fn rejects_credentials_embedded_in_url() {
    let result = validate_provider_config(&config(
        ProviderKind::OpenAiCompatible,
        "https://user:secret@api.example.com/v1",
        "gpt-test",
    ));

    assert!(result.is_err());
    assert!(!result.unwrap_err().contains("secret"));
}

#[test]
fn rejects_non_https_remote_api_url() {
    let result = validate_provider_config(&config(
        ProviderKind::OpenAiCompatible,
        "http://api.example.com/v1",
        "gpt-test",
    ));

    assert!(result.is_err());
}

#[test]
fn allows_loopback_development_and_https_api_urls() {
    assert!(
        validate_provider_config(&config(
            ProviderKind::Ollama,
            "http://127.0.0.1:11434",
            "qwen2.5:7b",
        ))
        .is_ok()
    );
    assert!(
        validate_provider_config(&config(
            ProviderKind::OpenAiCompatible,
            "http://localhost:8080/v1",
            "local-test-model",
        ))
        .is_ok()
    );
    assert!(
        validate_provider_config(&config(
            ProviderKind::OpenAiCompatible,
            "https://api.example.com/v1",
            "gpt-test",
        ))
        .is_ok()
    );
}

#[test]
fn public_config_serializes_presence_without_secret_material() {
    let public = PublicAiProviderConfig {
        config: config(
            ProviderKind::OpenAiCompatible,
            "https://api.example.com/v1",
            "gpt-test",
        ),
        api_key_present: true,
    };

    let serialized = serde_json::to_string(&public).unwrap();

    assert!(serialized.contains("api_key_present"));
    assert!(!serialized.contains("\"api_key\""));
    assert!(!serialized.contains("secret"));
}
