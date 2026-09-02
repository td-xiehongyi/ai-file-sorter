import { useState } from "react";

import type { OperationHistoryItem } from "../../types/operations";
import { PathDisplay } from "../../components/PathDisplay";

export function OperationHistoryView({ items, onUndo, onDelete, onRestore, onPurge, includeDeleted, onToggleDeleted, busy }: {
  items: OperationHistoryItem[];
  onUndo: (historyId: number) => void;
  onDelete: (historyId: number) => void;
  onRestore: (historyId: number) => void;
  onPurge: (historyId: number) => void;
  includeDeleted: boolean;
  onToggleDeleted: (include: boolean) => void;
  busy: boolean;
}) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  return (
    <section aria-label="操作历史" className="operation-history-view">
      <div className="operation-view-heading">
        <div>
          <span className="eyebrow">历史记录</span>
          <h2>操作历史与撤销</h2>
          <p>查看已执行的移动和重命名操作。</p>
        </div>
        <label className="operation-history-toggle"><input type="checkbox" checked={includeDeleted} onChange={(event) => onToggleDeleted(event.target.checked)} />显示已删除</label>
      </div>
      {!items.length && <p className="operation-empty">{includeDeleted ? "还没有实际执行记录。" : "暂无可显示的记录；可勾选“显示已删除”查看已归档记录。"}</p>}
      <div className="operation-history-list">
        {items.map((item) => (
          <article key={item.id} className={`operation-history-row${item.isDeleted ? " is-deleted" : ""}`}>
            <div className="operation-history-heading">
              <div className="operation-history-summary"><strong>{item.operation === "move" ? "移动" : "重命名"}</strong><span className={`operation-status is-${item.status}`}>{item.status === "succeeded" ? "成功" : item.status === "failed" ? "失败" : "未执行"}</span>{item.isDeleted && <span className="operation-secondary-status">已删除</span>}{item.undoStatus === "undone" && <span className="operation-secondary-status">已撤销</span>}</div>
              <div className="operation-history-actions">
                <div className="operation-history-menu">
                  <button type="button" disabled={busy} aria-haspopup="menu" aria-expanded={openMenuId === item.id} onClick={() => setOpenMenuId((current) => current === item.id ? null : item.id)} className="prototype-button">更多操作</button>
                  {openMenuId === item.id && <div role="menu" aria-label={`${item.operation === "move" ? "移动" : "重命名"}记录操作`} className="operation-history-menu-popover">
                    {item.undoStatus === "available" && <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); onUndo(item.id); }} className="operation-history-menu-item">撤销</button>}
                    {item.isDeleted && <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); onRestore(item.id); }} className="operation-history-menu-item">恢复记录</button>}
                    {!item.isDeleted && <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); onDelete(item.id); }} className="operation-history-menu-item">删除记录</button>}
                    {item.isDeleted && item.undoStatus !== "available" && <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); onPurge(item.id); }} className="operation-history-menu-item is-danger">永久删除</button>}
                  </div>}
                </div>
              </div>
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
