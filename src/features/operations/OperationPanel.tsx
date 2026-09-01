import { useEffect, useState } from "react";

import type { SearchEntry } from "../../types/search";
import type { OperationDraft } from "../../types/operations";

function splitFilename(name: string) {
  const extensionStart = name.lastIndexOf(".");
  if (extensionStart <= 0) return { stem: name, extension: "" };
  return { stem: name.slice(0, extensionStart), extension: name.slice(extensionStart) };
}

function isInvalidFilenameBody(name: string) {
  return /[\\/:*?"<>|]/.test(name);
}

export function OperationPanel({
  rootPath,
  selectedEntries,
  onPreview,
  busy,
  onChooseTargetDirectory,
}: {
  rootPath: string;
  selectedEntries: SearchEntry[];
  onPreview: (draft: OperationDraft) => void;
  busy: boolean;
  onChooseTargetDirectory?: () => Promise<string | null>;
}) {
  const [mode, setMode] = useState<"move" | "rename">("move");
  const [destinationDirectory, setDestinationDirectory] = useState("");
  const [newNameBodies, setNewNameBodies] = useState<Record<string, string>>({});

  useEffect(() => {
    setNewNameBodies(Object.fromEntries(selectedEntries.map((entry) => [entry.normalized_path, splitFilename(entry.name).stem])));
  }, [selectedEntries]);

  if (!selectedEntries.length) return null;

  async function chooseTarget() {
    const selected = await onChooseTargetDirectory?.();
    if (selected) setDestinationDirectory(selected);
  }

  const renameRows = selectedEntries.map((entry) => {
    const { stem, extension } = splitFilename(entry.name);
    const newNameBody = newNameBodies[entry.normalized_path] ?? stem;
    const trimmedBody = newNameBody.trim();
    const unchanged = trimmedBody === stem;
    return { entry, stem, extension, newNameBody, trimmedBody, unchanged };
  });
  const changedRenameRows = renameRows.filter((row) => !row.unchanged);
  const duplicateBodies = new Set(
    changedRenameRows
      .map((row) => `${row.trimmedBody}${row.extension}`.toLowerCase())
      .filter((name, index, names) => names.indexOf(name) !== index),
  );
  const renameErrors = new Map<string, string>();
  for (const row of changedRenameRows) {
    if (!row.trimmedBody) {
      renameErrors.set(row.entry.normalized_path, "新文件名不能为空");
    } else if (isInvalidFilenameBody(row.trimmedBody)) {
      renameErrors.set(row.entry.normalized_path, "新文件名包含非法字符");
    } else if (duplicateBodies.has(`${row.trimmedBody}${row.extension}`.toLowerCase())) {
      renameErrors.set(row.entry.normalized_path, "生成的新名称重复");
    }
  }
  const renameItems = changedRenameRows.map((row) => ({
    operation: "rename" as const,
    source_path: row.entry.normalized_path,
    new_name: `${row.trimmedBody}${row.extension}`,
  }));
  const canSubmitRename = renameItems.length > 0 && renameErrors.size === 0;

  function submit() {
    if (mode === "move" && destinationDirectory.trim()) {
      onPreview({
        root_path: rootPath,
        items: selectedEntries.map((entry) => ({
          operation: "move",
          source_path: entry.normalized_path,
          destination_directory: destinationDirectory.trim(),
        })),
      });
    }
    if (mode === "rename" && canSubmitRename) {
      onPreview({
        root_path: rootPath,
        items: renameItems,
      });
    }
  }

  return (
    <section aria-label="文件操作" className="operation-panel">
      <div className="operation-panel-heading"><div><span className="eyebrow">手动操作</span><h2>已选择 {selectedEntries.length} 个普通文件</h2></div><div className="operation-mode-switch"><button type="button" onClick={() => setMode("move")} className={`prototype-button${mode === "move" ? " active" : ""}`}>批量移动</button><button type="button" onClick={() => setMode("rename")} className={`prototype-button${mode === "rename" ? " active" : ""}`}>{selectedEntries.length > 1 ? "批量重命名" : "重命名"}</button></div></div>
      {mode === "move" ? <div className="operation-input-row"><input aria-label="移动到目录" value={destinationDirectory} onChange={(event) => setDestinationDirectory(event.target.value)} placeholder="输入当前授权目录内的目标目录" className="prototype-field" />{onChooseTargetDirectory && <button type="button" onClick={() => void chooseTarget()} className="prototype-button">选择目录</button>}</div> : <div className="operation-rename-list" aria-label="批量重命名列表">{renameRows.map((row) => { const error = renameErrors.get(row.entry.normalized_path); return <div key={row.entry.normalized_path} className={`operation-rename-row${error ? " has-error" : ""}`}><div className="operation-rename-source"><span className="operation-rename-label">原名称</span><strong title={row.entry.name}>{row.entry.name}</strong></div><label className="operation-rename-input"><span className="operation-rename-label">新文件名</span><span className="operation-rename-input-control"><input aria-label={`新文件名 ${row.entry.name}`} value={row.newNameBody} onChange={(event) => setNewNameBodies((current) => ({ ...current, [row.entry.normalized_path]: event.target.value }))} className="prototype-field" /><span className="operation-rename-extension">{row.extension || "无扩展名"}</span></span></label>{error ? <span className="operation-rename-error" role="alert">{error}</span> : row.unchanged ? <span className="operation-rename-unchanged">保持原名</span> : <span className="operation-rename-unchanged">将执行重命名</span>}</div>; })}</div>}
      <div className="operation-panel-actions"><button type="button" onClick={submit} disabled={busy || (mode === "move" ? !destinationDirectory.trim() : !canSubmitRename)} className="prototype-button primary">生成预览</button></div>
    </section>
  );
}
