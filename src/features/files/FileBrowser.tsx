import { FileFilters } from "./FileFilters";
import { FileList } from "./FileList";
import { SearchBar } from "./SearchBar";
import type { ReturnTypeUseFiles } from "./useFiles";

export type FileBrowserState = ReturnTypeUseFiles;

export function FileBrowser({ state, changeNotice, watcherError, selectedPaths = new Set(), onToggleSelection = () => undefined }: { state: FileBrowserState; changeNotice: boolean; watcherError: string | null; selectedPaths?: Set<string>; onToggleSelection?: (path: string) => void }) {
  if (!state.result && state.loading) return <section aria-label="文件列表" className="file-browser-state">正在读取文件索引…</section>;
  return (
    <section aria-labelledby="file-list-title" className="file-browser-card">
      <div className="file-browser-head"><div><h2 id="file-list-title">索引文件</h2></div>{changeNotice && <span role="status" className="file-browser-notice">磁盘变化已同步</span>}</div>
      <SearchBar value={state.queryText} onChange={state.setQueryText} />
      <FileFilters filters={state.filters} onChange={state.updateFilters} sortBy={state.sortBy} onSort={state.updateSort} />
      {watcherError && <div role="alert" className="file-browser-alert is-warning">监听提示：{watcherError}</div>}
      {state.error && <div role="alert" className="file-browser-alert is-error">{state.error}</div>}
      {state.result && <><div className="file-browser-meta"><span>共 {state.result.total} 个条目</span>{state.loading && <span>更新中…</span>}</div>{state.result.entries.length ? <FileList entries={state.result.entries} selectedPaths={selectedPaths} onToggle={onToggleSelection} /> : <div className="file-browser-empty">没有匹配的文件</div>}<div className="file-browser-pagination"><span>第 {state.result.total_pages ? state.page : 0} / {state.result.total_pages} 页</span><div className="file-browser-page-actions"><button type="button" disabled={state.page <= 1 || state.loading} onClick={() => state.setPage((page) => page - 1)} className="prototype-button">上一页</button><button type="button" disabled={!state.result.total_pages || state.page >= state.result.total_pages || state.loading} onClick={() => state.setPage((page) => page + 1)} className="prototype-button">下一页</button></div></div></>}
    </section>
  );
}
