import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type { AnalysisProgress } from "../../types/ai";
import type { SearchEntry } from "../../types/search";
import { AiPanel } from "./AiPanel";

const aiApi = vi.hoisted(() => ({
  cancelAnalysisBatch: vi.fn(),
  confirmAnalysisResultPreview: vi.fn(),
  deleteAiCategory: vi.fn(),
  deleteAiCategoryTemplate: vi.fn(),
  getAiCategoryTemplates: vi.fn(),
  getAiCategories: vi.fn(),
  getAiProviderStatus: vi.fn(),
  getAnalysisBatch: vi.fn(),
  getAnalysisResults: vi.fn(),
  listenForAnalysisProgress: vi.fn(),
  renameAiCategoryTemplate: vi.fn(),
  reviewAnalysisResult: vi.fn(),
  saveAiCategoryTemplate: vi.fn(),
  saveAiCategories: vi.fn(),
  setGlobalAiCategoryTemplate: vi.fn(),
  startAnalysisBatch: vi.fn(),
}));

vi.mock("../../lib/ai-api", () => aiApi);

const selectedEntries: SearchEntry[] = [
  { id: 1, normalized_path: "C:/Docs/notes.md", name: "notes.md", extension: "md", kind: "file", size: 10, modified_ms: 1 },
  { id: 2, normalized_path: "C:/Docs/table.xlsx", name: "table.xlsx", extension: "xlsx", kind: "file", size: 10, modified_ms: 1 },
];

let progressListener: ((progress: AnalysisProgress) => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  progressListener = undefined;
  aiApi.getAiProviderStatus.mockResolvedValue({ available: true, provider: "ollama", model: "qwen2.5:7b", message: "模型已就绪" });
  aiApi.getAiCategoryTemplates.mockResolvedValue([{ id: "default", name: "默认模板", version: 1, is_global: true, categories: [{ id: "work", name: "工作", description: "工作资料", default_enabled: true }] }]);
  aiApi.getAiCategories.mockResolvedValue([{ id: "work", name: "工作", description: "工作资料", directory_path: "C:/Docs/work", enabled: true }]);
  aiApi.listenForAnalysisProgress.mockImplementation(async (listener: (progress: AnalysisProgress) => void) => {
    progressListener = listener;
    return () => undefined;
  });
  aiApi.startAnalysisBatch.mockResolvedValue({ batch_id: "analysis-1" });
  aiApi.getAnalysisResults.mockResolvedValue([{ id: "result-1", batch_id: "analysis-1", root_path: "C:/Docs", source_path: "C:/Docs/notes.md", content_fingerprint: "abc", provider: "ollama", model: "qwen2.5:7b", prompt_version: "phase5-v1", summary: "会议纪要", keywords: ["项目", "会议"], suggested_filename: "项目会议.md", category_id: "work", confidence: 0.9, reason: "工作资料", status: "pending", created_at: "1" }]);
  aiApi.reviewAnalysisResult.mockResolvedValue({ root_path: "C:/Docs", items: [{ operation: "ai_organize", source_path: "C:/Docs/notes.md", category_id: "work", new_name: "最终会议.md", content_fingerprint: "abc" }] });
  aiApi.saveAiCategories.mockResolvedValue([]);
  aiApi.cancelAnalysisBatch.mockResolvedValue(undefined);
  aiApi.confirmAnalysisResultPreview.mockResolvedValue(undefined);
  aiApi.deleteAiCategory.mockResolvedValue(undefined);
  aiApi.deleteAiCategoryTemplate.mockResolvedValue(undefined);
  aiApi.saveAiCategoryTemplate.mockResolvedValue({ id: "default", name: "默认模板", version: 2, is_global: true, categories: [{ id: "work", name: "工作", description: "工作资料", default_enabled: true }] });
  aiApi.renameAiCategoryTemplate.mockImplementation(async (id: string, name: string) => ({ id, name, version: 1, is_global: false, categories: [{ id: "work", name: "工作", description: "工作资料", default_enabled: true }] }));
  aiApi.setGlobalAiCategoryTemplate.mockImplementation(async (id: string) => ({ id, name: id === "saved" ? "项目模板" : "默认模板", version: 1, is_global: true, categories: [{ id: "work", name: "工作", description: "工作资料", default_enabled: true }] }));
});

