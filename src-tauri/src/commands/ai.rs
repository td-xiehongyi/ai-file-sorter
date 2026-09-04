use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::ai::ProviderStatus;
use crate::ai::ollama::DEFAULT_MODEL;
use crate::commands::AppError;
use crate::models::ai::{
    AiAnalysisRecord, AnalysisBatchStatus, AnalysisResultStatus, AnalysisTaskSnapshot, Category,
    CategoryTemplate, TemplateCategory,
};
use crate::models::ai_provider::{
    AiProviderConfig, ProviderKind, PublicAiProviderConfig, SaveAiProviderConfigRequest,
    TestAiProviderRequest, validate_provider_config,
};
use crate::models::operation::OperationDraft;
use crate::services::analysis_service;
use crate::services::analysis_task_store::AnalysisTaskStore;
use crate::services::suggestion_review::{self, ReviewAction};
use crate::services::{
    path_policy, provider_registry,
    secret_store::{PlatformSecretStore, SECRET_SERVICE, SecretStore},
    watcher,
};
use crate::storage::{ai_provider_repository, ai_repository, app_paths, database};

#[derive(Debug, Clone, serde::Deserialize)]
pub struct StartAnalysisRequest {
    pub root_path: String,
    pub file_paths: Vec<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub remote_content_consent: bool,
    #[serde(default)]
    pub category_source: Option<AnalysisCategorySource>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AnalysisCategorySource {
    Template {
        template_id: String,
        expected_version: i64,
    },
    RootCustom,
}

type ResolvedAnalysisCategories = (Vec<Category>, Option<(String, i64)>);

#[derive(Debug, Clone, serde::Serialize)]
pub struct StartAnalysisResponse {
    pub batch_id: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AnalysisProgress {
    pub batch_id: String,
    pub phase: String,
    pub completed_files: usize,
    pub total_files: usize,
    pub current_path: Option<String>,
    pub error_count: usize,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct ReviewAnalysisRequest {
    pub result_id: String,
    pub action: ReviewAction,
    pub suggested_filename: Option<String>,
    pub category_id: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SaveCategoryTemplateRequest {
    pub id: String,
    pub name: String,
    pub categories: Vec<TemplateCategory>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct ApplyCategoryTemplateRequest {
    pub root_path: String,
    pub template_id: String,
    pub categories: Vec<Category>,
}

fn emit_analysis_progress<R: Runtime>(
    app: &AppHandle<R>,
    snapshot: &AnalysisTaskSnapshot,
    phase: &str,
) {
    let _ = app.emit(
        "ai://analysis-progress",
        AnalysisProgress {
            batch_id: snapshot.batch_id.clone(),
            phase: phase.into(),
            completed_files: snapshot.completed_files,
            total_files: snapshot.total_files,
            current_path: snapshot.current_path.clone(),
            error_count: snapshot.failures.len(),
        },
    );
}

fn delete_batch_results(database_path: &Path, batch_id: &str) {
    if let Ok(connection) = database::open_database(database_path) {
        let _ = ai_repository::delete_batch_results(&connection, batch_id);
    }
}

#[tauri::command]
pub fn get_ai_provider_config<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PublicAiProviderConfig, AppError> {
    let config = active_provider_config(&app)?;
    provider_registry::public_provider_config(Some(config), &PlatformSecretStore)
        .map_err(Into::into)
}

#[tauri::command]
pub fn save_ai_provider_config<R: Runtime>(
    app: AppHandle<R>,
    request: SaveAiProviderConfigRequest,
) -> Result<PublicAiProviderConfig, AppError> {
    validate_provider_config(&request.config)?;
    let secret_store = PlatformSecretStore;
    if matches!(request.config.kind, ProviderKind::OpenAiCompatible)
        && let Some(api_key) = request.api_key.as_deref()
    {
        if api_key.trim().is_empty() {
            secret_store.delete(SECRET_SERVICE, &request.config.id)?;
        } else {
            secret_store.set(SECRET_SERVICE, &request.config.id, api_key)?;
        }
    }
    let mut connection = open_database(&app)?;
    let config = ai_provider_repository::save_active_provider(&mut connection, &request.config)
        .map_err(|error| error.to_string())?;
    provider_registry::public_provider_config(Some(config), &secret_store).map_err(Into::into)
}

#[tauri::command]
pub fn test_ai_provider_connection(
    request: TestAiProviderRequest,
) -> Result<ProviderStatus, AppError> {
    let provider = provider_registry::resolve_provider_with_key(
        request.config,
        request.api_key,
        &PlatformSecretStore,
    )?;
    provider.health().map_err(Into::into)
}

#[tauri::command]
pub fn get_ai_provider_status<R: Runtime>(
    app: AppHandle<R>,
    model: Option<String>,
) -> ProviderStatus {
    let mut config = match active_provider_config(&app) {
        Ok(config) => config,
        Err(message) => {
            return ProviderStatus {
                available: false,
                provider: "ollama".into(),
                model: configured_model(model),
                message: message.message,
            };
        }
    };
    if matches!(config.kind, ProviderKind::Ollama) {
        config.model = configured_model(model);
    }
    let provider_name = match config.kind {
        ProviderKind::Ollama => "ollama",
        ProviderKind::OpenAiCompatible => "open_ai_compatible",
    };
    let provider_model = config.model.clone();
    match provider_registry::resolve_provider(Some(config), &PlatformSecretStore)
        .and_then(|provider| provider.health())
    {
        Ok(status) => status,
        Err(message) => ProviderStatus {
            available: false,
            provider: provider_name.into(),
            model: provider_model,
            message,
        },
    }
}

#[tauri::command]
pub fn save_ai_categories<R: Runtime>(
    app: AppHandle<R>,
    root_path: String,
    categories: Vec<Category>,
) -> Result<Vec<Category>, AppError> {
    let root = require_current_root(&app, &root_path)?;
    let categories = validate_categories(&root, categories)?;
    let mut connection = open_database(&app)?;
    ai_repository::replace_categories(&mut connection, &root.to_string_lossy(), &categories)
        .map_err(|error| error.to_string())?;
    Ok(categories)
}

#[tauri::command]
pub fn get_ai_categories<R: Runtime>(
    app: AppHandle<R>,
    root_path: String,
) -> Result<Vec<Category>, AppError> {
    let root = require_current_root(&app, &root_path)?;
    ai_repository::read_categories(&open_database(&app)?, &root.to_string_lossy())
        .map_err(|error| error.to_string().into())
}

#[tauri::command]
pub fn get_ai_category_templates<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<CategoryTemplate>, AppError> {
    ai_repository::read_category_templates(&open_database(&app)?)
        .map_err(|error| error.to_string().into())
}

#[tauri::command]
pub fn save_ai_category_template<R: Runtime>(
    app: AppHandle<R>,
    request: SaveCategoryTemplateRequest,
) -> Result<CategoryTemplate, AppError> {
    validate_template_id(&request.id)?;
    let name = request.name.trim();
    if name.is_empty() {
        return Err("模板名称不能为空".to_string().into());
    }
    let categories = validate_template_categories(request.categories)?;
    let mut connection = open_database(&app)?;
    let existing = ai_repository::read_category_template(&connection, &request.id)
        .map_err(|error| error.to_string())?;
    validate_saved_template_name(existing.as_ref(), name)?;
    if ai_repository::category_template_name_exists(&connection, name, Some(&request.id))
        .map_err(|error| error.to_string())?
    {
        return Err("模板名称已存在".to_string().into());
    }
    ai_repository::upsert_category_template(
        &mut connection,
        &request.id,
        name,
        &categories,
        &now_string(),
    )
    .map_err(|error| error.to_string().into())
}

#[tauri::command]
pub fn rename_ai_category_template<R: Runtime>(
    app: AppHandle<R>,
    template_id: String,
    name: String,
) -> Result<CategoryTemplate, AppError> {
    validate_template_id(&template_id)?;
    let name = name.trim();
    if name.is_empty() {
        return Err("模板名称不能为空".to_string().into());
    }
    let connection = open_database(&app)?;
    ai_repository::read_category_template(&connection, &template_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "分类模板不存在".to_string())?;
    if ai_repository::category_template_name_exists(&connection, name, Some(&template_id))
        .map_err(|error| error.to_string())?
    {
        return Err("模板名称已存在".to_string().into());
    }
    if !ai_repository::rename_category_template(&connection, &template_id, name, &now_string())
        .map_err(|error| error.to_string())?
    {
        return Err("分类模板不存在或当前不能重命名".to_string().into());
    }
    ai_repository::read_category_template(&connection, &template_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "分类模板不存在".to_string().into())
}

#[tauri::command]
pub fn set_global_ai_category_template<R: Runtime>(
    app: AppHandle<R>,
    template_id: String,
) -> Result<CategoryTemplate, AppError> {
    validate_template_id(&template_id)?;
    let mut connection = open_database(&app)?;
    if !ai_repository::set_global_category_template(&mut connection, &template_id, &now_string())
        .map_err(|error| error.to_string())?
    {
        return Err("分类模板不存在".to_string().into());
    }
    ai_repository::read_category_template(&connection, &template_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "分类模板不存在".to_string().into())
}

#[tauri::command]
pub fn delete_ai_category_template<R: Runtime>(
    app: AppHandle<R>,
    template_id: String,
) -> Result<(), AppError> {
    let mut connection = open_database(&app)?;
    let template = ai_repository::read_category_template(&connection, &template_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "分类模板不存在".to_string())?;
    if template.is_global {
        return Err("全局模板不能删除".to_string().into());
    }
    let deleted = ai_repository::delete_category_template(&mut connection, &template_id)
        .map_err(|error| error.to_string())?;
    if !deleted {
        return Err("分类模板不存在".to_string().into());
    }
    Ok(())
}

#[tauri::command]
pub fn apply_ai_category_template<R: Runtime>(
    app: AppHandle<R>,
    request: ApplyCategoryTemplateRequest,
) -> Result<Vec<Category>, AppError> {
    let root = require_current_root(&app, &request.root_path)?;
    let mut connection = open_database(&app)?;
    let template = ai_repository::read_category_template(&connection, &request.template_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "分类模板不存在".to_string())?;
    let categories = validate_applied_categories(&root, &template, request.categories)?;
    let categories = validate_categories(&root, categories)?;
    ai_repository::replace_categories(&mut connection, &root.to_string_lossy(), &categories)
        .map_err(|error| error.to_string())?;
    ai_repository::bind_root_to_category_template(
        &connection,
        &root.to_string_lossy(),
        &template.id,
        template.version,
    )
    .map_err(|error| error.to_string())?;
    Ok(categories)
}

#[tauri::command]
pub fn delete_ai_category<R: Runtime>(
    app: AppHandle<R>,
    root_path: String,
    category_id: String,
) -> Result<(), AppError> {
    let root = require_current_root(&app, &root_path)?;
    let root_string = root.to_string_lossy().to_string();
    let connection = open_database(&app)?;
    let category = ai_repository::read_categories(&connection, &root_string)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|category| category.id == category_id)
        .ok_or_else(|| "分类配置不存在".to_string())?;
    if ai_repository::count_pending_category_references(&connection, &root_string, &category_id)
        .map_err(|error| error.to_string())?
        > 0
    {
        return Err("该分类仍被待确认的 AI 建议引用，请先处理这些建议"
            .to_string()
            .into());
    }
    let directory =
        path_policy::category_directory_for_category(&root, &category.id, &category.name)?;
    if app
        .state::<crate::services::plan_store::PlanStore>()
        .has_target_directory(&directory)?
    {
        return Err("该分类仍被待确认的操作草案引用，请先处理操作预览"
            .to_string()
            .into());
    }
    if !ai_repository::delete_category(&connection, &root_string, &category_id)
        .map_err(|error| error.to_string())?
    {
        return Err("分类配置不存在".to_string().into());
    }
    Ok(())
}

#[tauri::command]
pub fn start_analysis_batch<R: Runtime>(
    app: AppHandle<R>,
    request: StartAnalysisRequest,
) -> Result<StartAnalysisResponse, AppError> {
    let root = require_current_root(&app, &request.root_path)?;
    if request.file_paths.is_empty() || request.file_paths.len() > 100 {
        return Err("每个分析批次必须包含 1 到 100 个文件".to_string().into());
    }
    let connection = open_database(&app)?;
    let (categories, template) =
        resolve_analysis_category_source(&connection, &root, request.category_source.as_ref())?;
    if !categories.iter().any(|category| category.enabled) {
        return Err("请先配置至少一个启用的分类".to_string().into());
    }
    let mut provider_config = ai_provider_repository::read_active_provider(&connection)
        .map_err(|error| error.to_string())?
        .unwrap_or_else(provider_registry::default_provider_config);
    if let Some(provider_id) = request.provider_id.as_deref()
        && provider_id != provider_config.id
    {
        return Err("Provider 配置已变化，请刷新后重试".to_string().into());
    }
    if matches!(provider_config.kind, ProviderKind::Ollama) {
        provider_config.model = configured_model(request.model.clone());
    }
    provider_registry::ensure_remote_content_consent(
        &provider_config.kind,
        request.remote_content_consent,
    )?;
    let provider =
        provider_registry::resolve_provider(Some(provider_config), &PlatformSecretStore)?;
    let health = provider.health()?;
    if !health.available {
        return Err(health.message.into());
    }
    let batch_id = app
        .state::<AnalysisTaskStore>()
        .create(request.file_paths.clone(), SystemTime::now())?;
    let response = StartAnalysisResponse {
        batch_id: batch_id.clone(),
    };
    let database_path = app_paths::database_path(
        &app.path()
            .app_data_dir()
            .map_err(|error| error.to_string())?,
    );
    let worker_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let store = worker_app.state::<AnalysisTaskStore>();
        if store.mark_running(&batch_id).is_err() {
            if !store.is_cancelled(&batch_id) {
                let _ = store.fail(&batch_id, "分析任务无法启动".into());
                if let Some(snapshot) = store.get(&batch_id) {
                    emit_analysis_progress(&worker_app, &snapshot, "failed");
                }
            }
            return;
        }
        if let Some(snapshot) = store.get(&batch_id) {
            emit_analysis_progress(&worker_app, &snapshot, "processing");
        }
        let progress_app = worker_app.clone();
        let cancel_app = worker_app.clone();
        let progress_batch = batch_id.clone();
        let result = database::open_database(&database_path)
            .map_err(|error| error.to_string())
            .and_then(|connection| {
                analysis_service::analyze_batch(
                    &connection,
                    &batch_id,
                    &root,
                    &request.file_paths,
                    &categories,
                    template
                        .as_ref()
                        .map(|(id, version)| (id.as_str(), *version)),
                    &*provider,
                    || {
                        let store = cancel_app.state::<AnalysisTaskStore>();
                        if store.is_cancelled(&batch_id) {
                            return true;
                        }
                        match cancel_app
                            .state::<watcher::WatcherState>()
                            .is_current_root(&root)
                        {
                            Ok(true) => false,
                            Ok(false) | Err(_) => {
                                let _ = store.cancel(&batch_id);
                                true
                            }
                        }
                    },
                    |completed, total, current| {
                        let state = progress_app.state::<AnalysisTaskStore>();
                        let _ = state.update_progress(&progress_batch, completed, current.clone());
                        let failures = state
                            .get(&progress_batch)
                            .map_or(0, |snapshot| snapshot.failures.len());
                        let _ = progress_app.emit(
                            "ai://analysis-progress",
                            AnalysisProgress {
                                batch_id: progress_batch.clone(),
                                phase: if current.is_some() {
                                    "analyzing"
                                } else {
                                    "processing"
                                }
                                .into(),
                                completed_files: completed,
                                total_files: total,
                                current_path: current,
                                error_count: failures,
                            },
                        );
                    },
                )
            });
        if store.is_cancelled(&batch_id) {
            delete_batch_results(&database_path, &batch_id);
            let _ = store.finish_cancelled(&batch_id);
            if let Some(snapshot) = store.get(&batch_id) {
                emit_analysis_progress(&worker_app, &snapshot, "cancelled");
            }
            return;
        }
        match result {
            Ok(outcome) => {
                let result_ids = outcome
                    .records
                    .iter()
                    .map(|record| record.id.clone())
                    .collect();
                if store
                    .complete_with_failures(&batch_id, result_ids, outcome.failures)
                    .is_err()
                {
                    delete_batch_results(&database_path, &batch_id);
                    let _ = store.finish_cancelled(&batch_id);
                    if let Some(snapshot) = store.get(&batch_id) {
                        emit_analysis_progress(&worker_app, &snapshot, "cancelled");
                    }
                } else if let Some(snapshot) = store.get(&batch_id) {
                    emit_analysis_progress(&worker_app, &snapshot, "completed");
                }
            }
            Err(error) => {
                if store.is_cancelled(&batch_id) || store.fail(&batch_id, error).is_err() {
                    delete_batch_results(&database_path, &batch_id);
                    let _ = store.finish_cancelled(&batch_id);
                    if let Some(snapshot) = store.get(&batch_id) {
                        emit_analysis_progress(&worker_app, &snapshot, "cancelled");
                    }
                } else if let Some(snapshot) = store.get(&batch_id) {
                    emit_analysis_progress(&worker_app, &snapshot, "failed");
                }
            }
        }
    });
    Ok(response)
}

#[tauri::command]
pub fn get_analysis_batch<R: Runtime>(
    app: AppHandle<R>,
    batch_id: String,
) -> Result<AnalysisTaskSnapshot, AppError> {
    app.state::<AnalysisTaskStore>()
        .get(&batch_id)
        .ok_or_else(|| "分析批次不存在".to_string().into())
}

#[tauri::command]
pub fn cancel_analysis_batch<R: Runtime>(
    app: AppHandle<R>,
    batch_id: String,
) -> Result<(), AppError> {
    let store = app.state::<AnalysisTaskStore>();
    store.cancel(&batch_id)?;
    if let Some(snapshot) = store.get(&batch_id) {
        match snapshot.status {
            AnalysisBatchStatus::Cancelling => {
                emit_analysis_progress(&app, &snapshot, "cancelling");
            }
            AnalysisBatchStatus::Cancelled => {
                emit_analysis_progress(&app, &snapshot, "cancelled");
            }
            _ => {}
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_analysis_results<R: Runtime>(
    app: AppHandle<R>,
    batch_id: String,
) -> Result<Vec<AiAnalysisRecord>, AppError> {
    let connection = open_database(&app)?;
    let mut records = ai_repository::read_batch_results(&connection, &batch_id)
        .map_err(|error| error.to_string())?;
    for record in &mut records {
        if record.status == AnalysisResultStatus::Pending
            && crate::services::content_extractor::fingerprint_authorized_file(
                Path::new(&record.root_path),
                Path::new(&record.source_path),
            )
            .ok()
            .as_deref()
                != Some(record.content_fingerprint.as_str())
        {
            ai_repository::update_result_status(
                &connection,
                &record.id,
                AnalysisResultStatus::Expired,
            )
            .map_err(|error| error.to_string())?;
            record.status = AnalysisResultStatus::Expired;
        }
    }
    Ok(records)
}

#[tauri::command]
pub fn review_analysis_result<R: Runtime>(
    app: AppHandle<R>,
    request: ReviewAnalysisRequest,
) -> Result<Option<OperationDraft>, AppError> {
    suggestion_review::review_result(
        &open_database(&app)?,
        &request.result_id,
        request.action,
        request.suggested_filename,
        request.category_id,
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn confirm_analysis_result_preview<R: Runtime>(
    app: AppHandle<R>,
    result_id: String,
    plan_id: String,
) -> Result<(), AppError> {
    suggestion_review::confirm_result_preview(
        &open_database(&app)?,
        &app.state::<crate::services::plan_store::PlanStore>(),
        &result_id,
        &plan_id,
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn confirm_analysis_results_preview<R: Runtime>(
    app: AppHandle<R>,
    result_ids: Vec<String>,
    plan_id: String,
) -> Result<(), AppError> {
    let mut connection = open_database(&app)?;
    suggestion_review::confirm_results_preview(
        &mut connection,
        &app.state::<crate::services::plan_store::PlanStore>(),
        &result_ids,
        &plan_id,
    )
    .map_err(Into::into)
}

fn validate_categories(root: &Path, categories: Vec<Category>) -> Result<Vec<Category>, AppError> {
    if categories.is_empty() || categories.len() > 100 {
        return Err("分类数量必须位于 1 到 100 之间".to_string().into());
    }
    let mut ids = HashSet::new();
    let mut target_directories = HashSet::new();
    let mut validated = Vec::with_capacity(categories.len());
    for mut category in categories {
        if path_policy::validate_category_id(&category.id).is_err()
            || !ids.insert(category.id.to_ascii_lowercase())
        {
            return Err("分类 ID 必须唯一，且只能包含字母、数字、连字符和下划线"
                .to_string()
                .into());
        }
        if category.name.trim().is_empty() {
            return Err("分类名称不能为空".to_string().into());
        }
        let directory =
            path_policy::category_directory_for_category(root, &category.id, &category.name)
                .map_err(AppError::from)?;
        if !target_directories.insert(directory.to_string_lossy().to_lowercase()) {
            return Err("分类目标目录不能重复或仅有大小写差异".to_string().into());
        }
        if let Ok(metadata) = std::fs::symlink_metadata(&directory)
            && (metadata.file_type().is_symlink() || !metadata.file_type().is_dir())
        {
            return Err("分类目标路径已存在但不是普通目录".to_string().into());
        }
        category.name = category.name.trim().into();
        category.description = category.description.trim().into();
        category.directory_path = directory.to_string_lossy().into();
        validated.push(category);
    }
    Ok(validated)
}

fn resolve_analysis_category_source(
    connection: &rusqlite::Connection,
    root: &Path,
    source: Option<&AnalysisCategorySource>,
) -> Result<ResolvedAnalysisCategories, AppError> {
    match source {
        Some(AnalysisCategorySource::Template {
            template_id,
            expected_version,
        }) => {
            validate_template_id(template_id)?;
            let template = ai_repository::read_category_template(connection, template_id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "分类模板不存在".to_string())?;
            if template.version != *expected_version {
                return Err("分类模板版本已变化，请刷新后重新选择".to_string().into());
            }
            let categories = template
                .categories
                .iter()
                .map(|category| Category {
                    id: category.id.clone(),
                    name: category.name.clone(),
                    description: category.description.clone(),
                    directory_path: String::new(),
                    enabled: category.default_enabled,
                })
                .collect();
            Ok((
                validate_categories(root, categories)?,
                Some((template.id, template.version)),
            ))
        }
        Some(AnalysisCategorySource::RootCustom) => {
            let categories = ai_repository::read_categories(connection, &root.to_string_lossy())
                .map_err(|error| error.to_string())?;
            Ok((validate_categories(root, categories)?, None))
        }
        None => {
            let categories = ai_repository::read_categories(connection, &root.to_string_lossy())
                .map_err(|error| error.to_string())?;
            let template =
                ai_repository::read_root_category_template(connection, &root.to_string_lossy())
                    .map_err(|error| error.to_string())?;
            Ok((validate_categories(root, categories)?, template))
        }
    }
}

fn validate_template_id(id: &str) -> Result<(), AppError> {
    if id.is_empty()
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("模板 ID 不能为空，且只能包含字母、数字、连字符和下划线"
            .to_string()
            .into());
    }
    Ok(())
}

fn validate_saved_template_name(
    existing: Option<&CategoryTemplate>,
    requested_name: &str,
) -> Result<(), AppError> {
    if existing.is_some_and(|template| template.name.trim() != requested_name.trim()) {
        return Err("修改模板内容时不能重命名，请使用重命名操作"
            .to_string()
            .into());
    }
    Ok(())
}

fn validate_template_categories(
    categories: Vec<TemplateCategory>,
) -> Result<Vec<TemplateCategory>, AppError> {
    if categories.is_empty() || categories.len() > 100 {
        return Err("模板分类数量必须位于 1 到 100 之间".to_string().into());
    }
    let mut ids = HashSet::new();
    let mut validated = Vec::with_capacity(categories.len());
    for mut category in categories {
        if category.id.is_empty()
            || !category.id.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
            || !ids.insert(category.id.to_ascii_lowercase())
        {
            return Err("模板分类 ID 必须唯一，且只能包含字母、数字、连字符和下划线"
                .to_string()
                .into());
        }
        category.name = category.name.trim().into();
        category.description = category.description.trim().into();
        if category.name.is_empty() {
            return Err("模板分类名称不能为空".to_string().into());
        }
        validated.push(category);
    }
    Ok(validated)
}

fn validate_applied_categories(
    root: &Path,
    template: &CategoryTemplate,
    categories: Vec<Category>,
) -> Result<Vec<Category>, AppError> {
    if categories.len() != template.categories.len() {
        return Err("应用模板时分类数量不匹配".to_string().into());
    }
    let expected: std::collections::HashMap<_, _> = template
        .categories
        .iter()
        .map(|category| (category.id.as_str(), category))
        .collect();
    let mut seen = HashSet::new();
    let mut validated = Vec::with_capacity(categories.len());
    for mut category in categories {
        let Some(template_category) = expected.get(category.id.as_str()) else {
            return Err("应用模板时包含未知分类".to_string().into());
        };
        if !seen.insert(category.id.clone()) {
            return Err("应用模板时分类 ID 不能重复".to_string().into());
        }
        category.name = if template_category.name.trim().is_empty()
            || template_category.name.trim() == DEFAULT_CATEGORY_NAME
        {
            category.id.clone()
        } else {
            template_category.name.trim().into()
        };
        category.description = template_category.description.clone();
        category.directory_path =
            path_policy::category_directory_for_category(root, &category.id, &category.name)
                .map_err(AppError::from)?
                .to_string_lossy()
                .into();
        validated.push(category);
    }
    if seen.len() != expected.len() {
        return Err("应用模板时缺少分类目录绑定".to_string().into());
    }
    Ok(validated)
}

fn require_current_root<R: Runtime>(
    app: &AppHandle<R>,
    root_path: &str,
) -> Result<PathBuf, AppError> {
    let root = path_policy::normalize_root(Path::new(root_path))?;
    if !app
        .state::<watcher::WatcherState>()
        .is_current_root(&root)?
    {
        return Err("只能分析当前授权根目录内的文件".to_string().into());
    }
    Ok(root)
}

fn open_database<R: Runtime>(app: &AppHandle<R>) -> Result<rusqlite::Connection, AppError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    database::open_database(&app_paths::database_path(&directory))
        .map_err(|error| error.to_string().into())
}

fn active_provider_config<R: Runtime>(app: &AppHandle<R>) -> Result<AiProviderConfig, AppError> {
    let connection = open_database(app)?;
    ai_provider_repository::read_active_provider(&connection)
        .map_err(|error| error.to_string().into())
        .map(|config| config.unwrap_or_else(provider_registry::default_provider_config))
}

fn configured_model(model: Option<String>) -> String {
    model
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.into())
}

fn now_string() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

const DEFAULT_CATEGORY_NAME: &str = "新分类";

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ai-file-sorter-category-source-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&path).unwrap();
        std::fs::canonicalize(path).unwrap()
    }

    fn template(is_global: bool) -> CategoryTemplate {
        CategoryTemplate {
            id: "template".into(),
            name: "模板".into(),
            version: 1,
            is_global,
            categories: vec![],
        }
    }

    #[test]
    fn saved_template_name_must_stay_unchanged_when_saving_categories() {
        assert!(validate_saved_template_name(Some(&template(true)), "新名称").is_err());
        assert!(validate_saved_template_name(Some(&template(true)), "模板").is_ok());
        assert!(validate_saved_template_name(Some(&template(false)), "新名称").is_err());
    }

    #[test]
    fn category_validation_rejects_colliding_target_directories() {
        let root = temp_root("directory-collision");
        let generated_collision = validate_categories(
            &root,
            vec![
                Category {
                    id: "category_1".into(),
                    name: "work".into(),
                    description: String::new(),
                    directory_path: String::new(),
                    enabled: true,
                },
                Category {
                    id: "work".into(),
                    name: "工作".into(),
                    description: String::new(),
                    directory_path: String::new(),
                    enabled: true,
                },
            ],
        );
        assert!(generated_collision.is_err());

        let case_collision = validate_categories(
            &root,
            vec![
                Category {
                    id: "work".into(),
                    name: "工作".into(),
                    description: String::new(),
                    directory_path: String::new(),
                    enabled: true,
                },
                Category {
                    id: "WORK".into(),
                    name: "工作 2".into(),
                    description: String::new(),
                    directory_path: String::new(),
                    enabled: true,
                },
            ],
        );
        assert!(case_collision.is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn template_analysis_source_is_frozen_without_writing_root_categories() {
        let root = temp_root("template");
        let mut connection = database::open_memory_database().unwrap();
        let template = ai_repository::upsert_category_template(
            &mut connection,
            "work-template",
            "工作模板",
            &[TemplateCategory {
                id: "work".into(),
                name: "工作".into(),
                description: "工作资料".into(),
                default_enabled: true,
            }],
            "1",
        )
        .unwrap();

        let (categories, source_template) = resolve_analysis_category_source(
            &connection,
            &root,
            Some(&AnalysisCategorySource::Template {
                template_id: template.id.clone(),
                expected_version: template.version,
            }),
        )
        .unwrap();

        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].id, "work");
        assert_eq!(
            categories[0].directory_path,
            root.join("work").to_string_lossy()
        );
        assert_eq!(source_template, Some((template.id, template.version)));
        assert!(
            ai_repository::read_categories(&connection, &root.to_string_lossy())
                .unwrap()
                .is_empty()
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn stale_template_version_is_rejected_before_analysis() {
        let root = temp_root("stale");
        let mut connection = database::open_memory_database().unwrap();
        let template = ai_repository::upsert_category_template(
            &mut connection,
            "work-template",
            "工作模板",
            &[TemplateCategory {
                id: "work".into(),
                name: "工作".into(),
                description: "工作资料".into(),
                default_enabled: true,
            }],
            "1",
        )
        .unwrap();

        let error = resolve_analysis_category_source(
            &connection,
            &root,
            Some(&AnalysisCategorySource::Template {
                template_id: template.id,
                expected_version: template.version + 1,
            }),
        )
        .unwrap_err();

        assert!(error.message.contains("版本"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_category_source_keeps_the_existing_root_category_behavior() {
        let root = temp_root("legacy");
        let mut connection = database::open_memory_database().unwrap();
        let template = ai_repository::upsert_category_template(
            &mut connection,
            "legacy-template",
            "旧模板",
            &[TemplateCategory {
                id: "work".into(),
                name: "工作".into(),
                description: "工作资料".into(),
                default_enabled: true,
            }],
            "1",
        )
        .unwrap();
        let root_categories = vec![Category {
            id: "work".into(),
            name: "工作".into(),
            description: "工作资料".into(),
            directory_path: root.join("work").to_string_lossy().into(),
            enabled: true,
        }];
        ai_repository::replace_categories(
            &mut connection,
            &root.to_string_lossy(),
            &root_categories,
        )
        .unwrap();
        ai_repository::bind_root_to_category_template(
            &connection,
            &root.to_string_lossy(),
            &template.id,
            template.version,
        )
        .unwrap();

        let resolved = resolve_analysis_category_source(&connection, &root, None).unwrap();

        assert_eq!(
            resolved,
            (root_categories, Some((template.id, template.version)))
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn explicit_root_custom_source_does_not_claim_the_legacy_template_binding() {
        let root = temp_root("root-custom");
        let mut connection = database::open_memory_database().unwrap();
        let template = ai_repository::upsert_category_template(
            &mut connection,
            "legacy-template",
            "旧模板",
            &[TemplateCategory {
                id: "work".into(),
                name: "工作".into(),
                description: "工作资料".into(),
                default_enabled: true,
            }],
            "1",
        )
        .unwrap();
        let root_categories = vec![Category {
            id: "work".into(),
            name: "工作".into(),
            description: "工作资料".into(),
            directory_path: root.join("work").to_string_lossy().into(),
            enabled: true,
        }];
        ai_repository::replace_categories(
            &mut connection,
            &root.to_string_lossy(),
            &root_categories,
        )
        .unwrap();
        ai_repository::bind_root_to_category_template(
            &connection,
            &root.to_string_lossy(),
            &template.id,
            template.version,
        )
        .unwrap();

        let resolved = resolve_analysis_category_source(
            &connection,
            &root,
            Some(&AnalysisCategorySource::RootCustom),
        )
        .unwrap();

        assert_eq!(resolved, (root_categories, None));
        std::fs::remove_dir_all(root).unwrap();
    }
}
