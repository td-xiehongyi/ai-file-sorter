import { useState } from "react";

import { FilesFeature } from "../features/files/FilesFeature";
import { WorkspaceShell, type WorkspaceView } from "./WorkspaceShell";

export function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>("files");

  return (
    <main aria-label="ai-file-sorter" data-ui-theme="light" data-active-view={activeView} className="app-root">
      <WorkspaceShell
        activeView={activeView}
        onNavigate={setActiveView}
        rootPath={null}
        providerLabel="本地 AI 状态"
      >
        <FilesFeature activeView={activeView} onNavigate={setActiveView} />
      </WorkspaceShell>
    </main>
  );
}
