import { useEffect, useState } from "react";

import type { SearchEntry } from "../../types/search";
import type { OperationDraft } from "../../types/operations";

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
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setNewName(selectedEntries[0]?.name ?? "");
  }, [selectedEntries]);

  if (!selectedEntries.length) return null;

  async function chooseTarget() {
    const selected = await onChooseTargetDirectory?.();
    if (selected) setDestinationDirectory(selected);
  }

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
    if (mode === "rename" && selectedEntries.length === 1 && newName.trim()) {
      onPreview({
        root_path: rootPath,
        items: [{ operation: "rename", source_path: selectedEntries[0].normalized_path, new_name: newName.trim() }],
      });
    }
  }

  return (
    <section aria-label="文件操作" className="operation-panel">
      <div className="operation-panel-heading"><div><span className="eyebrow">手动操作</span><h2>已选择 {selectedEntries.length} 个普通文件</h2></div><div className="operation-mode-switch"><button type="button" onClick={() => setMode("move")} className={`prototype-button${mode === "move" ? " active" : ""}`}>批量移动</button><button type="button" disabled={selectedEntries.length !== 1} onClick={() => setMode("rename")} className={`prototype-button${mode === "rename" ? " active" : ""}`}>重命名</button></div></div>
      {mode === "move" ? <div className="operation-input-row"><input aria-label="移动到目录" value={destinationDirectory} onChange={(event) => setDestinationDirectory(event.target.value)} placeholder="输入当前授权目录内的目标目录" className="prototype-field" />{onChooseTargetDirectory && <button type="button" onClick={() => void chooseTarget()} className="prototype-button">选择目录</button>}</div> : <input aria-label="新文件名" value={newName} onChange={(event) => setNewName(event.target.value)} className="prototype-field" />}
      {mode === "rename" && selectedEntries.length !== 1 && <p className="operation-hint">重命名一次只能处理一个文件。</p>}
      <div className="operation-panel-actions"><button type="button" onClick={submit} disabled={busy || (mode === "move" ? !destinationDirectory.trim() : selectedEntries.length !== 1 || !newName.trim())} className="prototype-button primary">生成预览</button></div>
    </section>
  );
}
