import type { SearchEntry } from "../../types/search";
import { formatDisplayPath } from "../../lib/path-display";

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileList({ entries, selectedPaths, onToggle }: { entries: SearchEntry[]; selectedPaths: Set<string>; onToggle: (path: string) => void }) {
  return (
    <div className="file-table-wrap">
      <table className="file-table">
        <thead><tr><th scope="col" className="file-table-select">选择</th><th scope="col">名称</th><th scope="col">路径</th><th scope="col">类型</th><th scope="col">大小</th><th scope="col">修改时间</th></tr></thead>
        <tbody>{entries.map((entry) => { const selectable = entry.kind === "file"; const selected = selectable && selectedPaths.has(entry.normalized_path); const displayPath = formatDisplayPath(entry.normalized_path); return <tr key={entry.id} className={selected ? "is-selected" : undefined}><td className="file-table-select"><input aria-label={`选择 ${entry.name}`} type="checkbox" disabled={!selectable} checked={selected} onChange={() => onToggle(entry.normalized_path)} /></td><td className="file-name" title={entry.name}>{entry.name}</td><td className="file-path" title={displayPath}>{displayPath}</td><td>{entry.extension ? `.${entry.extension}` : entry.kind}</td><td className="file-size">{formatSize(entry.size)}</td><td>{entry.modified_ms ? new Date(entry.modified_ms).toLocaleString() : "—"}</td></tr>; })}</tbody>
      </table>
    </div>
  );
}