it("analyzes only supported selected files and displays completed suggestions", async () => {
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  expect(await screen.findByText("模型已就绪")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "分析所选文件（1）" }));
  await waitFor(() => expect(aiApi.startAnalysisBatch).toHaveBeenCalledWith({
    root_path: "C:/Docs",
    file_paths: ["C:/Docs/notes.md"],
    model: "qwen2.5:7b",
    category_source: { kind: "template", template_id: "default", expected_version: 1 },
  }));

  await waitFor(() => expect(progressListener).toBeDefined());
  progressListener?.({ batch_id: "analysis-1", phase: "completed", completed_files: 1, total_files: 1, current_path: null, error_count: 0 });
  expect(await screen.findByText("会议纪要")).toBeInTheDocument();
  expect(screen.getByText("项目 · 会议")).toBeInTheDocument();
  expect(screen.getByText("置信度 90%")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "接受建议" })).toBeInTheDocument();
});

it("notifies the workspace when analysis results become available", async () => {
  const onNavigate = vi.fn();
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} onNavigate={onNavigate} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "分析所选文件（1）" }));
  await waitFor(() => expect(progressListener).toBeDefined());
  progressListener?.({ batch_id: "analysis-1", phase: "completed", completed_files: 1, total_files: 1, current_path: null, error_count: 0 });

  await screen.findByText("会议纪要");
  expect(onNavigate).toHaveBeenCalledWith("ai");
});

it("renders the dedicated template settings view without an apply action", async () => {
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} activeView="settings" onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  expect(screen.getByRole("heading", { name: "分类模板" })).toBeInTheDocument();
  expect(await screen.findByText("模板库")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "新建模板" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "应用模板" })).not.toBeInTheDocument();
});

it("keeps the category selector and analysis action accessible", async () => {
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  const selector = screen.getByLabelText("分类方案");
  selector.focus();
  expect(document.activeElement).toBe(selector);
  expect(screen.getByRole("button", { name: "分析所选文件（1）" })).not.toBeDisabled();
});

it("submits the selected saved template as the analysis category source", async () => {
  aiApi.getAiCategoryTemplates.mockResolvedValue([
    { id: "default", name: "默认模板", version: 1, is_global: true, categories: [{ id: "work", name: "工作", description: "工作资料", default_enabled: true }] },
    { id: "saved", name: "项目模板", version: 3, is_global: false, categories: [{ id: "project", name: "项目", description: "项目资料", default_enabled: true }] },
  ]);
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.change(screen.getByLabelText("分类方案"), { target: { value: "template:saved" } });
  fireEvent.click(screen.getByRole("button", { name: "分析所选文件（1）" }));

  await waitFor(() => expect(aiApi.startAnalysisBatch).toHaveBeenCalledWith(expect.objectContaining({
    category_source: { kind: "template", template_id: "saved", expected_version: 3 },
  })));
});

it("submits current directory categories when that source is selected", async () => {
  aiApi.getAiCategoryTemplates.mockResolvedValue([]);
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.change(screen.getByLabelText("分类方案"), { target: { value: "root_custom" } });
  fireEvent.click(screen.getByRole("button", { name: "分析所选文件（1）" }));

  await waitFor(() => expect(aiApi.startAnalysisBatch).toHaveBeenCalledWith(expect.objectContaining({
    category_source: { kind: "root_custom" },
  })));
});

