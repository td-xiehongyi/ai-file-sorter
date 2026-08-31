import type { OperationPreviewResponse } from "../../types/operations";

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
              <span title={item.sourcePath}>{item.sourcePath}</span>
              <span className="operation-arrow" aria-hidden="true">→</span>
              <span title={item.targetPath}>{item.targetPath}</span>
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
