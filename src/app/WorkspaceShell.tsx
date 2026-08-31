import type { ReactNode } from "react";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export type WorkspaceView = "files" | "ai" | "preview" | "history" | "settings";

export function WorkspaceShell({
  activeView,
  onNavigate,
  rootPath,
  providerLabel,
  children,
}: {
  activeView: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  rootPath: string | null;
  providerLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="workspace-shell">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <div className="workspace-main">
        <TopBar rootPath={rootPath} providerLabel={providerLabel} />
        <div className="workspace-content">{children}</div>
      </div>
    </div>
  );
}
