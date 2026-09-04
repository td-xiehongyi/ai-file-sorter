use rusqlite::{Connection, OptionalExtension, params};

use crate::models::ai_provider::{AiProviderConfig, ProviderKind, validate_provider_config};

pub fn read_active_provider(connection: &Connection) -> rusqlite::Result<Option<AiProviderConfig>> {
    connection
        .query_row(
            "SELECT provider_id, kind, display_name, base_url, model, enabled
             FROM ai_provider_settings
             WHERE singleton_id = 1",
            [],
            |row| {
                let kind: String = row.get(1)?;
                let kind = parse_provider_kind(&kind).map_err(|message| {
                    rusqlite::Error::FromSqlConversionFailure(
                        1,
                        rusqlite::types::Type::Text,
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::InvalidData,
                            message,
                        )),
                    )
                })?;
                Ok(AiProviderConfig {
                    id: row.get(0)?,
                    kind,
                    display_name: row.get(2)?,
                    base_url: row.get(3)?,
                    model: row.get(4)?,
                    enabled: row.get(5)?,
                })
            },
        )
        .optional()
}

pub fn save_active_provider(
    connection: &mut Connection,
    config: &AiProviderConfig,
) -> rusqlite::Result<AiProviderConfig> {
    validate_provider_config(config).map_err(|message| {
        rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            message,
        )))
    })?;
    let kind = provider_kind_value(config.kind);
    connection.execute(
        "INSERT INTO ai_provider_settings(
            singleton_id, provider_id, kind, display_name, base_url, model, enabled, updated_at
         ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(singleton_id) DO UPDATE SET
            provider_id = excluded.provider_id,
            kind = excluded.kind,
            display_name = excluded.display_name,
            base_url = excluded.base_url,
            model = excluded.model,
            enabled = excluded.enabled,
            updated_at = excluded.updated_at",
        params![
            config.id,
            kind,
            config.display_name,
            config.base_url,
            config.model,
            config.enabled,
        ],
    )?;
    Ok(config.clone())
}

fn provider_kind_value(kind: ProviderKind) -> &'static str {
    match kind {
        ProviderKind::Ollama => "ollama",
        ProviderKind::OpenAiCompatible => "open_ai_compatible",
    }
}

fn parse_provider_kind(value: &str) -> Result<ProviderKind, String> {
    match value {
        "ollama" => Ok(ProviderKind::Ollama),
        "open_ai_compatible" => Ok(ProviderKind::OpenAiCompatible),
        _ => Err(format!("未知 Provider 类型：{value}")),
    }
}