it("includes common source files in the analyzable selection", async () => {
  const codeEntries: SearchEntry[] = [
    { id: 3, normalized_path: "C:/Docs/main.cpp", name: "main.cpp", extension: "cpp", kind: "file", size: 10, modified_ms: 1 },
    { id: 4, normalized_path: "C:/Docs/Main.java", name: "Main.java", extension: "java", kind: "file", size: 10, modified_ms: 1 },
  ];
  render(<AiPanel rootPath="C:/Docs" selectedEntries={codeEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  expect(await screen.findByText("模型已就绪")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "分析所选文件（2）" })).not.toBeDisabled();
});

it("accepts an edited suggestion as an operation draft for phase four preview", async () => {
  const onPreview = vi.fn().mockResolvedValue({ canConfirm: true, planId: "plan-1", expiresAt: "1", items: [] });
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={onPreview} onChooseDirectory={vi.fn()} />);
  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "分析所选文件（1）" }));
  await waitFor(() => expect(progressListener).toBeDefined());
  progressListener?.({ batch_id: "analysis-1", phase: "completed", completed_files: 1, total_files: 1, current_path: null, error_count: 0 });
  await screen.findByText("会议纪要");

  fireEvent.change(screen.getByLabelText("notes.md 的建议文件名"), { target: { value: "最终会议.md" } });
  fireEvent.click(screen.getByRole("button", { name: "接受建议" }));

  await waitFor(() => expect(aiApi.reviewAnalysisResult).toHaveBeenCalledWith({
    result_id: "result-1",
    action: "accept",
    suggested_filename: "最终会议.md",
    category_id: "work",
  }));
  expect(onPreview).toHaveBeenCalledWith(await aiApi.reviewAnalysisResult.mock.results[0].value);
  expect(aiApi.confirmAnalysisResultPreview).toHaveBeenCalledWith("result-1", "plan-1");
});

it("keeps a suggestion pending when phase four preview fails", async () => {
  const onPreview = vi.fn().mockRejectedValue(new Error("预览失败"));
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={onPreview} onChooseDirectory={vi.fn()} />);
  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "分析所选文件（1）" }));
  await waitFor(() => expect(progressListener).toBeDefined());
  progressListener?.({ batch_id: "analysis-1", phase: "completed", completed_files: 1, total_files: 1, current_path: null, error_count: 0 });
  await screen.findByText("会议纪要");

  fireEvent.click(screen.getByRole("button", { name: "接受建议" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("预览失败");
  expect(aiApi.confirmAnalysisResultPreview).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "接受建议" })).toBeInTheDocument();
});

it("shows cancellation immediately and recovers the final state through polling", async () => {
  let pollCount = 0;
  aiApi.getAnalysisBatch.mockImplementation(async () => {
    pollCount += 1;
    return {
      batch_id: "analysis-1",
      status: pollCount === 1 ? "cancelling" : "cancelled",
      total_files: 1,
      completed_files: 0,
      current_path: "C:/Docs/notes.md",
      result_ids: [],
      failures: [],
      error: null,
    };
  });

  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);
  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "分析所选文件（1）" }));
  await waitFor(() => expect(aiApi.startAnalysisBatch).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("button", { name: "取消分析" }));
  expect(await screen.findByRole("button", { name: "取消中…" })).toBeDisabled();
  expect(aiApi.cancelAnalysisBatch).toHaveBeenCalledWith("analysis-1");

  await waitFor(() => expect(screen.getByText("0/1 · cancelled")).toBeInTheDocument(), { timeout: 1500 });
  expect(screen.getByRole("button", { name: "分析所选文件（1）" })).not.toBeDisabled();
});

it("keeps analysis disabled when the local model is unavailable", async () => {
  aiApi.getAiProviderStatus.mockResolvedValue({ available: false, provider: "ollama", model: "qwen2.5:7b", message: "模型未安装" });
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);
  expect(await screen.findByText("模型未安装")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "分析所选文件（1）" })).toBeDisabled();
  expect(screen.getByText("本地模型不可用：模型未安装。请确认 Ollama 已启动且模型名称正确，然后刷新状态。")).toBeInTheDocument();
});

