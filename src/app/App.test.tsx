import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const api = vi.hoisted(() => ({
  chooseDirectory: vi.fn(),
  chooseTargetDirectory: vi.fn(),
  getIndexStatus: vi.fn(),
  listenForScanProgress: vi.fn(),
  rebuildIndex: vi.fn(),
  restoreRecentIndex: vi.fn(),
  scanDirectory: vi.fn(),
}));

const searchApi = vi.hoisted(() => ({
  listenForIndexChanges: vi.fn(),
  listenForWatcherErrors: vi.fn(),
  searchFiles: vi.fn(),
}));

const operationsApi = vi.hoisted(() => ({
  cancelOperationPlan: vi.fn(),
  executeOperationPlan: vi.fn(),
  getOperationHistory: vi.fn(),
  previewOperations: vi.fn(),
  undoOperation: vi.fn(),
}));

const aiApi = vi.hoisted(() => ({
  getAiCategoryTemplates: vi.fn(),
  cancelAnalysisBatch: vi.fn(),
  getAiCategories: vi.fn(),
  getAiProviderStatus: vi.fn(),
  getAnalysisBatch: vi.fn(),
  getAnalysisResults: vi.fn(),
  listenForAnalysisProgress: vi.fn(),
  renameAiCategoryTemplate: vi.fn(),
  reviewAnalysisResult: vi.fn(),
  saveAiCategories: vi.fn(),
  saveAiCategoryTemplate: vi.fn(),
  setGlobalAiCategoryTemplate: vi.fn(),
  startAnalysisBatch: vi.fn(),
}));

