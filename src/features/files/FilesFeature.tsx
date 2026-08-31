import { useEffect, useMemo, useState } from "react";

import { chooseDirectory, chooseTargetDirectory, getIndexStatus, listenForScanProgress, rebuildIndex, restoreRecentIndex, scanDirectory } from "../../lib/files-api";
import { cancelOperationPlan, executeOperationPlan, getOperationHistory, previewOperations, undoOperation } from "../../lib/operations-api";
import { listenForIndexChanges, listenForWatcherErrors } from "../../lib/search-api";
import type { IndexStatus, ScanProgress, ScanSummary } from "../../types/files";
import type { OperationBatchResult, OperationDraft, OperationHistoryItem, OperationPreviewResponse } from "../../types/operations";
import { FileBrowserView } from "./FileBrowserView";
import { ScanProgress as ScanProgressView } from "./ScanProgress";
import { ScanSummary as ScanSummaryView } from "./ScanSummary";
import { useFiles } from "./useFiles";
import { OperationHistory } from "../operations/OperationHistory";
import { OperationPanel } from "../operations/OperationPanel";
import { OperationPreview } from "../operations/OperationPreview";
import { AiPanel } from "../ai/AiPanel";

type WorkspaceView = "files" | "ai" | "preview" | "history" | "settings";

