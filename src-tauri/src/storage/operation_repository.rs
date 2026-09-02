use rusqlite::{Connection, OptionalExtension, Result, params};

use crate::models::operation::{
    FileSnapshot, HistoryAction, OperationHistoryItem, OperationResultStatus, OperationType,
    UndoStatus,
};

pub type OperationHistoryRecord = (OperationHistoryItem, Option<FileSnapshot>, Option<i64>);

pub fn insert_history(
    connection: &Connection,
    record: &OperationHistoryItem,
    snapshot: Option<&FileSnapshot>,
    reverses_id: Option<i64>,
) -> Result<i64> {
    connection.execute(
        "INSERT INTO operation_history(
           batch_id, action, operation, source_path, target_path, status, reason, created_at,
           snapshot_kind, snapshot_size, snapshot_modified_ms, snapshot_file_identity,
           snapshot_volume_id, reverses_id
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            record.batch_id,
            action_name(&record.action),
            operation_name(&record.operation),
            record.source_path.to_string_lossy(),
            record.target_path.to_string_lossy(),
            result_status_name(&record.status),
            record.reason,
            record.created_at,
            snapshot.map(|value| value.kind.as_str()),
            snapshot.map(|value| value.size as i64),
            snapshot.and_then(|value| value.modified_ms),
            snapshot.and_then(|value| value.file_identity.as_deref()),
            snapshot.and_then(|value| value.volume_id.as_deref()),
            reverses_id,
        ],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn count_history(connection: &Connection) -> Result<i64> {
    connection.query_row("SELECT COUNT(*) FROM operation_history", [], |row| {
        row.get(0)
    })
}

pub fn read_history(
    connection: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<OperationHistoryItem>> {
    read_history_with_deleted(connection, limit, offset, false)
}

pub fn read_history_with_deleted(
    connection: &Connection,
    limit: i64,
    offset: i64,
    include_deleted: bool,
) -> Result<Vec<OperationHistoryItem>> {
    let deleted_filter = if include_deleted {
        ""
    } else {
        "WHERE deleted_at IS NULL"
    };
    let query = format!(
        "SELECT id, batch_id, action, operation, source_path, target_path, status, reason, created_at,
                deleted_at IS NOT NULL
         FROM operation_history
         {deleted_filter}
         ORDER BY created_at DESC, id DESC
         LIMIT ?1 OFFSET ?2"
    );
    let mut statement = connection.prepare(&query)?;
    let rows = statement.query_map(params![limit, offset], |row| {
        Ok(OperationHistoryItem {
            id: row.get(0)?,
            batch_id: row.get(1)?,
            action: parse_action(&row.get::<_, String>(2)?)?,
            operation: parse_operation(&row.get::<_, String>(3)?)?,
            source_path: row.get::<_, String>(4)?.into(),
            target_path: row.get::<_, String>(5)?.into(),
            status: parse_result_status(&row.get::<_, String>(6)?)?,
            reason: row.get(7)?,
            created_at: row.get(8)?,
            undo_status: UndoStatus::Unavailable,
            undo_reason: None,
            is_deleted: row.get(9)?,
        })
    })?;
    rows.collect()
}

pub fn read_history_record(
    connection: &Connection,
    id: i64,
) -> Result<Option<OperationHistoryRecord>> {
    connection
        .query_row(
            "SELECT id, batch_id, action, operation, source_path, target_path, status, reason, created_at,
                    snapshot_kind, snapshot_size, snapshot_modified_ms, snapshot_file_identity,
                    snapshot_volume_id, reverses_id, deleted_at
             FROM operation_history WHERE id = ?1",
            params![id],
            |row| {
                let snapshot_kind: Option<String> = row.get(9)?;
                let snapshot_size: Option<i64> = row.get(10)?;
                let snapshot_modified_ms: Option<i64> = row.get(11)?;
                let snapshot_file_identity: Option<String> = row.get(12)?;
                let snapshot_volume_id: Option<String> = row.get(13)?;
                let snapshot = snapshot_kind.map(|kind| FileSnapshot {
                    kind,
                    size: snapshot_size.unwrap_or_default() as u64,
                    modified_ms: snapshot_modified_ms,
                    file_identity: snapshot_file_identity,
                    volume_id: snapshot_volume_id,
                });
                Ok((
                    OperationHistoryItem {
                        id: row.get(0)?,
                        batch_id: row.get(1)?,
                        action: parse_action(&row.get::<_, String>(2)?)?,
                        operation: parse_operation(&row.get::<_, String>(3)?)?,
                        source_path: row.get::<_, String>(4)?.into(),
                        target_path: row.get::<_, String>(5)?.into(),
                        status: parse_result_status(&row.get::<_, String>(6)?)?,
                        reason: row.get(7)?,
                        created_at: row.get(8)?,
                        undo_status: UndoStatus::Unavailable,
                        undo_reason: None,
                        is_deleted: row.get::<_, Option<String>>(15)?.is_some(),
                    },
                    snapshot,
                    row.get(14)?,
                ))
            },
        )
        .optional()
}

pub fn has_successful_undo(connection: &Connection, history_id: i64) -> Result<bool> {
    connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM operation_history
           WHERE reverses_id = ?1 AND action = 'undo' AND status = 'succeeded'
         )",
        params![history_id],
        |row| row.get(0),
    )
}

