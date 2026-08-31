import type { ScanSummary as ScanSummaryData } from "../../types/files";

export function ScanSummary({ summary }: { summary: ScanSummaryData }) {
  const items = [
    ["文件", summary.indexed_files],
    ["目录", summary.indexed_directories],
    ["链接", summary.indexed_links],
    ["新增", summary.added],
    ["更新", summary.updated],
    ["移除", summary.removed],
    ["忽略", summary.ignored],
    ["错误", summary.errors],
  ] as const;
  return (
    <section aria-label="扫描结果摘要" className="scan-summary">
      <div className="scan-summary-heading">
        <div>
          <h2>索引已更新</h2>
        </div>
        <span>模式：{summary.mode === "rebuild" ? "重建" : "增量扫描"}</span>
      </div>
      <div className="scan-summary-grid">
        {items.map(([label, value]) => <div className="scan-summary-item" key={label}><div>{label}</div><strong>{value}</strong></div>)}
      </div>
    </section>
  );
}