vi.mock("../lib/files-api", () => api);
vi.mock("../lib/search-api", () => searchApi);
vi.mock("../lib/operations-api", () => operationsApi);
vi.mock("../lib/ai-api", () => aiApi);

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listenForScanProgress.mockResolvedValue(() => undefined);
    api.chooseDirectory.mockResolvedValue("C:/Documents");
    api.chooseTargetDirectory.mockResolvedValue("C:/Documents/archive");
    api.scanDirectory.mockResolvedValue({ root_path: "C:/Documents", mode: "incremental", indexed_files: 3, indexed_directories: 1, indexed_links: 1, added: 5, updated: 0, removed: 0, ignored: 2, errors: 0, completed_at: "now" });
    api.rebuildIndex.mockResolvedValue(undefined);
    api.restoreRecentIndex.mockResolvedValue(null);
    api.getIndexStatus.mockResolvedValue({ root_path: "C:/Documents", indexed_entries: 0, last_scan_at: "now", state: "empty" });
    searchApi.listenForIndexChanges.mockResolvedValue(() => undefined);
    searchApi.listenForWatcherErrors.mockResolvedValue(() => undefined);
    searchApi.searchFiles.mockResolvedValue({ entries: [], total: 0, page: 1, page_size: 50, total_pages: 0 });
    operationsApi.getOperationHistory.mockResolvedValue([]);
    operationsApi.cancelOperationPlan.mockResolvedValue(undefined);
    operationsApi.executeOperationPlan.mockResolvedValue({ batchId: "batch", items: [] });
    operationsApi.previewOperations.mockResolvedValue({ canConfirm: false, planId: null, expiresAt: null, items: [] });
    operationsApi.undoOperation.mockResolvedValue({});
    aiApi.getAiProviderStatus.mockResolvedValue({ available: true, provider: "ollama", model: "qwen2.5:7b", message: "模型已就绪" });
    aiApi.getAiCategories.mockResolvedValue([{ id: "work", name: "工作", description: "", directory_path: "C:/Documents/work", enabled: true }]);
    aiApi.getAiCategoryTemplates.mockResolvedValue([]);
    aiApi.saveAiCategoryTemplate.mockResolvedValue({ id: "template", name: "模板", version: 1, is_global: false, categories: [{ id: "work", name: "工作", description: "", default_enabled: true }] });
    aiApi.listenForAnalysisProgress.mockResolvedValue(() => undefined);
    aiApi.getAnalysisResults.mockResolvedValue([]);
    aiApi.cancelAnalysisBatch.mockResolvedValue(undefined);
    aiApi.saveAiCategories.mockResolvedValue([]);
  });

  it("offers native directory selection and phase two index status", () => {
    render(<App />);
    expect(screen.getByRole("main", { name: "ai-file-sorter" })).toHaveAttribute("data-ui-theme", "light");
    expect(screen.getAllByText("ai-file-sorter")).not.toHaveLength(0);
    expect(screen.queryByText("AI File Organizer")).not.toBeInTheDocument();
    expect(screen.queryByText("阶段五开发版")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择扫描目录" })).toBeInTheDocument();
    expect(screen.getByText("等待扫描")).toBeInTheDocument();
  });

  it("renders the prototype workspace shell and marks the file view active", () => {
    render(<App />);

    expect(screen.getByRole("navigation", { name: "工作区" })).toBeInTheDocument();
    for (const label of ["文件浏览", "AI 建议审查", "操作预览", "历史与撤销", "模型与分类设置"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "文件浏览" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main", { name: "ai-file-sorter" })).toHaveAttribute("data-active-view", "files");
    expect(screen.getByRole("status")).toHaveTextContent("本地 AI 状态");
    expect(screen.getByRole("banner")).toHaveTextContent("授权目录");
  });

  it("updates the active navigation view without changing the business controller", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "模型与分类设置" }));

    expect(screen.getByRole("button", { name: "模型与分类设置" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "文件浏览" })).not.toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main", { name: "ai-file-sorter" })).toHaveAttribute("data-active-view", "settings");
  });

  it("opens template settings from the workspace navigation after authorization", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "选择扫描目录" }));
    await waitFor(() => expect(screen.getByText("C:/Documents")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "模型与分类设置" }));
    expect(await screen.findByRole("heading", { name: "分类模板" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "应用模板" })).not.toBeInTheDocument();
  });

  it("keeps navigation and directory actions keyboard-focusable", () => {
    render(<App />);

    const navigation = screen.getByRole("button", { name: "文件浏览" });
    navigation.focus();
    expect(document.activeElement).toBe(navigation);

    const chooseDirectory = screen.getByRole("button", { name: "选择扫描目录" });
    chooseDirectory.focus();
    expect(document.activeElement).toBe(chooseDirectory);
    expect(chooseDirectory).not.toBeDisabled();
  });

  it("shows the local AI suggestion panel after a directory is authorized", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "选择扫描目录" }));
    expect(await screen.findByRole("heading", { name: "本地内容分析与整理建议" })).toBeInTheDocument();
    expect(await screen.findByText("模型已就绪")).toBeInTheDocument();
  });

  it("restores the most recent persisted index after restart", async () => {
    api.restoreRecentIndex.mockResolvedValue({ root_path: "D:/Archive", indexed_entries: 1, last_scan_at: "20", state: "ready" });
    searchApi.searchFiles.mockResolvedValue({ entries: [{ id: 1, normalized_path: "D:/Archive/saved.txt", name: "saved.txt", extension: "txt", kind: "file", size: 1, modified_ms: 1 }], total: 1, page: 1, page_size: 50, total_pages: 1 });
    render(<App />);
    expect(await screen.findByText("D:/Archive")).toBeInTheDocument();
    expect(await screen.findByText("saved.txt")).toBeInTheDocument();
    expect(screen.getByText("已索引 1 个条目")).toBeInTheDocument();
  });

  it("shows the scan summary after a directory is selected", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "选择扫描目录" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "索引已更新" })).toBeInTheDocument());
    expect(screen.getByText("C:/Documents")).toBeInTheDocument();
    expect(screen.getByText("已索引 5 个条目")).toBeInTheDocument();
    expect(screen.getByText("目录")).toBeInTheDocument();
    expect(screen.getByText("忽略")).toBeInTheDocument();
  });

  it("opens the directory picker again when selecting another directory", async () => {
    api.chooseDirectory.mockResolvedValueOnce("C:/Documents").mockResolvedValueOnce("D:/Archive");

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "选择扫描目录" }));
    await waitFor(() => expect(screen.getByText("C:/Documents")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "选择其他目录" }));
    await waitFor(() => expect(screen.getByText("D:/Archive")).toBeInTheDocument());
    expect(api.chooseDirectory).toHaveBeenCalledTimes(2);
    expect(api.scanDirectory).toHaveBeenCalledTimes(2);
  });

  it("rescans the current directory without reopening the picker", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "选择扫描目录" }));
    await waitFor(() => expect(screen.getByText("C:/Documents")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "重新扫描" }));
    await waitFor(() => expect(api.scanDirectory).toHaveBeenCalledTimes(2));
    expect(api.chooseDirectory).toHaveBeenCalledTimes(1);
  });

  it("shows an error when directory selection fails", async () => {
    api.chooseDirectory.mockRejectedValueOnce(new Error("dialog unavailable"));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "选择扫描目录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("dialog unavailable");
  });

  it("clears visible file results after rebuilding the index", async () => {
    searchApi.searchFiles
      .mockResolvedValueOnce({ entries: [{ id: 1, normalized_path: "C:/Documents/report.txt", name: "report.txt", extension: "txt", kind: "file", size: 10, modified_ms: 1 }], total: 1, page: 1, page_size: 50, total_pages: 1 })
      .mockResolvedValue({ entries: [], total: 0, page: 1, page_size: 50, total_pages: 0 });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "选择扫描目录" }));
    expect(await screen.findByText("report.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重建索引" }));
    await waitFor(() => expect(screen.queryByText("report.txt")).not.toBeInTheDocument());
    expect(screen.getByText("没有匹配的文件")).toBeInTheDocument();
  });

  it("does not expose operation controls before a directory is selected", () => {
    render(<App />);
    for (const action of ["批量移动", "重命名", "删除", "AI 执行"]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
  });
});
