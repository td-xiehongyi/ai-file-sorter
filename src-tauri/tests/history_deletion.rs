use ai_file_organizer_lib::models::operation::{
    HistoryAction, OperationHistoryItem, OperationResultStatus, OperationType, UndoStatus,
};
use ai_file_organizer_lib::storage::database::open_memory_database;
use ai_file_organizer_lib::storage::operation_repository::{
    insert_history, purge_history, read_history, read_history_with_deleted, restore_history,
    soft_delete_history,
};
use std::path::PathBuf;

fn record(id: &str, action: HistoryAction, status: OperationResultStatus) -> OperationHistoryItem {
    OperationHistoryItem {
        id: 0,
        batch_id: id.into(),
        action,
        operation: OperationType::Move,
        source_path: PathBuf::from("C:/source.txt"),
        target_path: PathBuf::from("C:/target.txt"),
        status,
        reason: None,
        created_at: id.into(),
        undo_status: UndoStatus::Unavailable,
        undo_reason: None,
        is_deleted: false,
    }
}

#[test]
fn soft_delete_hides_history_and_restore_makes_it_visible() {
    let connection = open_memory_database().unwrap();
    let id = insert_history(
        &connection,
        &record("1", HistoryAction::Execute, OperationResultStatus::Failed),
        None,
        None,
    )
    .unwrap();
    soft_delete_history(&connection, id, "200").unwrap();
    assert!(read_history(&connection, 50, 0).unwrap().is_empty());
    assert_eq!(
        read_history_with_deleted(&connection, 50, 0, true)
            .unwrap()
            .len(),
        1
    );
    restore_history(&connection, id).unwrap();
    assert_eq!(read_history(&connection, 50, 0).unwrap().len(), 1);
}

#[test]
fn purge_rejects_undoable_successful_record() {
    let connection = open_memory_database().unwrap();
    let id = insert_history(
        &connection,
        &record(
            "2",
            HistoryAction::Execute,
            OperationResultStatus::Succeeded,
        ),
        None,
        None,
    )
    .unwrap();
    let error = purge_history(&connection, id).unwrap_err();
    assert!(error.contains("撤销"));
}

#[test]
fn purge_removes_undone_parent_and_child() {
    let connection = open_memory_database().unwrap();
    let parent = insert_history(
        &connection,
        &record(
            "3",
            HistoryAction::Execute,
            OperationResultStatus::Succeeded,
        ),
        None,
        None,
    )
    .unwrap();
    let child = insert_history(
        &connection,
        &record("3", HistoryAction::Undo, OperationResultStatus::Succeeded),
        None,
        Some(parent),
    )
    .unwrap();
    soft_delete_history(&connection, parent, "300").unwrap();
    purge_history(&connection, parent).unwrap();
    assert!(
        read_history_with_deleted(&connection, 50, 0, true)
            .unwrap()
            .is_empty()
    );
    assert!(read_history_record_exists(&connection, child).is_none());
}

fn read_history_record_exists(connection: &rusqlite::Connection, id: i64) -> Option<i64> {
    connection
        .query_row(
            "SELECT id FROM operation_history WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .ok()
}
