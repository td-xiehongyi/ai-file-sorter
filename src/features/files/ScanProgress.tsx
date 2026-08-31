import type { ScanProgress as ScanProgressData } from "../../types/files";

type Props = { progress: ScanProgressData | null };

export function ScanProgress({ progress }: Props) {
  if (!progress) return null;
  const phaseLabel = { scanning: "正在扫描", persisting: "正在保存索引", completed: "扫描完成", failed: "扫描失败" }[progress.phase];
  return (
    <section aria-label="扫描进度" className="scan-progress">
      <div className="scan-progress-heading">
        <h2>{phaseLabel}</h2>
        <span>{progress.visitedEntries} 个条目</span>
      </div>
      <div className="scan-progress-track">
        <div className="scan-progress-fill" />
      </div>
      <div className="scan-progress-meta">
        <span>已索引 {progress.indexedEntries}</span>
        <span>错误 {progress.errorCount}</span>
        <span className="truncate" title={progress.currentPath ?? undefined}>{progress.currentPath ?? "准备中"}</span>
      </div>
    </section>
  );
}
