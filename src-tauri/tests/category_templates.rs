use std::fs;

use ai_file_organizer_lib::models::ai::{AnalysisResultStatus, Category, TemplateCategory};
use ai_file_organizer_lib::storage::{ai_repository, database};

fn temp_root(label: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!(
        "ai-file-organizer-template-{label}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&path).unwrap();
    fs::canonicalize(path).unwrap()
}

#[test]
fn template_round_trip_increments_version_without_directory_paths() {
    let mut connection = database::open_memory_database().unwrap();
    let categories = vec![TemplateCategory {
        id: "work".into(),
        name: "工作".into(),
        description: "工作资料".into(),
        default_enabled: true,
    }];

    let first = ai_repository::upsert_category_template(
        &mut connection,
        "default",
        "默认模板",
        &categories,
        "1",
    )
    .unwrap();
    assert_eq!(first.version, 1);
    assert_eq!(first.categories, categories);

    let updated_categories = vec![TemplateCategory {
        description: "工作资料与会议".into(),
        ..categories[0].clone()
    }];
    let second = ai_repository::upsert_category_template(
        &mut connection,
        "default",
        "默认模板",
        &updated_categories,
        "2",
    )
    .unwrap();
    assert_eq!(second.version, 2);
    assert_eq!(
        ai_repository::read_category_templates(&connection).unwrap(),
        vec![second]
    );
}

#[test]
fn global_template_reference_is_unique_and_reported_with_templates() {
    let mut connection = database::open_memory_database().unwrap();
    let categories = vec![TemplateCategory {
        id: "work".into(),
        name: "工作".into(),
        description: "工作资料".into(),
        default_enabled: true,
    }];
    ai_repository::upsert_category_template(
        &mut connection,
        "first",
        "第一个模板",
        &categories,
        "1",
    )
    .unwrap();
    ai_repository::upsert_category_template(
        &mut connection,
        "second",
        "第二个模板",
        &categories,
        "2",
    )
    .unwrap();

    assert!(ai_repository::set_global_category_template(&mut connection, "first", "3").unwrap());
    assert!(ai_repository::set_global_category_template(&mut connection, "second", "4").unwrap());
    assert_eq!(
        ai_repository::read_global_category_template_id(&connection).unwrap(),
        Some("second".into())
    );
    let templates = ai_repository::read_category_templates(&connection).unwrap();
    assert!(
        !templates
            .iter()
            .find(|item| item.id == "first")
            .unwrap()
            .is_global
    );
    assert!(
        templates
            .iter()
            .find(|item| item.id == "second")
            .unwrap()
            .is_global
    );
}

#[test]
fn renaming_non_global_template_keeps_version_and_global_template_is_protected() {
    let mut connection = database::open_memory_database().unwrap();
    let categories = vec![TemplateCategory {
        id: "work".into(),
        name: "工作".into(),
        description: "工作资料".into(),
        default_enabled: true,
    }];
    let global = ai_repository::upsert_category_template(
        &mut connection,
        "global",
        "全局模板",
        &categories,
        "1",
    )
    .unwrap();
    let ordinary = ai_repository::upsert_category_template(
        &mut connection,
        "ordinary",
        "普通模板",
        &categories,
        "2",
    )
    .unwrap();
    ai_repository::set_global_category_template(&mut connection, &global.id, "3").unwrap();

    assert!(
        ai_repository::rename_category_template(&connection, &ordinary.id, "已重命名模板", "4",)
            .unwrap()
    );
    let renamed = ai_repository::read_category_template(&connection, &ordinary.id)
        .unwrap()
        .unwrap();
    assert_eq!(renamed.name, "已重命名模板");
    assert_eq!(renamed.version, ordinary.version);
    assert!(
        !ai_repository::rename_category_template(&connection, &global.id, "禁止重命名", "5",)
            .unwrap()
    );
    assert_eq!(
        ai_repository::read_category_template(&connection, &global.id)
            .unwrap()
            .unwrap()
            .name,
        "全局模板"
    );
}

#[test]
fn template_name_lookup_is_case_insensitive_and_can_exclude_the_current_template() {
    let mut connection = database::open_memory_database().unwrap();
    ai_repository::upsert_category_template(
        &mut connection,
        "work-template",
        "Work Files",
        &[TemplateCategory {
            id: "work".into(),
            name: "工作".into(),
            description: "工作资料".into(),
            default_enabled: true,
        }],
        "1",
    )
    .unwrap();

    assert!(ai_repository::category_template_name_exists(&connection, "work files", None).unwrap());
    assert!(
        !ai_repository::category_template_name_exists(
            &connection,
            "WORK FILES",
            Some("work-template"),
        )
        .unwrap()
    );
}

#[test]
fn template_name_uniqueness_is_enforced_inside_save_and_rename_mutations() {
    let mut connection = database::open_memory_database().unwrap();
    let categories = [TemplateCategory {
        id: "work".into(),
        name: "工作".into(),
        description: "工作资料".into(),
        default_enabled: true,
    }];
    ai_repository::upsert_category_template(
        &mut connection,
        "first",
        "Work Files",
        &categories,
        "1",
    )
    .unwrap();
    ai_repository::upsert_category_template(&mut connection, "second", "Second", &categories, "2")
        .unwrap();

    assert!(
        ai_repository::upsert_category_template(
            &mut connection,
            "third",
            "work files",
            &categories,
            "3",
        )
        .is_err()
    );
    assert!(
        !ai_repository::rename_category_template(&connection, "second", "WORK FILES", "4",)
            .unwrap()
    );
}

#[test]
fn deleting_global_template_is_rejected_without_unbinding_roots() {
    let root = temp_root("delete-global");
    let mut connection = database::open_memory_database().unwrap();
    let template = ai_repository::upsert_category_template(
        &mut connection,
        "global",
        "全局模板",
        &[TemplateCategory {
            id: "work".into(),
            name: "工作".into(),
            description: "工作资料".into(),
            default_enabled: true,
        }],
        "1",
    )
    .unwrap();
    ai_repository::bind_root_to_category_template(
        &connection,
        &root.to_string_lossy(),
        &template.id,
        template.version,
    )
    .unwrap();
    ai_repository::set_global_category_template(&mut connection, &template.id, "2").unwrap();

    assert!(ai_repository::delete_category_template(&mut connection, &template.id).is_err());
    assert_eq!(
        ai_repository::read_root_category_template(&connection, &root.to_string_lossy()).unwrap(),
        Some((template.id.clone(), template.version))
    );
    assert!(
        ai_repository::read_category_template(&connection, &template.id)
            .unwrap()
            .is_some()
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn applying_template_copies_root_categories_and_keeps_template_binding() {
    let root = temp_root("apply");
    let work = root.join("work");
    fs::create_dir_all(&work).unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let template = ai_repository::upsert_category_template(
        &mut connection,
        "default",
        "默认模板",
        &[TemplateCategory {
            id: "work".into(),
            name: "工作".into(),
            description: "工作资料".into(),
            default_enabled: true,
        }],
        "1",
    )
    .unwrap();
    let categories = vec![Category {
        id: "work".into(),
        name: "工作".into(),
        description: "工作资料".into(),
        directory_path: work.to_string_lossy().into(),
        enabled: true,
    }];

    ai_repository::replace_categories(&mut connection, &root.to_string_lossy(), &categories)
        .unwrap();
    ai_repository::bind_root_to_category_template(
        &connection,
        &root.to_string_lossy(),
        &template.id,
        template.version,
    )
    .unwrap();

    assert_eq!(
        ai_repository::read_categories(&connection, &root.to_string_lossy()).unwrap(),
        categories
    );
    assert_eq!(
        ai_repository::read_root_category_template(&connection, &root.to_string_lossy()).unwrap(),
        Some(("default".into(), 1))
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn deleting_template_keeps_applied_root_categories() {
    let root = temp_root("delete-template");
    let work = root.join("work");
    fs::create_dir_all(&work).unwrap();
    let mut connection = database::open_memory_database().unwrap();
    let template = ai_repository::upsert_category_template(
        &mut connection,
        "default",
        "默认模板",
        &[TemplateCategory {
            id: "work".into(),
            name: "工作".into(),
            description: "工作资料".into(),
            default_enabled: true,
        }],
        "1",
    )
    .unwrap();
    ai_repository::replace_categories(
        &mut connection,
        &root.to_string_lossy(),
        &[Category {
            id: "work".into(),
            name: "工作".into(),
            description: "工作资料".into(),
            directory_path: work.to_string_lossy().into(),
            enabled: true,
        }],
    )
    .unwrap();
    ai_repository::bind_root_to_category_template(
        &connection,
        &root.to_string_lossy(),
        &template.id,
        template.version,
    )
    .unwrap();

    assert!(ai_repository::delete_category_template(&mut connection, &template.id).unwrap());
    assert!(
        ai_repository::read_category_template(&connection, &template.id)
            .unwrap()
            .is_none()
    );
    assert_eq!(
        ai_repository::read_categories(&connection, &root.to_string_lossy())
            .unwrap()
            .len(),
        1
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn deleting_category_removes_only_configuration_and_pending_reference_blocks_it() {
    let root = temp_root("delete");
    let work = root.join("work");
    let source = root.join("notes.md");
    fs::create_dir_all(&work).unwrap();
    fs::write(&source, "正文").unwrap();
    let mut connection = database::open_memory_database().unwrap();
    ai_repository::replace_categories(
        &mut connection,
        &root.to_string_lossy(),
        &[Category {
            id: "work".into(),
            name: "工作".into(),
            description: "工作资料".into(),
            directory_path: work.to_string_lossy().into(),
            enabled: true,
        }],
    )
    .unwrap();

    assert_eq!(
        ai_repository::count_pending_category_references(
            &connection,
            &root.to_string_lossy(),
            "work",
        )
        .unwrap(),
        0
    );
    ai_repository::delete_category(&connection, &root.to_string_lossy(), "work").unwrap();
    assert!(
        ai_repository::read_categories(&connection, &root.to_string_lossy())
            .unwrap()
            .is_empty()
    );
    assert!(work.is_dir());
    assert!(source.is_file());

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn pending_result_reference_is_counted_for_safe_delete() {
    let connection = database::open_memory_database().unwrap();
    connection
        .execute(
            "INSERT INTO ai_analysis_results (
                id, batch_id, root_path, source_path, content_fingerprint, provider, model,
                prompt_version, summary, keywords_json, suggested_filename, category_id,
                confidence, reason, status, created_at
             ) VALUES ('r1', 'b1', 'C:/root', 'C:/root/a.md', 'fp', 'ollama', 'qwen2.5:7b',
                       'phase5-v1', '摘要', '[\"资料\"]', 'a.md', 'work', 0.9, '原因', 'pending', '1')",
            [],
        )
        .unwrap();
    assert_eq!(
        ai_repository::count_pending_category_references(&connection, "C:/root", "work").unwrap(),
        1
    );
    assert_eq!(AnalysisResultStatus::Pending.as_str(), "pending");
}
