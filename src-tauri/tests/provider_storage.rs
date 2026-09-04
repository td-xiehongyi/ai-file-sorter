use ai_file_organizer_lib::models::ai_provider::{AiProviderConfig, ProviderKind};
use ai_file_organizer_lib::storage::{ai_provider_repository, database};

fn config() -> AiProviderConfig {
    AiProviderConfig {
        id: "default".into(),
        kind: ProviderKind::OpenAiCompatible,
        display_name: "兼容 API".into(),
        base_url: "https://api.example.com/v1".into(),
        model: "gpt-test".into(),
        enabled: true,
    }
}

#[test]
fn provider_migration_stores_metadata_without_secret_columns() {
    let connection = database::open_memory_database().unwrap();
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    let columns: Vec<String> = connection
        .prepare("PRAGMA table_info(ai_provider_settings)")
        .unwrap()
        .query_map([], |row| row.get(1))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();

    assert_eq!(version, 8);
    assert!(
        !columns.iter().any(|column| {
            matches!(column.as_str(), "api_key" | "secret" | "token" | "password")
        })
    );
}

#[test]
fn provider_metadata_round_trips_through_sqlite() {
    let mut connection = database::open_memory_database().unwrap();

    ai_provider_repository::save_active_provider(&mut connection, &config()).unwrap();

    assert_eq!(
        ai_provider_repository::read_active_provider(&connection).unwrap(),
        Some(config())
    );
}
