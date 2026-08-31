import type { OperationPreviewResponse } from "../../types/operations";
import { formatDisplayPath } from "../../lib/path-display";

export function OperationPreviewEmptyView({ onNavigate }: { onNavigate: () => void }) {
  return (
    <section aria-label="操作预览" className="operation-preview-view operation-preview-empty">
      <div className="operation-view-heading">
        <div>
          <span className="eyebrow">操作预览</span>
          <h2>没有待确认的操作计划</h2>
          <p>接受 AI 建议或提交手动操作后，计划会显示在这里。</p>
        </div>
      </div>
      <button type="button" onClick={onNavigate} className="prototype-button">返回 AI 建议审查</button>
    </section>
  );
}

export function OperationPreviewView({
  preview,
  onConfirm,
  onCancel,
  busy,
}: {
  preview: OperationPreviewResponse;
  onConfirm: (planId: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <section aria-label="操作预览" className="operation-preview-view">
      <div className="operation-view-heading">
        <div>
          <span className="eyebrow">操作预览</span>
          <h2>确认文件变更</h2>
          <p>执行前请核对每一条 From → To 路径。</p>
        </div>
        {preview.expiresAt && <span className="operation-expiry">计划有效期 10 分钟</span>}
      </div>
      <div className="operation-preview-list">
        {preview.items.map((item) => (
          <article key={item.index} className="operation-preview-row">
            <div className="operation-path-grid">
              <span title={formatDisplayPath(item.sourcePath)}>{formatDisplayPath(item.sourcePath)}</span>
              <span className="operation-arrow" aria-hidden="true">→</span>
              <span title={formatDisplayPath(item.targetPath)}>{formatDisplayPath(item.targetPath)}</span>
            </div>
            <div className="operation-row-status">
              {item.status === "valid" ? <span className="is-valid">校验通过</span> : <span className="is-invalid">{item.reason ?? "校验失败"}</span>}
              {item.willCreateDirectory && <span className="will-create">确认执行时将创建目标分类目录</span>}
            </div>
          </article>
        ))}
      </div>
      <div className="operation-preview-actions">
        <button type="button" onClick={onCancel} disabled={busy} className="prototype-button">取消计划</button>
        {preview.canConfirm && preview.planId && <button type="button" onClick={() => onConfirm(preview.planId!)} disabled={busy} className="prototype-button confirm">{busy ? "执行中…" : "确认并执行"}</button>}
      </div>
    </section>
  );
}
