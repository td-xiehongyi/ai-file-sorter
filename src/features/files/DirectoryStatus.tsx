import type { IndexStatus } from "../../types/files";
import { formatDisplayPath } from "../../lib/path-display";

export function DirectoryStatus({
  rootPath,
  status,
}: {
  rootPath: string | null;
  status: IndexStatus | null;
}) {
  const indexedEntries = status?.indexed_entries ?? 0;
  const isReady = status?.state === "ready";
  const displayRootPath = rootPath ? formatDisplayPath(rootPath) : null;

  return (
    <div className="directory-status-grid">
      <div className="directory-status-card">
        <span className="directory-status-label">当前授权目录</span>
        <span className="directory-status-value" title={displayRootPath ?? undefined}>{displayRootPath ?? "尚未选择目录"}</span>
      </div>
      <div className="directory-status-card">
        <span className="directory-status-label">索引状态</span>
        <span className={`directory-status-value${isReady ? " is-ready" : ""}`}>
          {isReady ? `已索引 ${indexedEntries} 个条目` : "等待扫描"}
        </span>
      </div>
    </div>
  );
}
