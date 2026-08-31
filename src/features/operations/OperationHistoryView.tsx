import type { OperationHistoryItem } from "../../types/operations";
import { PathDisplay } from "../../components/PathDisplay";

export function OperationHistoryView({
  items,
  onUndo,
  busy,
}: {
  items: OperationHistoryItem[];
  onUndo: (historyId: number) => void;
  busy: boolean;
}) {
  return (
    <section aria-label="操作历史" className="operation-history-view">
      <div className="operation-view-heading">
        <div>
          <span className="eyebrow">历史记录</span>
          <h2>操作历史与撤销</h2>
          <p>查看已执行的移动和重命名操作。</p>
        </div>
      </div>
      {!items.length && <p className="operation-empty">还没有实际执行记录。</p>}
      <div className="operation-history-list">
        {items.map((item) => (
          <article key={item.id} className="operation-history-row">
            <div className="operation-history-heading">
              <div><strong>{item.operation === "move" ? "移动" : "重命名"}</strong><span className={`operation-status is-${item.status}`}>{item.status === "succeeded" ? "成功" : item.status === "failed" ? "失败" : "未执行"}</span></div>
              {item.undoStatus === "available" && <button type="button" disabled={busy} onClick={() => onUndo(item.id)} className="prototype-button">撤销</button>}
              {item.undoStatus === "undone" && <span className="operation-secondary-status">已撤销</span>}
            </div>
            <div className="operation-history-paths"><span><strong>From：</strong><PathDisplay path={item.sourcePath} /></span><span><strong>To：</strong><PathDisplay path={item.targetPath} /></span></div>
            {item.reason && <p className="operation-history-reason">{item.reason}</p>}
            {item.undoStatus === "unavailable" && item.undoReason && <p className="operation-history-unavailable">撤销不可用：{item.undoReason}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
