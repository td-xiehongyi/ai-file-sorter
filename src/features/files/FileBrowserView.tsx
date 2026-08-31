import type { IndexStatus } from "../../types/files";
import { DirectoryPicker } from "./DirectoryPicker";
import { DirectoryStatus } from "./DirectoryStatus";
import { FileBrowser, type FileBrowserState } from "./FileBrowser";

export function FileBrowserView({
  state,
  rootPath,
  status,
  busy,
  changeNotice,
  watcherError,
  selectedPaths,
  onToggleSelection,
  onChooseDirectory,
  onRescan,
  onRebuild,
}: {
  state: FileBrowserState;
  rootPath: string | null;
  status: IndexStatus | null;
  busy: boolean;
  changeNotice: boolean;
  watcherError: string | null;
  selectedPaths: Set<string>;
  onToggleSelection: (path: string) => void;
  onChooseDirectory: () => void;
  onRescan: () => void;
  onRebuild: () => void;
}) {
  return (
    <section aria-labelledby="file-browser-view-title" className="file-browser-view">
      <div className="file-page-heading">
        <div>
          <h1 id="file-browser-view-title">文件浏览</h1>
          <p>查看本地索引，筛选文件并选择下一步操作。</p>
        </div>
        <div className="file-page-actions">
          <button type="button" disabled={!rootPath || busy} onClick={onRescan} className="prototype-button">重新扫描</button>
          <button type="button" disabled={busy} onClick={onRebuild} className="prototype-button">重建索引</button>
          <DirectoryPicker onChoose={onChooseDirectory} disabled={busy} label={rootPath ? "选择其他目录" : "选择扫描目录"} />
        </div>
      </div>
      <DirectoryStatus rootPath={rootPath} status={status} />
      <FileBrowser
        state={state}
        changeNotice={changeNotice}
        watcherError={watcherError}
        selectedPaths={selectedPaths}
        onToggleSelection={onToggleSelection}
      />
    </section>
  );
}
