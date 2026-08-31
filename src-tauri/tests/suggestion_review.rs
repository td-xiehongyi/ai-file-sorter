use std::fs;

use ai_file_organizer_lib::models::ai::{AiAnalysisRecord, AnalysisResultStatus, Category};
use ai_file_organizer_lib::models::operation::{
    OperationDraftItem, OperationPreview, OperationPreviewItem, OperationType,
    OperationValidationStatus,
};
use ai_file_organizer_lib::services::content_extractor::fingerprint_file;
use ai_file_organizer_lib::services::operation_validator::validate_draft;
use ai_file_organizer_lib::services::plan_store::PlanStore;
use ai_file_organizer_lib::services::suggestion_review::{
    ReviewAction, confirm_result_preview, confirm_results_preview, review_result,
};
use ai_file_organizer_lib::storage::{ai_repository, database};

fn temp_root(label: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "ai-file-organizer-review-{label}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    fs::canonicalize(root).unwrap()
}

fn seed(
    connection: &mut rusqlite::Connection,
    root: &std::path::Path,
    source: &std::path::Path,
) -> AiAnalysisRecord {
    let category_directory = root.join("work");
    fs::create_dir_all(&category_directory).unwrap();
    ai_repository::replace_categories(
        connection,
        &root.to_string_lossy(),
        &[Category {
            id: "work".into(),
            name: "工作".into(),
            description: "工作资料".into(),
            directory_path: category_directory.to_string_lossy().into(),
            enabled: true,
        }],
    )
    .unwrap();
    let record = AiAnalysisRecord {
        id: "result-1".into(),
        batch_id: "batch-1".into(),
        root_path: root.to_string_lossy().into(),
        source_path: source.to_string_lossy().into(),
        content_fingerprint: fingerprint_file(source).unwrap(),
        provider: "ollama".into(),
        model: "qwen2.5:7b".into(),
        prompt_version: "phase5-v1".into(),
        template_id: None,
        template_version: None,
        summary: "会议纪要".into(),
        keywords: vec!["会议".into()],
        suggested_filename: "项目会议.md".into(),
        category_id: Some("work".into()),
        confidence: 0.9,
        reason: "工作资料".into(),
        status: AnalysisResultStatus::Pending,
        created_at: "1".into(),
    };
    ai_repository::insert_analysis_result(connection, &record).unwrap();
    record
}

