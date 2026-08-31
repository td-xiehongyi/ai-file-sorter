import { formatDisplayPath } from "../lib/path-display";

export function TopBar({
  rootPath,
  providerLabel,
}: {
  rootPath: string | null;
  providerLabel: string;
}) {
  const displayRootPath = rootPath ? formatDisplayPath(rootPath) : null;
  return (
    <header className="workspace-topbar">
      <div className="workspace-crumb" title={displayRootPath ?? undefined}>
        授权目录 <span aria-hidden="true">/</span> {displayRootPath ?? "未选择目录"}
      </div>
      <div className="workspace-provider" role="status">
        <span className="workspace-provider-dot" aria-hidden="true" />
        {providerLabel}
      </div>
    </header>
  );
}