export function FilesFeature({ activeView = "files" }: { activeView?: WorkspaceView }) {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changeNotice, setChangeNotice] = useState(false);
  const [watcherError, setWatcherError] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [operationPreview, setOperationPreview] = useState<OperationPreviewResponse | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationResult, setOperationResult] = useState<OperationBatchResult | null>(null);
  const [history, setHistory] = useState<OperationHistoryItem[]>([]);
  const browserState = useFiles(rootPath);
  const selectedEntries = useMemo(
    () => browserState.result?.entries.filter((entry) => selectedPaths.has(entry.normalized_path) && entry.kind === "file") ?? [],
    [browserState.result, selectedPaths],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenForScanProgress(setProgress).then((cleanup) => { unlisten = cleanup; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void restoreRecentIndex()
      .then((restored) => {
        if (!cancelled && restored) {
          setRootPath(restored.root_path);
          setStatus(restored);
        }
      })
      .catch((cause) => {
        if (!cancelled) showError(cause);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let unlistenChange: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    void listenForIndexChanges(() => {
      setChangeNotice(true);
      void browserState.reload();
      window.setTimeout(() => setChangeNotice(false), 2500);
    }).then((cleanup) => { unlistenChange = cleanup; });
    void listenForWatcherErrors(setWatcherError).then((cleanup) => { unlistenError = cleanup; });
    return () => { unlistenChange?.(); unlistenError?.(); };
  }, [browserState.reload]);

  useEffect(() => {
    setSelectedPaths(new Set());
    setOperationPreview(null);
    setOperationResult(null);
  }, [rootPath, browserState.page, browserState.queryText, browserState.sortBy, browserState.sortDirection, browserState.filters]);

  useEffect(() => {
    if (!rootPath) {
      setHistory([]);
      return;
    }
    void refreshHistory();
  }, [rootPath]);

  function showError(cause: unknown) {
    setError(cause instanceof Error ? cause.message : "扫描失败，请检查目录权限后重试。");
    setProgress((current) => current ? { ...current, phase: "failed" } : null);
  }

  async function scanSelectedDirectory(selected: string, mode: "incremental" | "rebuild" = "incremental") {
    setError(null);
    setRootPath(selected);
    setSummary(null);
    setWatcherError(null);
    setBusy(true);
    try {
      const result = await scanDirectory(selected, mode);
      setSummary(result);
      setStatus({ root_path: result.root_path, indexed_entries: result.indexed_files + result.indexed_directories + result.indexed_links, last_scan_at: result.completed_at, state: "ready" });
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function chooseAndScan() {
    setError(null);
    try {
      const selected = await chooseDirectory();
      if (selected) await scanSelectedDirectory(selected);
    } catch (cause) {
      showError(cause);
    }
  }

  async function rescanCurrentDirectory() {
    if (rootPath) await scanSelectedDirectory(rootPath);
  }

  async function refreshStatus() {
    if (!rootPath) return;
    setStatus(await getIndexStatus(rootPath));
  }

  async function rebuildCurrentIndex() {
    setError(null);
    try {
      await rebuildIndex();
      await Promise.all([refreshStatus(), browserState.reload()]);
    } catch (cause) {
      showError(cause);
    }
  }

  function toggleSelection(path: string) {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function handlePreview(draft: OperationDraft) {
    setOperationError(null);
    setOperationResult(null);
    setOperationBusy(true);
    try {
      const preview = await previewOperations(draft);
      setOperationPreview(preview);
      return preview;
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : "无法生成操作预览。");
    } finally {
      setOperationBusy(false);
    }
    throw new Error("无法生成操作预览。");
  }

  async function handleCancelPreview() {
    if (operationPreview?.planId) {
      try {
        await cancelOperationPlan(operationPreview.planId);
      } catch (cause) {
        setOperationError(cause instanceof Error ? cause.message : "无法取消操作计划。");
      }
    }
    setOperationPreview(null);
  }

  async function handleExecute(planId: string) {
    setOperationError(null);
    setOperationBusy(true);
    try {
      setOperationResult(await executeOperationPlan(planId));
      setOperationPreview(null);
      setSelectedPaths(new Set());
      await Promise.all([browserState.reload(), refreshHistory()]);
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : "操作执行失败。");
    } finally {
      setOperationBusy(false);
    }
  }

  async function refreshHistory() {
    try {
      setHistory(await getOperationHistory());
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : "无法读取操作历史。");
    }
  }

  async function handleUndo(historyId: number) {
    setOperationError(null);
    setOperationBusy(true);
    try {
      await undoOperation(historyId);
      await Promise.all([browserState.reload(), refreshHistory()]);
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : "撤销失败。");
    } finally {
      setOperationBusy(false);
    }
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10 sm:px-10 lg:px-14">
      <div className="mt-6 space-y-4">
        {error && <div role="alert" className="system-feedback is-error">{error}</div>}
        <ScanProgressView progress={progress} />
        {summary && <ScanSummaryView summary={summary} />}
        {operationError && <div role="alert" className="system-feedback is-error">{operationError}</div>}
        {activeView !== "ai" && activeView !== "settings" && <FileBrowserView
          state={browserState}
          rootPath={rootPath}
          status={status}
          busy={busy}
          changeNotice={changeNotice}
          watcherError={watcherError}
          selectedPaths={selectedPaths}
          onToggleSelection={toggleSelection}
          onChooseDirectory={() => void chooseAndScan()}
          onRescan={() => void rescanCurrentDirectory()}
          onRebuild={() => void rebuildCurrentIndex()}
        />}
        {rootPath && <AiPanel activeView={activeView === "settings" ? "settings" : "ai"} rootPath={rootPath} selectedEntries={selectedEntries} onPreview={handlePreview} onChooseDirectory={chooseTargetDirectory} />}
        {activeView !== "settings" && rootPath && <OperationPanel rootPath={rootPath} selectedEntries={selectedEntries} onPreview={handlePreview} busy={operationBusy} onChooseTargetDirectory={chooseTargetDirectory} />}
        {operationPreview && <OperationPreview preview={operationPreview} onConfirm={(planId) => void handleExecute(planId)} onCancel={() => void handleCancelPreview()} busy={operationBusy} />}
        {operationResult && <div role="status" className="system-feedback is-success">批次完成：{operationResult.items.filter((item) => item.status === "succeeded").length} 项成功，{operationResult.items.filter((item) => item.status === "failed").length} 项失败，{operationResult.items.filter((item) => item.status === "not_executed").length} 项未执行。</div>}
        {activeView !== "settings" && rootPath && <OperationHistory items={history} onUndo={(historyId) => void handleUndo(historyId)} busy={operationBusy} />}
      </div>
    </section>
  );
}