#[test]
fn accepting_a_current_result_returns_a_fingerprint_bound_operation_draft() {
    let root = temp_root("accept");
    let source = root.join("notes.md");
    fs::write(&source, "正文").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let record = seed(&mut connection, &root, &source);

    let draft = review_result(
        &connection,
        &record.id,
        ReviewAction::Accept,
        Some("最终名称.md".into()),
        Some("work".into()),
    )
    .unwrap()
    .unwrap();

    assert_eq!(draft.root_path, root.to_string_lossy());
    assert!(matches!(
        &draft.items[0],
        OperationDraftItem::AiOrganize { new_name, content_fingerprint, .. }
            if new_name == "最终名称.md" && content_fingerprint.as_str() == record.content_fingerprint
    ));
    assert_eq!(
        ai_repository::read_result(&connection, &record.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Pending
    );

    let plan_store = PlanStore::default();
    let token = plan_store
        .create(OperationPreview {
            can_confirm: true,
            items: vec![OperationPreviewItem {
                index: 0,
                operation: OperationType::Move,
                source_path: source.clone(),
                target_path: root.join("work/最终名称.md"),
                status: OperationValidationStatus::Valid,
                reason: None,
                snapshot: None,
                content_fingerprint: Some(record.content_fingerprint.clone()),
                will_create_directory: false,
            }],
        })
        .unwrap();
    confirm_result_preview(&connection, &plan_store, &record.id, &token.plan_id).unwrap();
    assert_eq!(
        ai_repository::read_result(&connection, &record.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Accepted
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn confirming_with_an_unrelated_plan_keeps_the_result_pending() {
    let root = temp_root("unrelated-plan");
    let source = root.join("notes.md");
    fs::write(&source, "正文").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let record = seed(&mut connection, &root, &source);
    let plan_store = PlanStore::default();
    let token = plan_store
        .create(OperationPreview {
            can_confirm: true,
            items: vec![OperationPreviewItem {
                index: 0,
                operation: OperationType::Rename,
                source_path: source.clone(),
                target_path: root.join("unrelated/renamed.md"),
                status: OperationValidationStatus::Valid,
                reason: None,
                snapshot: None,
                content_fingerprint: Some(record.content_fingerprint.clone()),
                will_create_directory: false,
            }],
        })
        .unwrap();

    assert!(
        confirm_result_preview(&connection, &plan_store, &record.id, &token.plan_id)
            .unwrap_err()
            .contains("不匹配")
    );
    assert_eq!(
        ai_repository::read_result(&connection, &record.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Pending
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn confirming_a_batch_marks_all_results_only_after_one_matching_plan() {
    let root = temp_root("batch-confirm");
    let source_one = root.join("notes.md");
    let source_two = root.join("table.md");
    fs::write(&source_one, "会议正文").unwrap();
    fs::write(&source_two, "项目表格").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let first = seed(&mut connection, &root, &source_one);
    let second = AiAnalysisRecord {
        id: "result-2".into(),
        source_path: source_two.to_string_lossy().into(),
        content_fingerprint: fingerprint_file(&source_two).unwrap(),
        suggested_filename: "项目表格.md".into(),
        created_at: "2".into(),
        ..first.clone()
    };
    ai_repository::insert_analysis_result(&connection, &second).unwrap();

    let first_draft = review_result(
        &connection,
        &first.id,
        ReviewAction::Accept,
        None,
        Some("work".into()),
    )
    .unwrap()
    .unwrap();
    let second_draft = review_result(
        &connection,
        &second.id,
        ReviewAction::Accept,
        None,
        Some("work".into()),
    )
    .unwrap()
    .unwrap();
    let mut first_preview = validate_draft(&first_draft).unwrap();
    let mut second_preview = validate_draft(&second_draft).unwrap();
    assert!(first_preview.can_confirm && second_preview.can_confirm);
    second_preview.items[0].index = 1;
    first_preview.items.append(&mut second_preview.items);
    let plan_store = PlanStore::default();
    let token = plan_store.create(first_preview).unwrap();

    confirm_results_preview(
        &mut connection,
        &plan_store,
        &[first.id.clone(), second.id.clone()],
        &token.plan_id,
    )
    .unwrap();
    assert_eq!(
        ai_repository::read_result(&connection, &first.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Accepted
    );
    assert_eq!(
        ai_repository::read_result(&connection, &second.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Accepted
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn confirming_a_batch_with_duplicate_or_empty_ids_is_rejected() {
    let root = temp_root("batch-invalid-ids");
    let source = root.join("notes.md");
    fs::write(&source, "正文").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let record = seed(&mut connection, &root, &source);
    let plan_store = PlanStore::default();

    assert!(confirm_results_preview(&mut connection, &plan_store, &[], "missing").is_err());
    assert!(
        confirm_results_preview(
            &mut connection,
            &plan_store,
            &[record.id.clone(), record.id.clone()],
            "missing",
        )
        .unwrap_err()
        .contains("重复")
    );
    assert_eq!(
        ai_repository::read_result(&connection, &record.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Pending
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn confirming_a_batch_with_a_stale_result_keeps_the_other_result_pending() {
    let root = temp_root("batch-stale");
    let source_one = root.join("notes.md");
    let source_two = root.join("table.md");
    fs::write(&source_one, "会议正文").unwrap();
    fs::write(&source_two, "项目表格").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let first = seed(&mut connection, &root, &source_one);
    let second = AiAnalysisRecord {
        id: "result-2".into(),
        source_path: source_two.to_string_lossy().into(),
        content_fingerprint: fingerprint_file(&source_two).unwrap(),
        suggested_filename: "项目表格.md".into(),
        created_at: "2".into(),
        ..first.clone()
    };
    ai_repository::insert_analysis_result(&connection, &second).unwrap();
    let first_draft = review_result(
        &connection,
        &first.id,
        ReviewAction::Accept,
        None,
        Some("work".into()),
    )
    .unwrap()
    .unwrap();
    let second_draft = review_result(
        &connection,
        &second.id,
        ReviewAction::Accept,
        None,
        Some("work".into()),
    )
    .unwrap()
    .unwrap();
    let mut preview_one = validate_draft(&first_draft).unwrap();
    let mut preview_two = validate_draft(&second_draft).unwrap();
    preview_two.items[0].index = 1;
    preview_one.items.append(&mut preview_two.items);
    let plan_store = PlanStore::default();
    let token = plan_store.create(preview_one).unwrap();
    fs::write(&source_two, "内容已变化").unwrap();

    assert!(
        confirm_results_preview(
            &mut connection,
            &plan_store,
            &[first.id.clone(), second.id.clone()],
            &token.plan_id,
        )
        .unwrap_err()
        .contains("过期")
    );
    assert_eq!(
        ai_repository::read_result(&connection, &first.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Pending
    );
    assert_eq!(
        ai_repository::read_result(&connection, &second.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Expired
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn accepting_a_generated_category_with_a_safe_name_targets_the_name_directory() {
    let root = temp_root("generated-category-name");
    let source = root.join("notes.md");
    fs::write(&source, "正文").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let record = AiAnalysisRecord {
        id: "result-generated".into(),
        batch_id: "batch-generated".into(),
        root_path: root.to_string_lossy().into(),
        source_path: source.to_string_lossy().into(),
        content_fingerprint: fingerprint_file(&source).unwrap(),
        provider: "ollama".into(),
        model: "qwen2.5:7b".into(),
        prompt_version: "phase5-v1".into(),
        template_id: None,
        template_version: None,
        summary: "学习资料".into(),
        keywords: vec!["学习".into()],
        suggested_filename: "学习资料.md".into(),
        category_id: Some("category_2".into()),
        confidence: 0.9,
        reason: "学习资料".into(),
        status: AnalysisResultStatus::Pending,
        created_at: "1".into(),
    };
    ai_repository::replace_categories(
        &mut connection,
        &root.to_string_lossy(),
        &[Category {
            id: "category_2".into(),
            name: "study".into(),
            description: "学习资料".into(),
            directory_path: root.join("category_2").to_string_lossy().into(),
            enabled: true,
        }],
    )
    .unwrap();
    ai_repository::insert_analysis_result(&connection, &record).unwrap();

    let draft = review_result(
        &connection,
        &record.id,
        ReviewAction::Accept,
        None,
        Some("category_2".into()),
    )
    .unwrap()
    .unwrap();

    assert!(matches!(
        &draft.items[0],
        OperationDraftItem::AiOrganize { category_id, .. } if category_id == "study"
    ));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn accepting_a_regular_category_id_uses_the_display_name_directory() {
    let root = temp_root("regular-category-name");
    let source = root.join("notes.md");
    fs::write(&source, "正文").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let record = AiAnalysisRecord {
        id: "result-regular-name".into(),
        batch_id: "batch-regular-name".into(),
        root_path: root.to_string_lossy().into(),
        source_path: source.to_string_lossy().into(),
        content_fingerprint: fingerprint_file(&source).unwrap(),
        provider: "ollama".into(),
        model: "qwen2.5:7b".into(),
        prompt_version: "phase5-v1".into(),
        template_id: None,
        template_version: None,
        summary: "代码资料".into(),
        keywords: vec!["代码".into()],
        suggested_filename: "代码资料.md".into(),
        category_id: Some("c".into()),
        confidence: 0.9,
        reason: "代码资料".into(),
        status: AnalysisResultStatus::Pending,
        created_at: "1".into(),
    };
    ai_repository::replace_categories(
        &mut connection,
        &root.to_string_lossy(),
        &[Category {
            id: "c".into(),
            name: "code".into(),
            description: "代码资料".into(),
            directory_path: root.join("c").to_string_lossy().into(),
            enabled: true,
        }],
    )
    .unwrap();
    ai_repository::insert_analysis_result(&connection, &record).unwrap();

    let draft = review_result(
        &connection,
        &record.id,
        ReviewAction::Accept,
        None,
        Some("c".into()),
    )
    .unwrap()
    .unwrap();

    assert!(matches!(
        &draft.items[0],
        OperationDraftItem::AiOrganize { category_id, .. } if category_id == "code"
    ));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn template_result_review_uses_the_frozen_categories_without_root_configuration() {
    let root = temp_root("template-snapshot");
    let source = root.join("invoice.md");
    fs::write(&source, "账单正文").unwrap();
    let connection = database::open_memory_database().unwrap();
    let record = AiAnalysisRecord {
        id: "result-template".into(),
        batch_id: "batch-template".into(),
        root_path: root.to_string_lossy().into(),
        source_path: source.to_string_lossy().into(),
        content_fingerprint: fingerprint_file(&source).unwrap(),
        provider: "ollama".into(),
        model: "qwen2.5:7b".into(),
        prompt_version: "phase5-v1".into(),
        template_id: Some("finance-template".into()),
        template_version: Some(3),
        summary: "账单".into(),
        keywords: vec!["账单".into()],
        suggested_filename: "八月账单.md".into(),
        category_id: Some("finance".into()),
        confidence: 0.9,
        reason: "财务资料".into(),
        status: AnalysisResultStatus::Pending,
        created_at: "1".into(),
    };
    let frozen_categories = vec![Category {
        id: "finance".into(),
        name: "财务".into(),
        description: "账单与合同".into(),
        directory_path: root.join("finance").to_string_lossy().into(),
        enabled: true,
    }];
    ai_repository::insert_analysis_result_with_categories(&connection, &record, &frozen_categories)
        .unwrap();

    let draft = review_result(
        &connection,
        &record.id,
        ReviewAction::Accept,
        None,
        Some("finance".into()),
    )
    .unwrap()
    .unwrap();

    assert!(matches!(
        &draft.items[0],
        OperationDraftItem::AiOrganize { category_id, .. } if category_id == "finance"
    ));
    assert_eq!(
        ai_repository::read_analysis_result_categories(&connection, &record.id).unwrap(),
        frozen_categories
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejecting_a_result_updates_status_without_creating_an_operation() {
    let root = temp_root("reject");
    let source = root.join("notes.md");
    fs::write(&source, "正文").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let record = seed(&mut connection, &root, &source);

    assert!(
        review_result(&connection, &record.id, ReviewAction::Reject, None, None)
            .unwrap()
            .is_none()
    );
    assert_eq!(
        ai_repository::read_result(&connection, &record.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Rejected
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn accepting_a_stale_result_marks_it_expired_and_returns_no_draft() {
    let root = temp_root("stale");
    let source = root.join("notes.md");
    fs::write(&source, "原文").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let record = seed(&mut connection, &root, &source);
    fs::write(&source, "替换").unwrap();

    assert!(
        review_result(&connection, &record.id, ReviewAction::Accept, None, None)
            .unwrap_err()
            .contains("过期")
    );
    assert_eq!(
        ai_repository::read_result(&connection, &record.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Expired
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn accepting_a_result_whose_source_is_no_longer_a_file_marks_it_expired() {
    let root = temp_root("source-type-changed");
    let source = root.join("notes.md");
    fs::write(&source, "原文").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let record = seed(&mut connection, &root, &source);
    fs::remove_file(&source).unwrap();
    fs::create_dir(&source).unwrap();

    assert!(review_result(&connection, &record.id, ReviewAction::Accept, None, None,).is_err());
    assert_eq!(
        ai_repository::read_result(&connection, &record.id)
            .unwrap()
            .unwrap()
            .status,
        AnalysisResultStatus::Expired
    );
    fs::remove_dir_all(root).unwrap();
}
