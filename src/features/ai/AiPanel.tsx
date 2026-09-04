import { useEffect, useMemo, useRef, useState } from "react";

import {
  cancelAnalysisBatch,
  confirmAiReviewBatch,
  confirmAnalysisResultPreview,
  deleteAiCategory,
  deleteAiCategoryTemplate,
  getAiCategoryTemplates,
  getAiCategories,
  getAiProviderConfig,
  getAiProviderStatus,
  getAnalysisBatch,
  getAnalysisResults,
  listenForAnalysisProgress,
  renameAiCategoryTemplate,
  reviewAnalysisResult,
  saveAiCategoryTemplate,
  saveAiCategories,
  saveAiProviderConfig,
  setGlobalAiCategoryTemplate,
  startAnalysisBatch,
  testAiProviderConnection,
} from "../../lib/ai-api";
import type { AiAnalysisResult, AiCategory, AiCategoryTemplate, AnalysisCategorySource, AnalysisProgress, AnalysisTask, ProviderStatus, PublicAiProviderConfig, TemplateCategory } from "../../types/ai";
import type { OperationDraft, OperationPreviewResponse } from "../../types/operations";
import type { SearchEntry } from "../../types/search";
import { AnalysisSetupBar } from "./AnalysisSetupBar";
import { AiReviewView } from "./AiReviewView";
import { ProviderSettingsView, type ProviderRequest } from "./ProviderSettingsView";
import { TemplateSettingsView } from "./TemplateSettingsView";