pub fn soft_delete_history(
    connection: &Connection,
    history_id: i64,
    deleted_at: &str,
) -> std::result::Result<(), String> {
    let changed = connection
        .execute(
            "UPDATE operation_history SET deleted_at = ?1 WHERE id = ?2 OR reverses_id = ?2",
            params![deleted_at, history_id],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("历史记录不存在。".into());
    }
    Ok(())
}

pub fn restore_history(
    connection: &Connection,
    history_id: i64,
) -> std::result::Result<(), String> {
    let changed = connection
        .execute(
            "UPDATE operation_history SET deleted_at = NULL WHERE id = ?1 OR reverses_id = ?1",
            params![history_id],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("历史记录不存在。".into());
    }
    Ok(())
}

pub fn purge_history(connection: &Connection, history_id: i64) -> std::result::Result<(), String> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let record = transaction
        .query_row(
            "SELECT action, status FROM operation_history WHERE id = ?1",
            params![history_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((action, status)) = record else {
        return Err("历史记录不存在。".into());
    };
    if action == "execute" && status == "succeeded" {
        let has_undo: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM operation_history WHERE reverses_id = ?1 AND action = 'undo' AND status = 'succeeded')",
                params![history_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if !has_undo {
            return Err("该记录仍可撤销，请先撤销后再永久删除。".into());
        }
    }
    transaction
        .execute(
            "DELETE FROM operation_history WHERE reverses_id = ?1",
            params![history_id],
        )
        .map_err(|error| error.to_string())?;
    let changed = transaction
        .execute(
            "DELETE FROM operation_history WHERE id = ?1",
            params![history_id],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("历史记录不存在。".into());
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn action_name(action: &HistoryAction) -> &'static str {
    match action {
        HistoryAction::Execute => "execute",
        HistoryAction::Undo => "undo",
    }
}

fn operation_name(operation: &OperationType) -> &'static str {
    match operation {
        OperationType::Move => "move",
        OperationType::Rename => "rename",
    }
}

fn result_status_name(status: &OperationResultStatus) -> &'static str {
    match status {
        OperationResultStatus::Succeeded => "succeeded",
        OperationResultStatus::Failed => "failed",
        OperationResultStatus::NotExecuted => "not_executed",
    }
}

fn parse_action(value: &str) -> Result<HistoryAction> {
    match value {
        "execute" => Ok(HistoryAction::Execute),
        "undo" => Ok(HistoryAction::Undo),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

fn parse_operation(value: &str) -> Result<OperationType> {
    match value {
        "move" => Ok(OperationType::Move),
        "rename" => Ok(OperationType::Rename),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

fn parse_result_status(value: &str) -> Result<OperationResultStatus> {
    match value {
        "succeeded" => Ok(OperationResultStatus::Succeeded),
        "failed" => Ok(OperationResultStatus::Failed),
        "not_executed" => Ok(OperationResultStatus::NotExecuted),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}
