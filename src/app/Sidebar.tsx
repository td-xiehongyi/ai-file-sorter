import type { WorkspaceView } from "./WorkspaceShell";

const items: Array<{ view: WorkspaceView; icon: string; label: string }> = [
  { view: "files", icon: "▤", label: "文件浏览" },
  { view: "ai", icon: "✦", label: "AI 建议审查" },
  { view: "preview", icon: "⇄", label: "操作预览" },
  { view: "history", icon: "↶", label: "历史与撤销" },
  { view: "settings", icon: "⚙", label: "模型与分类设置" },
];

export function Sidebar({
  activeView,
  onNavigate,
}: {
  activeView: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
}) {
  return (
    <aside className="workspace-sidebar">
      <div className="workspace-brand">
        <span className="workspace-brand-mark" aria-hidden="true">AF</span>
        <div className="workspace-brand-copy">
          <span className="workspace-brand-name">ai-file-sorter</span>
          <span className="workspace-brand-subtitle">LOCAL FILE ORGANIZER</span>
        </div>
      </div>

      <div className="workspace-nav-label">工作区</div>
      <nav aria-label="工作区" className="workspace-nav">
        {items.map((item) => (
          <button
            key={item.view}
            type="button"
            className={`workspace-nav-item${activeView === item.view ? " is-active" : ""}`}
            aria-current={activeView === item.view ? "page" : undefined}
            onClick={() => onNavigate(item.view)}
          >
            <span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="workspace-nav-text">{item.label}</span>
          </button>
        ))}
      </nav>

      <p className="workspace-safety-note">文件写入前始终展示预览，并要求明确确认。</p>
    </aside>
  );
}
