import { useEffect, useMemo, useState } from "react";

import {
  cancelAnalysisBatch,
  confirmAnalysisResultPreview,
  deleteAiCategory,
  deleteAiCategoryTemplate,
  getAiCategoryTemplates,
  getAiCategories,
  getAiProviderStatus,
  getAnalysisBatch,
  getAnalysisResults,
  listenForAnalysisProgress,
  renameAiCategoryTemplate,
  reviewAnalysisResult,
  saveAiCategoryTemplate,
  saveAiCategories,
  setGlobalAiCategoryTemplate,
  startAnalysisBatch,
} from "../../lib/ai-api";
import type { AiAnalysisResult, AiCategory, AiCategoryTemplate, AnalysisCategorySource, AnalysisProgress, AnalysisTask, ProviderStatus, TemplateCategory } from "../../types/ai";
import type { OperationDraft, OperationPreviewResponse } from "../../types/operations";
import type { SearchEntry } from "../../types/search";
import { AnalysisSetupBar } from "./AnalysisSetupBar";
import { AiReviewView } from "./AiReviewView";
import { TemplateSettingsView } from "./TemplateSettingsView";

type Props = {
  rootPath: string;
  selectedEntries: SearchEntry[];
  onPreview: (draft: OperationDraft) => Promise<OperationPreviewResponse>;
  onChooseDirectory: () => Promise<string | null>;
  activeView?: "files" | "ai" | "preview" | "history" | "settings";
  onNavigate?: (view: "files" | "ai" | "preview" | "history" | "settings") => void;
};

const supportedExtensions = new Set([
  "txt", "md", "pdf", "docx",
  "c", "h", "cc", "cpp", "cxx", "hpp", "hxx", "cs", "java", "kt", "kts",
  "go", "rs", "py", "pyw", "js", "jsx", "mjs", "cjs", "ts", "tsx", "php", "rb",
  "swift", "dart", "lua", "r", "sh", "bash", "zsh", "fish", "ps1", "sql",
  "html", "htm", "css", "scss", "less", "json", "jsonc", "yaml", "yml", "toml",
  "xml", "ini", "conf", "properties",
]);
const supportedSpecialNames = new Set(["dockerfile", "makefile", "cmakelists.txt"]);
const defaultCategoryName = "新分类";

function categoryDirectory(rootPath: string, categoryId: string): string {
  const root = rootPath.trim().replace(/[\\/]+$/, "");
  const id = categoryId.trim();
  return id ? `${root}/${id}` : root;
}

function isGeneratedCategoryId(id: string): boolean {
  return /^category_\d+$/.test(id);
}

function isSafeCategoryTag(value: string): boolean {
  const tag = value.trim();
  if (!tag || !/^[A-Za-z0-9_-]+$/.test(tag)) return false;
  return !["CON", "PRN", "AUX", "NUL", ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`), ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`)]
    .some((reserved) => reserved.toLowerCase() === tag.toLowerCase());
}

function isSupportedEntry(entry: SearchEntry): boolean {
  return supportedSpecialNames.has(entry.name.toLowerCase())
    || supportedExtensions.has((entry.extension ?? "").toLowerCase());
}