it("explains that a supported file must be selected before analysis", async () => {
  render(<AiPanel rootPath="C:/Docs" selectedEntries={[]} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  expect(screen.getByRole("button", { name: "分析所选文件（0）" })).toBeDisabled();
  expect(screen.getByText("请在文件列表中勾选至少一个 TXT、MD、PDF、DOCX 或常见代码/配置文件。")).toBeInTheDocument();
});

it("opens category configuration from the missing-category guidance", async () => {
  aiApi.getAiCategories.mockResolvedValue([]);
  aiApi.getAiCategoryTemplates.mockResolvedValue([]);
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  expect(screen.getByRole("button", { name: "分析所选文件（1）" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "现在配置分类" }));
  expect(screen.getByRole("button", { name: "保存分类" })).toBeInTheDocument();
});

it("deletes a local category without deleting its directory", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));
  fireEvent.click(screen.getByRole("button", { name: "删除分类 1" }));

  await waitFor(() => expect(aiApi.deleteAiCategory).toHaveBeenCalledWith("C:/Docs", "work"));
  expect(confirm).toHaveBeenCalled();
  confirm.mockRestore();
});

it("renders a template library with rename for the global template and no global delete", async () => {
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));

  expect(screen.getByText("模板库")).toBeInTheDocument();
  expect(screen.getByText("当前全局")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "新建模板" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "重命名" }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "删除模板" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "应用模板" })).not.toBeInTheDocument();
});

it("creates a local category from a tag without choosing an existing directory", async () => {
  const onChooseDirectory = vi.fn();
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={onChooseDirectory} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));
  fireEvent.click(screen.getByRole("button", { name: "新增分类" }));
  fireEvent.change(screen.getByLabelText("分类 2 ID"), { target: { value: "game" } });

  expect(screen.getByLabelText("分类 2 名称")).toHaveValue("game");
  expect(screen.getByLabelText("分类 2 目录")).toHaveValue("C:/Docs/game");
  expect(onChooseDirectory).not.toHaveBeenCalled();
});

it("syncs a generated category ID from a safe visible name before saving", async () => {
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));
  fireEvent.click(screen.getByRole("button", { name: "新增分类" }));
  fireEvent.change(screen.getByLabelText("分类 2 名称"), { target: { value: "study" } });

  expect(screen.getByLabelText("分类 2 目录")).toHaveValue("C:/Docs/study");
  fireEvent.click(screen.getByRole("button", { name: "保存分类" }));

  await waitFor(() => expect(aiApi.saveAiCategories).toHaveBeenCalledWith("C:/Docs", [
    { id: "work", name: "工作", description: "工作资料", directory_path: "C:/Docs/work", enabled: true },
    { id: "study", name: "study", description: "", directory_path: "C:/Docs/study", enabled: true },
  ]));
});

it("allows a non-global template to be renamed and made global", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const prompt = vi.spyOn(window, "prompt").mockReturnValue("项目模板");
  aiApi.getAiCategoryTemplates.mockResolvedValue([
    { id: "default", name: "默认模板", version: 1, is_global: true, categories: [{ id: "work", name: "工作", description: "工作资料", default_enabled: true }] },
    { id: "saved", name: "旧模板", version: 2, is_global: false, categories: [{ id: "study", name: "学习", description: "学习资料", default_enabled: true }] },
  ]);
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));
  fireEvent.click(screen.getByRole("button", { name: /旧模板/ }));
  expect(screen.getAllByRole("button", { name: "重命名" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "设为全局" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "删除模板" }).length).toBeGreaterThan(0);

  fireEvent.click(screen.getAllByRole("button", { name: "重命名" }).at(-1)!);
  await waitFor(() => expect(aiApi.renameAiCategoryTemplate).toHaveBeenCalledWith("saved", "项目模板"));
  fireEvent.click(screen.getAllByRole("button", { name: "设为全局" }).at(-1)!);
  await waitFor(() => expect(aiApi.setGlobalAiCategoryTemplate).toHaveBeenCalledWith("saved"));
  expect(confirm).toHaveBeenCalled();
  expect(prompt).toHaveBeenCalled();
  confirm.mockRestore();
  prompt.mockRestore();
});