type Props = {
  rootPath: string;
  selectedEntries: SearchEntry[];
  onPreview: (draft: OperationDraft, options?: { navigate?: boolean }) => Promise<OperationPreviewResponse>;
  onDiscardPreview?: (planId: string) => Promise<void>;
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

export function AiPanel({ rootPath, selectedEntries, onPreview, onDiscardPreview, activeView = "ai", onNavigate }: Props) {
  const [model, setModel] = useState("qwen2.5:7b");
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [providerConfig, setProviderConfig] = useState<PublicAiProviderConfig | null>(null);
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
  const [renamingTemplateId, setRenamingTemplateId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, "accepted" | "rejected">>({});
  const [acceptedDrafts, setAcceptedDrafts] = useState<Record<string, OperationDraft>>({});
  const [reviewBusy, setReviewBusy] = useState(false);
  const templateRefreshGeneration = useRef(0);
  const selectedTemplateIdRef = useRef("");
  useEffect(() => {
    selectedTemplateIdRef.current = selectedTemplateId;
  }, [selectedTemplateId]);
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
      ? provider?.provider === "ollama"
        ? `本地模型不可用：${provider?.message ?? "无法读取模型状态。"}。请确认 Ollama 已启动且模型名称正确，然后刷新状态。`
        : `当前模型不可用：${provider?.message ?? "无法读取模型状态。"}。请检查 Provider 配置后刷新状态。`
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
  const reviewProgress = {
    processed: results.filter((result) => result.status !== "pending").length,
    total: results.length,
  };
  const isRemoteProvider = providerConfig?.config.kind === "open_ai_compatible"
    || provider?.provider === "open_ai_compatible";

  useEffect(() => {
    const generation = ++templateRefreshGeneration.current;
    let cancelled = false;
    setProvider(null);
    setError(null);
    setSetupLoading(true);
    void Promise.all([getAiProviderStatus(model), getAiProviderConfig(), getAiCategories(rootPath), getAiCategoryTemplates()])
      .then(([status, storedProviderConfig, storedCategories, storedTemplates]) => {
        if (!cancelled && generation === templateRefreshGeneration.current) {
          setProvider(status);
          setProviderConfig(storedProviderConfig);
          setCategories(storedCategories);
          setSavedCategoryIds(new Set(storedCategories.map((category) => category.id)));
          setTemplates(storedTemplates);
          const globalTemplate = storedTemplates.find((template) => template.is_global);
          const preferred = globalTemplate ?? storedTemplates[0];
          selectedTemplateIdRef.current = preferred?.id ?? "";
          setSelectedTemplateId(preferred?.id ?? "");
          setTemplateDraft(preferred ?? null);
          setTemplateDirty(false);
          setAnalysisSource(globalTemplate
            ? { kind: "template", template_id: globalTemplate.id, expected_version: globalTemplate.version }
            : null);
        }
      })
      .catch((cause) => {
        if (!cancelled && generation === templateRefreshGeneration.current) {
          setError(messageOf(cause, "无法读取 AI 配置。"));
        }
      })
      .finally(() => {
        if (!cancelled && generation === templateRefreshGeneration.current) setSetupLoading(false);
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
            setReviewDecisions({});
            setAcceptedDrafts({});
            setReviewBusy(false);
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
        if (next.phase === "cancelled") {
          setReviewDecisions({});
          setAcceptedDrafts({});
          setReviewBusy(false);
        }
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
    if (isRemoteProvider && !window.confirm(`所选文件正文会发送到远程 Provider：${providerConfig?.config.display_name ?? provider?.provider ?? "外部 API"} · ${model} · ${providerConfig?.config.base_url ?? "配置的 API 地址"}，可能包含敏感信息。是否继续？`)) return;
    setError(null);
    setResults([]);
    setReviewDecisions({});
    setAcceptedDrafts({});
    setReviewBusy(false);
    setCancelRequested(false);
    setBusy(true);
    try {
      const request = {
        root_path: rootPath,
        file_paths: supportedFiles.map((entry) => entry.normalized_path),
        model,
        category_source: source,
        ...(isRemoteProvider ? {
          provider_id: providerConfig?.config.id,
          remote_content_consent: true,
        } : {}),
      };
      const response = await startAnalysisBatch(request);
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
    setRenamingTemplateId(null);
    selectedTemplateIdRef.current = templateId;
    setSelectedTemplateId(templateId);
    setTemplateDraft(templates.find((template) => template.id === templateId) ?? null);
    setTemplateDirty(false);
  }

  async function testProvider(request: ProviderRequest) {
    return testAiProviderConnection(request);
  }

  async function saveProvider(request: ProviderRequest) {
    const saved = await saveAiProviderConfig(request);
    setProviderConfig(saved);
    setModel(saved.config.model);
    setProvider(await getAiProviderStatus(saved.config.model));
  }

  async function refreshTemplateLibrary(preferredId?: string) {
    const generation = ++templateRefreshGeneration.current;
    const refreshed = await getAiCategoryTemplates();
    if (generation !== templateRefreshGeneration.current) return null;
    setTemplates(refreshed);
    const preferred = (preferredId ? refreshed.find((template) => template.id === preferredId) : undefined)
      ?? refreshed.find((template) => template.id === selectedTemplateIdRef.current)
      ?? refreshed.find((template) => template.is_global)
      ?? refreshed[0]
      ?? null;
    selectedTemplateIdRef.current = preferred?.id ?? "";
    setSelectedTemplateId(preferred?.id ?? "");
    setTemplateDraft(preferred);
    setTemplateDirty(false);
    return preferred;
  }

  function newTemplate() {
    if (templateDirty && !window.confirm("当前模板有未保存的修改，确定放弃并新建模板吗？")) return;
    setRenamingTemplateId(null);
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
    selectedTemplateIdRef.current = draft.id;
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
      await refreshTemplateLibrary(saved.id);
      setAnalysisSource((current) => current?.kind === "template" && current.template_id === saved.id
        ? { ...current, expected_version: saved.version }
        : current);
    } catch (cause) {
      setError(messageOf(cause, "无法保存分类模板。"));
    }
  }

  function beginRenameTemplate(target: AiCategoryTemplate | null = templateDraft) {
    if (!target) return;
    if (templateDirty && !window.confirm("当前模板有未保存的修改，确定放弃并重命名吗？")) return;
    selectedTemplateIdRef.current = target.id;
    setSelectedTemplateId(target.id);
    setTemplateDraft(target);
    setTemplateDirty(false);
    setError(null);
    setRenamingTemplateId(target.id);
    setRenameDraft(target.name);
  }

  function cancelRenameTemplate() {
    setRenamingTemplateId(null);
    setRenameDraft("");
  }

  async function renameTemplate() {
    if (!renamingTemplateId) return;
    const target = templates.find((template) => template.id === renamingTemplateId) ?? templateDraft;
    const name = renameDraft.trim();
    if (!target || !name) {
      setError("模板名称不能为空。");
      return;
    }
    if (name === target.name) {
      cancelRenameTemplate();
      return;
    }
    setError(null);
    try {
      const renamed = await renameAiCategoryTemplate(target.id, name);
      await refreshTemplateLibrary(renamed.id);
      cancelRenameTemplate();
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
      const refreshedGlobal = await refreshTemplateLibrary(globalTemplate.id);
      if (refreshedGlobal?.id === globalTemplate.id && refreshedGlobal.is_global) {
        setAnalysisSource({ kind: "template", template_id: globalTemplate.id, expected_version: globalTemplate.version });
      }
    } catch (cause) {
      setError(messageOf(cause, "无法设置全局分类模板。"));
    }
  }

  async function removeTemplate(target: AiCategoryTemplate | null = templateDraft) {
    if (!target || target.is_global || !window.confirm(`确定删除模板“${target.name}”吗？已保存的文件和历史结果不会改变。`)) return;
    setError(null);
    try {
      await deleteAiCategoryTemplate(target.id);
      await refreshTemplateLibrary();
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

  async function finalizeReview(
    nextResults: AiAnalysisResult[],
    nextDecisions: Record<string, "accepted" | "rejected">,
    nextDrafts: Record<string, OperationDraft>,
  ) {
    if (nextResults.some((result) => result.status === "pending" && !nextDecisions[result.id])) return;
    const acceptedIds = nextResults
      .filter((result) => nextDecisions[result.id] === "accepted")
      .map((result) => result.id);
    if (acceptedIds.length === 0) {
      setError(`已处理 ${nextResults.length}/${nextResults.length} 个文件，没有待执行操作。`);
      return;
    }
    const acceptedItems = acceptedIds.flatMap((resultId) => nextDrafts[resultId]?.items ?? []);
    if (acceptedItems.length === 0) {
      throw new Error("没有可预览的已接受操作。 ");
    }
    let preview: OperationPreviewResponse | undefined;
    try {
      preview = await onPreview({ root_path: nextResults[0].root_path, items: acceptedItems }, { navigate: false });
      if (!preview.canConfirm || !preview.planId) {
        throw new Error("操作预览未通过校验，建议仍保持待审查状态。");
      }
      if (acceptedIds.length === 1) {
        await confirmAnalysisResultPreview(acceptedIds[0], preview.planId);
      } else {
        await confirmAiReviewBatch(acceptedIds, preview.planId);
      }
      setResults((current) => current.map((result) => acceptedIds.includes(result.id) ? { ...result, status: "accepted" } : result));
      onNavigate?.("preview");
    } catch (cause) {
      if (preview?.planId && onDiscardPreview) await onDiscardPreview(preview.planId).catch(() => undefined);
      setResults((current) => current.map((result) => acceptedIds.includes(result.id) ? { ...result, status: "pending" } : result));
      setReviewDecisions((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !acceptedIds.includes(id))));
      setAcceptedDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !acceptedIds.includes(id))));
      throw cause;
    }
  }

  async function review(item: AiAnalysisResult, action: "accept" | "reject") {
    if (reviewBusy || item.status !== "pending") return;
    setReviewBusy(true);
    setError(null);
    try {
      const edit = edits[item.id] ?? { filename: item.suggested_filename, categoryId: item.category_id ?? "" };
      const draft = await reviewAnalysisResult({
        result_id: item.id,
        action,
        suggested_filename: action === "accept" ? edit.filename : null,
        category_id: action === "accept" && edit.categoryId ? edit.categoryId : null,
      });
      const nextStatus: AiAnalysisResult["status"] = action === "accept" ? "accepted" : "rejected";
      const nextDecision: "accepted" | "rejected" = action === "accept" ? "accepted" : "rejected";
      const nextResults: AiAnalysisResult[] = results.map((result) => result.id === item.id ? { ...result, status: nextStatus } : result);
      const nextDecisions: Record<string, "accepted" | "rejected"> = { ...reviewDecisions, [item.id]: nextDecision };
      const nextDrafts = { ...acceptedDrafts };
      if (draft) nextDrafts[item.id] = draft;
      else delete nextDrafts[item.id];
      setResults(nextResults);
      setReviewDecisions(nextDecisions);
      setAcceptedDrafts(nextDrafts);
      await finalizeReview(nextResults, nextDecisions, nextDrafts);
    } catch (cause) {
      setError(messageOf(cause, "无法审查 AI 建议。"));
      setResults((current) => current.map((result) => result.id === item.id && action === "accept" ? { ...result, status: "pending" } : result));
    } finally {
      setReviewBusy(false);
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
    return <>
      {providerConfig && <ProviderSettingsView
        config={providerConfig}
        status={provider}
        onTest={testProvider}
        onSave={saveProvider}
      />}
      <TemplateSettingsView
        categories={categories}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        templateDraft={templateDraft}
        templateDirty={templateDirty}
        renamingTemplateId={renamingTemplateId}
        renameDraft={renameDraft}
        error={error}
        showClose={settingsOpenedFromAction || (!onNavigate && activeView !== "settings")}
        onClose={closeSettings}
        onNewTemplate={newTemplate}
        onSelectTemplate={selectTemplate}
        onRenameTemplate={beginRenameTemplate}
        onRenameDraftChange={setRenameDraft}
        onConfirmRename={() => void renameTemplate()}
        onCancelRename={cancelRenameTemplate}
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
      />
    </>;
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
    reviewProgress={reviewProgress}
    reviewBusy={reviewBusy}
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