export function AiPanel({ rootPath, selectedEntries, onPreview, activeView = "ai", onNavigate }: Props) {
  const [model, setModel] = useState("qwen2.5:7b");
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [categories, setCategories] = useState<AiCategory[]>([]);
  const [templates, setTemplates] = useState<AiCategoryTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<AiCategoryTemplate | null>(null);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [analysisSource, setAnalysisSource] = useState<AnalysisCategorySource | null>(null);
  const [savedCategoryIds, setSavedCategoryIds] = useState<Set<string>>(new Set());
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [results, setResults] = useState<AiAnalysisResult[]>([]);
  const [edits, setEdits] = useState<Record<string, { filename: string; categoryId: string }>>({});
  const [busy, setBusy] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [settingsReturnView, setSettingsReturnView] = useState<"files" | "ai">("ai");
  const [settingsOpenedFromAction, setSettingsOpenedFromAction] = useState(false);
  const supportedFiles = useMemo(
    () => selectedEntries.filter(isSupportedEntry),
    [selectedEntries],
  );
  const hasEnabledCategory = categories.some((category) => category.enabled);
  const selectedAnalysisTemplate = analysisSource?.kind === "template"
    ? templates.find((template) => template.id === analysisSource.template_id)
    : null;
  const hasAnalysisCategory = analysisSource?.kind === "template"
    ? Boolean(selectedAnalysisTemplate?.categories.some((category) => category.default_enabled))
    : hasEnabledCategory;
  const analysisBlockedReason = setupLoading
    ? "正在加载模型状态和分类配置…"
    : !provider?.available
      ? `本地模型不可用：${provider?.message ?? "无法读取模型状态。"}。请确认 Ollama 已启动且模型名称正确，然后刷新状态。`
      : supportedFiles.length === 0
        ? "请在文件列表中勾选至少一个 TXT、MD、PDF、DOCX 或常见代码/配置文件。"
        : !analysisSource
          ? "请选择一个分类方案后再开始分析。"
          : !hasAnalysisCategory
          ? "请先配置并启用至少一个分类，AI 才能生成安全的整理建议。"
          : busy
            ? cancelRequested
              ? "正在等待当前模型请求结束，分析结果会被丢弃。"
              : "分析任务正在运行，请等待完成或取消任务。"
            : null;

  useEffect(() => {
    let cancelled = false;
    setProvider(null);
    setError(null);
    setSetupLoading(true);
    void Promise.all([getAiProviderStatus(model), getAiCategories(rootPath), getAiCategoryTemplates()])
      .then(([status, storedCategories, storedTemplates]) => {
        if (!cancelled) {
          setProvider(status);
          setCategories(storedCategories);
          setSavedCategoryIds(new Set(storedCategories.map((category) => category.id)));
          setTemplates(storedTemplates);
          const globalTemplate = storedTemplates.find((template) => template.is_global);
          const preferred = globalTemplate ?? storedTemplates[0];
          setSelectedTemplateId(preferred?.id ?? "");
          setTemplateDraft(preferred ?? null);
          setTemplateDirty(false);
          setAnalysisSource(globalTemplate
            ? { kind: "template", template_id: globalTemplate.id, expected_version: globalTemplate.version }
            : null);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(messageOf(cause, "无法读取 AI 配置。"));
      })
      .finally(() => {
        if (!cancelled) setSetupLoading(false);
      });
    return () => { cancelled = true; };
  }, [rootPath, model]);

  useEffect(() => {
    if (!batchId) return;
    const activeBatchId = batchId;
    let unlisten: (() => void) | undefined;
    let pollTimer: number | undefined;
    let terminalHandled = false;

    function applyProgress(next: AnalysisProgress) {
      if (next.batch_id !== activeBatchId) return;
      setProgress(next);
      if (next.phase === "completed") {
        if (terminalHandled) return;
        terminalHandled = true;
        if (pollTimer !== undefined) window.clearInterval(pollTimer);
        setBusy(false);
        setCancelRequested(false);
        void getAnalysisResults(next.batch_id)
          .then((items) => {
            setResults(items);
            setEdits(Object.fromEntries(items.map((item) => [item.id, {
              filename: item.suggested_filename,
              categoryId: item.category_id ?? "",
            }])));
            onNavigate?.("ai");
          })
          .catch((cause) => setError(messageOf(cause, "无法读取 AI 分析结果。")));
      } else if (next.phase === "failed" || next.phase === "cancelled") {
        if (terminalHandled) return;
        terminalHandled = true;
        if (pollTimer !== undefined) window.clearInterval(pollTimer);
        setBusy(false);
        setCancelRequested(false);
      }
    }

    function applyTask(task: AnalysisTask | undefined) {
      if (!task || task.batch_id !== activeBatchId) return;
      const phase: AnalysisProgress["phase"] = task.status === "running"
        ? "analyzing"
        : task.status === "cancelling"
          ? "cancelling"
          : task.status === "completed"
            ? "completed"
            : task.status === "failed"
              ? "failed"
              : task.status === "cancelled"
                ? "cancelled"
                : "processing";
      applyProgress({
        batch_id: task.batch_id,
        phase,
        completed_files: task.completed_files,
        total_files: task.total_files,
        current_path: task.current_path,
        error_count: task.failures.length,
      });
    }

    async function pollTask() {
      try {
        applyTask(await getAnalysisBatch(activeBatchId));
      } catch (cause) {
        if (!terminalHandled) setError(messageOf(cause, "无法读取 AI 分析任务状态。"));
      }
    }

    pollTimer = window.setInterval(() => void pollTask(), 1000);
    void listenForAnalysisProgress(applyProgress).then((cleanup) => { unlisten = cleanup; });
    void pollTask();
    return () => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      unlisten?.();
    };
  }, [batchId]);

  async function refreshProvider() {
    setError(null);
    setSetupLoading(true);
    try {
      setProvider(await getAiProviderStatus(model));
    } catch (cause) {
      setError(messageOf(cause, "无法刷新模型状态。"));
    } finally {
      setSetupLoading(false);
    }
  }

  async function start() {
    const source = analysisSource;
    if (!source) {
      setError("请选择一个分类方案后再开始分析。");
      return;
    }
    setError(null);
    setResults([]);
    setCancelRequested(false);
    setBusy(true);
    try {
      const response = await startAnalysisBatch({
        root_path: rootPath,
        file_paths: supportedFiles.map((entry) => entry.normalized_path),
        model,
        category_source: source,
      });
      setBatchId(response.batch_id);
      setProgress({ batch_id: response.batch_id, phase: "processing", completed_files: 0, total_files: supportedFiles.length, current_path: null, error_count: 0 });
    } catch (cause) {
      setBusy(false);
      setCancelRequested(false);
      setError(messageOf(cause, "无法启动内容分析。"));
    }
  }

  async function cancel() {
    if (!batchId || cancelRequested) return;
    const previousPhase = progress?.phase ?? "processing";
    setCancelRequested(true);
    setProgress((current) => current ? { ...current, phase: "cancelling" } : current);
    try {
      await cancelAnalysisBatch(batchId);
    } catch (cause) {
      setCancelRequested(false);
      setProgress((current) => current ? { ...current, phase: previousPhase } : current);
      setError(messageOf(cause, "无法取消分析批次。"));
    }
  }

  async function saveCategories() {
    setError(null);
    try {
      const saved = await saveAiCategories(rootPath, categories);
      setCategories(saved);
      setSavedCategoryIds(new Set(saved.map((category) => category.id)));
      setConfigOpen(false);
    } catch (cause) {
      setError(messageOf(cause, "无法保存分类配置。"));
    }
  }

  function addCategory() {
    const id = `category_${categories.length + 1}`;
    setCategories((current) => [...current, {
      id,
      name: defaultCategoryName,
      description: "",
      directory_path: categoryDirectory(rootPath, id),
      enabled: true,
    }]);
  }

  async function removeCategory(category: AiCategory, index: number) {
    if (!window.confirm(`确定删除分类“${category.name}”的配置吗？实际文件夹和文件不会被删除。`)) return;
    setError(null);
    try {
      if (savedCategoryIds.has(category.id)) await deleteAiCategory(rootPath, category.id);
      setCategories((current) => current.filter((_, currentIndex) => currentIndex !== index));
      setSavedCategoryIds((current) => {
        const next = new Set(current);
        next.delete(category.id);
        return next;
      });
    } catch (cause) {
      setError(messageOf(cause, "无法删除分类配置。"));
    }
  }

  function selectTemplate(templateId: string) {
    if (templateDirty && !window.confirm("当前模板有未保存的修改，确定放弃并切换吗？")) return;
    setSelectedTemplateId(templateId);
    setTemplateDraft(templates.find((template) => template.id === templateId) ?? null);
    setTemplateDirty(false);
  }

  function newTemplate() {
    if (templateDirty && !window.confirm("当前模板有未保存的修改，确定放弃并新建模板吗？")) return;
    const seededCategories: TemplateCategory[] = categories.length > 0
      ? categories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        default_enabled: category.enabled,
      }))
      : [{ id: "category_1", name: defaultCategoryName, description: "", default_enabled: true }];
    const draft: AiCategoryTemplate = {
      id: `template_${Date.now()}`,
      name: "新模板",
      version: 0,
      is_global: false,
      categories: seededCategories,
    };
    setTemplateDraft(draft);
    setSelectedTemplateId(draft.id);
    setTemplateDirty(true);
  }

  function addTemplateCategory() {
    if (!templateDraft) return;
    setTemplateDraft({
      ...templateDraft,
      categories: [...templateDraft.categories, {
        id: `category_${templateDraft.categories.length + 1}`,
        name: "新分类",
        description: "",
        default_enabled: true,
      }],
    });
    setTemplateDirty(true);
  }

  function removeTemplateCategory(index: number) {
    if (!templateDraft) return;
    if (templateDraft.categories.length <= 1) {
      setError("模板至少需要保留一个分类。 ");
      return;
    }
    setTemplateDraft({
      ...templateDraft,
      categories: templateDraft.categories.filter((_, currentIndex) => currentIndex !== index),
    });
    setTemplateDirty(true);
  }

  async function saveTemplate() {
    if (!templateDraft) return;
    setError(null);
    try {
      const saved = await saveAiCategoryTemplate({
        id: templateDraft.id,
        name: templateDraft.name,
        categories: templateDraft.categories,
      });
      setTemplates((current) => [...current.filter((template) => template.id !== saved.id), saved]);
      setSelectedTemplateId(saved.id);
      setTemplateDraft(saved);
      setTemplateDirty(false);
      setAnalysisSource((current) => current?.kind === "template" && current.template_id === saved.id
        ? { ...current, expected_version: saved.version }
        : current);
    } catch (cause) {
      setError(messageOf(cause, "无法保存分类模板。"));
    }
  }

  async function renameTemplate(target: AiCategoryTemplate | null = templateDraft) {
    if (!target) return;
    const name = window.prompt("请输入新的模板名称", target.name)?.trim();
    if (!name || name === target.name) return;
    setError(null);
    try {
      const renamed = await renameAiCategoryTemplate(target.id, name);
      setTemplates((current) => current.map((template) => template.id === renamed.id ? renamed : template));
      setTemplateDraft(renamed);
      setTemplateDirty(false);
    } catch (cause) {
      setError(messageOf(cause, "无法重命名分类模板。"));
    }
  }

  async function makeGlobal(target: AiCategoryTemplate | null = templateDraft) {
    if (!target || target.is_global) return;
    if (!window.confirm(`确定将“${target.name}”设为全局模板吗？它会成为文件浏览页的默认分类方案。`)) return;
    setError(null);
    try {
      const globalTemplate = await setGlobalAiCategoryTemplate(target.id);
      setTemplates((current) => current.map((template) => template.id === globalTemplate.id ? globalTemplate : { ...template, is_global: false }));
      setTemplateDraft(globalTemplate);
      setSelectedTemplateId(globalTemplate.id);
      setTemplateDirty(false);
      setAnalysisSource({ kind: "template", template_id: globalTemplate.id, expected_version: globalTemplate.version });
    } catch (cause) {
      setError(messageOf(cause, "无法设置全局分类模板。"));
    }
  }

  async function removeTemplate(target: AiCategoryTemplate | null = templateDraft) {
    if (!target || target.is_global || !window.confirm(`确定删除模板“${target.name}”吗？已保存的文件和历史结果不会改变。`)) return;
    setError(null);
    try {
      await deleteAiCategoryTemplate(target.id);
      const remaining = templates.filter((template) => template.id !== target.id);
      setTemplates(remaining);
      setSelectedTemplateId(remaining[0]?.id ?? "");
      setTemplateDraft(remaining[0] ?? null);
      setTemplateDirty(false);
      setAnalysisSource((current) => current?.kind === "template" && current.template_id === target.id ? null : current);
    } catch (cause) {
      setError(messageOf(cause, "无法删除分类模板。"));
    }
  }

  function chooseAnalysisSource(value: string) {
    if (value === "root_custom") {
      setAnalysisSource({ kind: "root_custom" });
      return;
    }
    if (!value.startsWith("template:")) {
      setAnalysisSource(null);
      return;
    }
    const template = templates.find((candidate) => candidate.id === value.slice("template:".length));
    setAnalysisSource(template ? { kind: "template", template_id: template.id, expected_version: template.version } : null);
  }

  async function review(item: AiAnalysisResult, action: "accept" | "reject") {
    setError(null);
    try {
      const edit = edits[item.id] ?? { filename: item.suggested_filename, categoryId: item.category_id ?? "" };
      const draft = await reviewAnalysisResult({
        result_id: item.id,
        action,
        suggested_filename: action === "accept" ? edit.filename : null,
        category_id: action === "accept" && edit.categoryId ? edit.categoryId : null,
      });
      if (!draft) {
        setResults((current) => current.map((result) => result.id === item.id ? { ...result, status: "rejected" } : result));
        return;
      }
      const preview = await onPreview(draft);
      if (!preview.canConfirm || !preview.planId) {
        throw new Error("操作预览未通过校验，建议仍保持待审查状态。");
      }
      await confirmAnalysisResultPreview(item.id, preview.planId);
      setResults((current) => current.map((result) => result.id === item.id ? { ...result, status: "accepted" } : result));
    } catch (cause) {
      setError(messageOf(cause, "无法审查 AI 建议。"));
    }
  }

  function updateCategory(index: number, field: keyof AiCategory, value: string | boolean) {
    setCategories((current) => current.map((category, currentIndex) => {
      if (currentIndex !== index) return category;
      if (field === "name" && typeof value === "string") {
        const nextId = isGeneratedCategoryId(category.id) && isSafeCategoryTag(value)
          ? value.trim()
          : category.id;
        return {
          ...category,
          name: value,
          id: nextId,
          directory_path: categoryDirectory(rootPath, nextId),
        };
      }
      return { ...category, [field]: value };
    }));
  }

  function updateCategoryId(index: number, value: string) {
    setCategories((current) => current.map((category, currentIndex) => {
      if (currentIndex !== index) return category;
      const nextName = category.name.trim() === "" || category.name.trim() === defaultCategoryName
        ? value.trim() || defaultCategoryName
        : category.name;
      return {
        ...category,
        id: value,
        name: nextName,
        directory_path: categoryDirectory(rootPath, value),
      };
    }));
  }

  function openSettings() {
    if (activeView === "files" || activeView === "ai") setSettingsReturnView(activeView);
    setSettingsOpenedFromAction(true);
    setConfigOpen(true);
    onNavigate?.("settings");
  }

  function closeSettings() {
    setConfigOpen(false);
    setSettingsOpenedFromAction(false);
    onNavigate?.(settingsReturnView);
  }

  const settingsViewOpen = activeView === "settings" || (configOpen && !onNavigate);
  if (settingsViewOpen) {
    return <TemplateSettingsView
      categories={categories}
      templates={templates}
      selectedTemplateId={selectedTemplateId}
      templateDraft={templateDraft}
      templateDirty={templateDirty}
      error={error}
      showClose={settingsOpenedFromAction || (!onNavigate && activeView !== "settings")}
      onClose={closeSettings}
      onNewTemplate={newTemplate}
      onSelectTemplate={selectTemplate}
      onRenameTemplate={(template) => void renameTemplate(template)}
      onMakeGlobal={(template) => void makeGlobal(template)}
      onRemoveTemplate={(template) => void removeTemplate(template)}
      onTemplateNameChange={(value) => {
        if (!templateDraft) return;
        setTemplateDraft({ ...templateDraft, name: value });
        setTemplateDirty(true);
      }}
      onTemplateCategoryChange={(index, field, value) => {
        if (!templateDraft) return;
        setTemplateDraft({ ...templateDraft, categories: updateTemplateCategory(templateDraft.categories, index, field, value) });
        setTemplateDirty(true);
      }}
      onAddTemplateCategory={addTemplateCategory}
      onRemoveTemplateCategory={removeTemplateCategory}
      onSaveTemplate={() => void saveTemplate()}
      onCategoryChange={updateCategory}
      onCategoryIdChange={updateCategoryId}
      onRemoveCategory={(category, index) => void removeCategory(category, index)}
      onAddCategory={addCategory}
      onSaveCategories={() => void saveCategories()}
    />;
  }

  if (activeView === "files") {
    return <AnalysisSetupBar
      selectedEntries={selectedEntries}
      supportedFiles={supportedFiles}
      templates={templates}
      analysisSource={analysisSource}
      onChooseAnalysisSource={chooseAnalysisSource}
      onOpenSettings={openSettings}
      analysisBlockedReason={analysisBlockedReason}
      busy={busy}
      batchId={batchId}
      cancelRequested={cancelRequested}
      onStart={() => void start()}
      onCancel={() => void cancel()}
      progress={progress}
      showConfigureAction={provider?.available === true && !hasEnabledCategory}
    />;
  }

  if (activeView !== "ai") return null;

  return <AiReviewView
    selectedEntries={selectedEntries}
    supportedFiles={supportedFiles}
    model={model}
    setModel={setModel}
    provider={provider}
    onRefreshProvider={() => void refreshProvider()}
    templates={templates}
    analysisSource={analysisSource}
    onChooseAnalysisSource={chooseAnalysisSource}
    onOpenSettings={openSettings}
    showConfigureAction={provider?.available === true && !hasEnabledCategory}
    analysisBlockedReason={analysisBlockedReason}
    busy={busy}
    batchId={batchId}
    cancelRequested={cancelRequested}
    onStart={() => void start()}
    onCancel={() => void cancel()}
    progress={progress}
    error={error}
    results={results}
    edits={edits}
    categories={categories}
    onEdit={(id, edit) => setEdits((current) => ({ ...current, [id]: edit }))}
    onReview={(item, action) => void review(item, action)}
  />;

}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : typeof cause === "string" ? cause : fallback;
}

function updateTemplateCategory(
  categories: TemplateCategory[],
  index: number,
  field: keyof TemplateCategory,
  value: string | boolean,
) {
  return categories.map((category, currentIndex) => {
    if (currentIndex !== index) return category;
    if (field === "name" && typeof value === "string" && isGeneratedCategoryId(category.id) && isSafeCategoryTag(value)) {
      return { ...category, name: value, id: value.trim() };
    }
    return { ...category, [field]: value };
  });
}