it("allows deleting a non-global template", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  aiApi.getAiCategoryTemplates.mockResolvedValue([
    { id: "saved", name: "旧模板", version: 2, is_global: false, categories: [{ id: "study", name: "学习", description: "学习资料", default_enabled: true }] },
  ]);
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));
  fireEvent.click(screen.getAllByRole("button", { name: "删除模板" }).at(-1)!);
  await waitFor(() => expect(aiApi.deleteAiCategoryTemplate).toHaveBeenCalledWith("saved"));
  confirm.mockRestore();
});

it("starts a new non-global template with an editable category", async () => {
  aiApi.getAiCategories.mockResolvedValue([]);
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));
  fireEvent.click(screen.getByRole("button", { name: "新建模板" }));

  expect(screen.getByLabelText("模板分类 1 名称")).toHaveValue("新分类");
  expect(screen.getByLabelText("模板名称")).not.toBeDisabled();
  fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: "学习模板" } });
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
  await waitFor(() => expect(aiApi.saveAiCategoryTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: "学习模板", categories: [expect.any(Object)] })));
});

it("syncs a generated template category ID when its visible name is a safe tag", async () => {
  aiApi.getAiCategoryTemplates.mockResolvedValue([{
    id: "default",
    name: "默认模板",
    version: 1,
    is_global: true,
    categories: [
      { id: "category_1", name: "新分类", description: "", default_enabled: true },
      { id: "category_2", name: "新分类", description: "", default_enabled: true },
    ],
  }]);
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));
  fireEvent.change(screen.getByLabelText("模板分类 2 名称"), { target: { value: "study" } });
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));

  await waitFor(() => expect(aiApi.saveAiCategoryTemplate).toHaveBeenCalledWith({
    id: "default",
    name: "默认模板",
    categories: [
      { id: "category_1", name: "新分类", description: "", default_enabled: true },
      { id: "study", name: "study", description: "", default_enabled: true },
    ],
  }));
});

it("saves edited categories without applying them to the current directory", async () => {
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));
  fireEvent.change(screen.getByLabelText("模板分类 1 描述"), { target: { value: "会议资料" } });
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));

  await waitFor(() => expect(aiApi.saveAiCategoryTemplate).toHaveBeenCalledWith({
    id: "default",
    name: "默认模板",
    categories: [{ id: "work", name: "工作", description: "会议资料", default_enabled: true }],
  }));
});

it("shows the local category name first and keeps its internal ID in collapsed advanced settings", async () => {
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));

  expect(screen.getByLabelText("分类 1 名称")).toHaveValue("工作");
  const advanced = screen.getAllByText("高级设置").at(-1)!;
  expect(advanced.parentElement).not.toHaveAttribute("open");
  fireEvent.click(advanced);
  expect(screen.getByLabelText("分类 1 ID")).toHaveValue("work");
});

it("saves a renamed local category without changing its internal ID", async () => {
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));
  fireEvent.change(screen.getByLabelText("分类 1 名称"), { target: { value: "会议资料" } });
  fireEvent.click(screen.getByRole("button", { name: "保存分类" }));

  await waitFor(() => expect(aiApi.saveAiCategories).toHaveBeenCalledWith("C:/Docs", [{
    id: "work",
    name: "会议资料",
    description: "工作资料",
    directory_path: "C:/Docs/work",
    enabled: true,
  }]));
});

it("uses the category name as the primary field in global template editing", async () => {
  render(<AiPanel rootPath="C:/Docs" selectedEntries={selectedEntries} onPreview={vi.fn()} onChooseDirectory={vi.fn()} />);

  await screen.findByText("模型已就绪");
  fireEvent.click(screen.getByRole("button", { name: "配置分类" }));
  expect(screen.getByLabelText("模板分类 1 名称")).toHaveValue("工作");
  const advancedSections = screen.getAllByText("高级设置");
  expect(advancedSections.length).toBeGreaterThanOrEqual(2);
});
