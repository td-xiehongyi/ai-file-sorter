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

type Props = {
  rootPath: string;
  selectedEntries: SearchEntry[];
  onPreview: (draft: OperationDraft) => Promise<OperationPreviewResponse>;
  onChooseDirectory: () => Promise<string | null>;
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

export function AiPanel({ rootPath, selectedEntries, onPreview }: Props) {
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
    if (!target || target.is_global) return;
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

  return (
    <section aria-labelledby="ai-panel-title" className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.045] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Phase 5 · Local AI</p>
          <h2 id="ai-panel-title" className="mt-2 text-lg font-semibold text-white">本地内容分析与整理建议</h2>
          <p className="mt-1 text-sm text-slate-400">正文只在当前任务内存中使用，建议仍需预览和确认。</p>
        </div>
        <button type="button" onClick={() => setConfigOpen((value) => !value)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">配置分类</button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="text-xs text-slate-400">模型<input aria-label="模型" value={model} onChange={(event) => setModel(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white" /></label>
        <div className="flex items-end gap-2"><span className={provider?.available ? "text-sm text-emerald-200" : "text-sm text-amber-200"}>{provider?.message ?? "正在检查 Ollama…"}</span><button type="button" onClick={() => void refreshProvider()} className="rounded-lg border border-white/10 px-2 py-2 text-xs">刷新</button></div>
      </div>

      {configOpen && <div className="mt-4 space-y-4 rounded-xl border border-white/10 p-4">
        <div className="space-y-4 rounded-xl border border-violet-200/10 bg-violet-200/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">设置</p><h3 className="mt-1 text-base font-semibold text-violet-100">模板库</h3><p className="mt-1 text-xs text-slate-400">管理分类模板；模板只在分析前选择，不会自动修改当前目录。</p></div><button type="button" onClick={newTemplate} className="rounded-lg border border-white/10 px-3 py-2 text-xs">新建模板</button></div>
          <div className="grid gap-4 lg:grid-cols-[minmax(210px,0.75fr)_minmax(0,1.5fr)]">
            <div className="space-y-2" aria-label="模板列表">
              {templates.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-4 text-xs text-slate-500">还没有保存的模板。</p>}
              {templates.map((template) => <div key={template.id} className={`rounded-lg border p-2 ${selectedTemplateId === template.id ? "border-violet-300/50 bg-violet-200/[0.08]" : "border-white/10"}`}>
                <button type="button" onClick={() => selectTemplate(template.id)} className="w-full rounded-md px-2 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.04]"><span className="font-medium">{template.name}</span><span className="mt-1 block text-xs text-slate-500">v{template.version} · {template.is_global ? "当前全局" : "已保存"}</span></button>
                <div className="flex flex-wrap gap-2 px-2 pb-1 pt-1"><button type="button" onClick={() => selectTemplate(template.id)} className="text-xs text-slate-300 hover:text-white">查看/修改</button>{!template.is_global && <><button type="button" onClick={() => { setSelectedTemplateId(template.id); setTemplateDraft(template); setTemplateDirty(false); void renameTemplate(template); }} className="text-xs text-slate-300 hover:text-white">重命名</button><button type="button" onClick={() => { setSelectedTemplateId(template.id); setTemplateDraft(template); setTemplateDirty(false); void makeGlobal(template); }} className="text-xs text-slate-300 hover:text-white">设为全局</button><button type="button" onClick={() => { setSelectedTemplateId(template.id); setTemplateDraft(template); setTemplateDirty(false); void removeTemplate(template); }} className="text-xs text-rose-200 hover:text-rose-100">删除模板</button></>}</div>
              </div>)}
            </div>
            <div className="space-y-4 rounded-lg border border-white/10 bg-slate-950/20 p-4">
              {!templateDraft ? <p className="text-sm text-slate-400">选择一个模板开始编辑，或新建模板。</p> : <>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-base font-semibold text-white">{templateDraft.name}</h4><p className="mt-1 text-xs text-slate-500">模板版本 v{templateDraft.version}</p></div><span className={`rounded-full px-2 py-1 text-xs ${templateDraft.is_global ? "bg-emerald-300/15 text-emerald-200" : "bg-white/5 text-slate-400"}`}>{templateDraft.is_global ? "当前全局" : "已保存"}</span></div>
                <div className="flex flex-wrap gap-2">{!templateDraft.is_global && <><button type="button" onClick={() => void renameTemplate()} className="rounded-lg border border-white/10 px-3 py-2 text-xs">重命名</button><button type="button" onClick={() => void makeGlobal()} className="rounded-lg border border-emerald-200/30 px-3 py-2 text-xs text-emerald-100">设为全局</button><button type="button" onClick={() => void removeTemplate()} className="rounded-lg border border-rose-200/30 px-3 py-2 text-xs text-rose-100">删除模板</button></>}</div>
                <label className="block text-xs text-slate-400">模板名称<input aria-label="模板名称" disabled={templateDraft.is_global || templateDraft.version > 0} value={templateDraft.name} onChange={(event) => { setTemplateDraft({ ...templateDraft, name: event.target.value }); setTemplateDirty(true); }} className="mt-1 w-full rounded-lg bg-slate-950/60 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60" /></label>
                <div className="space-y-2">{templateDraft.categories.map((category, index) => <div key={`${category.id}-${index}`} className="grid gap-2 rounded-lg border border-white/5 p-3 md:grid-cols-[1fr_1.4fr_auto_auto]"><input aria-label={`模板分类 ${index + 1} 名称`} value={category.name} onChange={(event) => { setTemplateDraft({ ...templateDraft, categories: updateTemplateCategory(templateDraft.categories, index, "name", event.target.value) }); setTemplateDirty(true); }} className="rounded-lg bg-slate-950/60 px-3 py-2 text-sm" /><input aria-label={`模板分类 ${index + 1} 描述`} value={category.description} onChange={(event) => { setTemplateDraft({ ...templateDraft, categories: updateTemplateCategory(templateDraft.categories, index, "description", event.target.value) }); setTemplateDirty(true); }} className="rounded-lg bg-slate-950/60 px-3 py-2 text-sm" /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={category.default_enabled} onChange={(event) => { setTemplateDraft({ ...templateDraft, categories: updateTemplateCategory(templateDraft.categories, index, "default_enabled", event.target.checked) }); setTemplateDirty(true); }} />默认启用</label><button type="button" onClick={() => removeTemplateCategory(index)} className="rounded-lg border border-rose-200/30 px-2 py-1 text-xs text-rose-100">删除模板分类 {index + 1}</button><details className="rounded-lg border border-white/10 px-3 py-2 md:col-span-full"><summary className="cursor-pointer text-xs text-slate-400">高级设置</summary><label className="mt-2 block text-xs text-slate-400">分类 ID<input aria-label={`模板分类 ${index + 1} ID`} value={category.id} onChange={(event) => { setTemplateDraft({ ...templateDraft, categories: updateTemplateCategory(templateDraft.categories, index, "id", event.target.value) }); setTemplateDirty(true); }} className="mt-1 w-full rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-300" /></label></details></div>)}<button type="button" onClick={addTemplateCategory} className="rounded-lg border border-white/10 px-3 py-2 text-xs">新增模板分类</button></div>
                <div className="flex justify-end"><button type="button" onClick={() => void saveTemplate()} className="rounded-lg bg-violet-300 px-4 py-2 text-xs font-semibold text-slate-950">保存模板</button></div>
              </>}
            </div>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-white/10 p-4">
        <div><h3 className="text-sm font-semibold text-slate-200">当前目录自定义分类</h3><p className="mt-1 text-xs text-slate-500">仅影响当前授权目录，可独立于模板库保存。</p></div>
        {categories.map((category, index) => <div key={`${category.id}-${index}`} className="grid gap-2 rounded-lg border border-white/5 p-2 md:grid-cols-[1fr_1.4fr_1.4fr_auto_auto]">
          <input aria-label={`分类 ${index + 1} 名称`} value={category.name} onChange={(event) => updateCategory(index, "name", event.target.value)} className="rounded-lg bg-slate-950/60 px-3 py-2 text-sm" />
          <input aria-label={`分类 ${index + 1} 描述`} value={category.description} onChange={(event) => updateCategory(index, "description", event.target.value)} className="rounded-lg bg-slate-950/60 px-3 py-2 text-sm" />
          <input aria-label={`分类 ${index + 1} 目录`} value={category.directory_path} readOnly className="rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-400" />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={category.enabled} onChange={(event) => updateCategory(index, "enabled", event.target.checked)} />启用</label>
          <button type="button" onClick={() => void removeCategory(category, index)} className="rounded-lg border border-rose-200/30 px-2 py-1 text-xs text-rose-100">删除分类 {index + 1}</button>
          <details className="rounded-lg border border-white/10 px-3 py-2 md:col-span-full"><summary className="cursor-pointer text-xs text-slate-400">高级设置</summary><label className="mt-2 block text-xs text-slate-400">分类 ID<input aria-label={`分类 ${index + 1} ID`} value={category.id} onChange={(event) => updateCategoryId(index, event.target.value)} className="mt-1 w-full rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-300" /></label></details>
        </div>)}
        </div>
        <div className="flex gap-2"><button type="button" onClick={() => void addCategory()} className="rounded-lg border border-white/10 px-3 py-2 text-xs">新增分类</button><button type="button" onClick={() => void saveCategories()} className="rounded-lg bg-violet-300 px-3 py-2 text-xs font-semibold text-slate-950">保存分类</button></div>
      </div>}

      {error && <div role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.08] p-3 text-sm text-rose-100">{error}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {selectedEntries.length > 0 && <><label className="min-w-60 text-xs text-slate-400">分类方案<select aria-label="分类方案" value={analysisSource?.kind === "template" ? `template:${analysisSource.template_id}` : analysisSource?.kind === "root_custom" ? "root_custom" : ""} onChange={(event) => chooseAnalysisSource(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"><option value="">请选择分类方案</option>{templates.map((template) => <option key={template.id} value={`template:${template.id}`}>{template.name}{template.is_global ? " · 全局" : ""} · v{template.version}</option>)}<option value="root_custom">当前目录自定义分类</option></select></label><button type="button" onClick={() => setConfigOpen(true)} className="self-end rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">管理分类</button></>}
        <button type="button" disabled={analysisBlockedReason !== null} onClick={() => void start()} className="rounded-xl bg-violet-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">分析所选文件（{supportedFiles.length}）</button>
        {busy && batchId && <button type="button" disabled={cancelRequested} onClick={() => void cancel()} className="rounded-xl border border-white/10 px-4 py-2 text-sm disabled:opacity-40">{cancelRequested ? "取消中…" : "取消分析"}</button>}
        {selectedEntries.length > supportedFiles.length && <span className="text-xs text-slate-500">已忽略不支持的格式</span>}
        {progress && <span role="status" className="text-xs text-violet-200">{progress.completed_files}/{progress.total_files} · {progress.phase}</span>}
      </div>
      {analysisBlockedReason && <div role="status" aria-live="polite" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-100">
        <span>{analysisBlockedReason}</span>
        {!setupLoading && provider?.available && !hasEnabledCategory && <button type="button" onClick={() => setConfigOpen(true)} className="rounded-lg border border-amber-200/30 px-2 py-1 font-medium text-amber-100">现在配置分类</button>}
      </div>}

      {results.length > 0 && <div className="mt-5 space-y-3">
        {results.map((item) => {
          const edit = edits[item.id] ?? { filename: item.suggested_filename, categoryId: item.category_id ?? "" };
          return <article key={item.id} className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
            <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-medium text-white">{item.source_path.split(/[\\/]/).at(-1)}</h3><p className="mt-1 text-sm text-slate-300">{item.summary}</p></div><span className="text-xs text-violet-200">置信度 {Math.round(item.confidence * 100)}%</span></div>
            <p className="mt-2 text-xs text-slate-500">{item.keywords.join(" · ")}</p>
            <p className="mt-2 text-xs text-slate-400">{item.reason}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-400">建议文件名<input aria-label={`${item.source_path.split(/[\\/]/).at(-1)} 的建议文件名`} value={edit.filename} disabled={item.status !== "pending"} onChange={(event) => setEdits((current) => ({ ...current, [item.id]: { ...edit, filename: event.target.value } }))} className="mt-1 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-white" /></label>
              <label className="text-xs text-slate-400">目标分类<select aria-label={`${item.source_path.split(/[\\/]/).at(-1)} 的目标分类`} value={edit.categoryId} disabled={item.status !== "pending"} onChange={(event) => setEdits((current) => ({ ...current, [item.id]: { ...edit, categoryId: event.target.value } }))} className="mt-1 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"><option value="">保留原目录</option>{categories.filter((category) => category.enabled).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            </div>
            {item.status === "pending" ? <div className="mt-3 flex gap-2"><button type="button" onClick={() => void review(item, "accept")} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-slate-950">接受建议</button><button type="button" onClick={() => void review(item, "reject")} className="rounded-lg border border-white/10 px-3 py-2 text-xs">拒绝</button></div> : <div className="mt-3 text-xs text-slate-500">状态：{item.status}</div>}
          </article>;
        })}
      </div>}
    </section>
  );
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
