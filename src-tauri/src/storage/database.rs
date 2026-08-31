use std::path::Path;
use std::time::Duration;

use rusqlite::functions::FunctionFlags;
use rusqlite::{Connection, Result};

use crate::storage::ai_repository;

pub fn open_database(path: &Path) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    }
    let connection = Connection::open(path)?;
    configure_connection(&connection, true)?;
    migrate(&connection)?;
    Ok(connection)
}

pub fn open_memory_database() -> Result<Connection> {
    let connection = Connection::open_in_memory()?;
    configure_connection(&connection, false)?;
    migrate(&connection)?;
    Ok(connection)
}

fn configure_connection(connection: &Connection, persistent: bool) -> Result<()> {
    connection.pragma_update(None, "foreign_keys", true)?;
    connection.busy_timeout(Duration::from_secs(5))?;
    if persistent {
        connection.pragma_update(None, "journal_mode", "WAL")?;
    }
    connection.create_scalar_function(
        "unicode_lower",
        1,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |context| {
            let value = context.get::<String>(0)?;
            Ok(value.to_lowercase())
        },
    )?;
    Ok(())
}

fn migrate(connection: &Connection) -> Result<()> {
    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version < 1 {
        connection.execute_batch(include_str!("migrations/001_initial.sql"))?;
        connection.pragma_update(None, "user_version", 1)?;
    }
    if version < 2 {
        connection.execute_batch(include_str!("migrations/002_operation_history.sql"))?;
        connection.pragma_update(None, "user_version", 2)?;
    }
    if version < 3 {
        connection.execute_batch(include_str!("migrations/003_ai_analysis.sql"))?;
        connection.pragma_update(None, "user_version", 3)?;
    }
    if version < 4 {
        connection.execute_batch(include_str!("migrations/004_category_templates.sql"))?;
        connection.pragma_update(None, "user_version", 4)?;
    }
    if version < 5 {
        connection.execute_batch(include_str!("migrations/005_category_id_directories.sql"))?;
        ai_repository::migrate_category_directories(connection)?;
        connection.pragma_update(None, "user_version", 5)?;
    }
    if version < 6 {
        connection.execute_batch(include_str!("migrations/006_global_category_template.sql"))?;
        connection.pragma_update(None, "user_version", 6)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connections_enable_integrity_and_contention_policies() {
        let connection = open_memory_database().unwrap();
        let foreign_keys: i64 = connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        let busy_timeout: i64 = connection
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .unwrap();
        let user_version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);
        assert_eq!(busy_timeout, 5_000);
        assert_eq!(user_version, 6);
    }

    #[test]
    fn version_five_data_is_preserved_when_migrating_to_version_six() {
        let path = std::env::temp_dir().join(format!(
            "ai-file-sorter-v5-migration-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        {
            let connection = Connection::open(&path).unwrap();
            configure_connection(&connection, false).unwrap();
            connection
                .execute_batch(include_str!("migrations/001_initial.sql"))
                .unwrap();
            connection
                .execute_batch(include_str!("migrations/002_operation_history.sql"))
                .unwrap();
            connection
                .execute_batch(include_str!("migrations/003_ai_analysis.sql"))
                .unwrap();
            connection
                .execute_batch(include_str!("migrations/004_category_templates.sql"))
                .unwrap();
            connection
                .execute_batch(include_str!("migrations/005_category_id_directories.sql"))
                .unwrap();
            connection
                .execute_batch(
                    "INSERT INTO ai_category_templates VALUES ('work-template', '工作模板', 2, '1', '2');
                     INSERT INTO ai_category_template_items VALUES ('work-template', 'work', '工作', '工作资料', 1);
                     INSERT INTO ai_root_category_templates VALUES ('C:/root', 'work-template', 2);
                     INSERT INTO ai_categories VALUES ('C:/root', 'work', '工作', '工作资料', 'C:/root/work', 1);
                     INSERT INTO ai_analysis_results (
                         id, batch_id, root_path, source_path, content_fingerprint, provider, model,
                         prompt_version, template_id, template_version, summary, keywords_json,
                         suggested_filename, category_id, confidence, reason, status, created_at
                     ) VALUES (
                         'result-1', 'batch-1', 'C:/root', 'C:/root/a.md', 'fingerprint',
                         'ollama', 'qwen2.5:7b', 'phase5-v1', 'work-template', 2,
                         '摘要', '[\"工作\"]', 'a.md', 'work', 0.9, '原因', 'pending', '3'
                     );
                     PRAGMA user_version = 5;",
                )
                .unwrap();
        }

        let connection = open_database(&path).unwrap();
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 6);
        assert_eq!(
            ai_repository::read_global_category_template_id(&connection).unwrap(),
            None
        );
        assert_eq!(
            ai_repository::read_category_templates(&connection)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            ai_repository::read_root_category_template(&connection, "C:/root").unwrap(),
            Some(("work-template".into(), 2))
        );
        assert_eq!(
            ai_repository::read_categories(&connection, "C:/root")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            ai_repository::read_analysis_result_categories(&connection, "result-1").unwrap(),
            Vec::new()
        );
        assert!(
            ai_repository::read_result(&connection, "result-1")
                .unwrap()
                .is_some()
        );
        drop(connection);
        std::fs::remove_file(path).unwrap();
    }
}
