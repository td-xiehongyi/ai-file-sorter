import type { Dispatch, SetStateAction } from "react";

import type {
  AiAnalysisResult,
  AiCategory,
  AiCategoryTemplate,
  AnalysisCategorySource,
  AnalysisProgress,
  ProviderStatus,
} from "../../types/ai";
import type { SearchEntry } from "../../types/search";
import { AnalysisSetupBar } from "./AnalysisSetupBar";

type Props = {
  selectedEntries: SearchEntry[];
  supportedFiles: SearchEntry[];
  model: string;
  setModel: Dispatch<SetStateAction<string>>;
  provider: ProviderStatus | null;
  onRefreshProvider: () => void;
  templates: AiCategoryTemplate[];
  analysisSource: AnalysisCategorySource | null;
  onChooseAnalysisSource: (value: string) => void;
  onOpenSettings: () => void;
  showConfigureAction: boolean;
  analysisBlockedReason: string | null;
  busy: boolean;
  batchId: string | null;
  cancelRequested: boolean;
  onStart: () => void;
  onCancel: () => void;
  progress: AnalysisProgress | null;
  error: string | null;
  results: AiAnalysisResult[];
  edits: Record<string, { filename: string; categoryId: string }>;
  categories: AiCategory[];
  onEdit: (id: string, edit: { filename: string; categoryId: string }) => void;
  onReview: (item: AiAnalysisResult, action: "accept" | "reject") => void;
};

export function AiReviewView({
  selectedEntries,
  supportedFiles,
  model,
  setModel,
  provider,
  onRefreshProvider,
  templates,
  analysisSource,
  onChooseAnalysisSource,
  onOpenSettings,
  showConfigureAction,
  analysisBlockedReason,
  busy,
  batchId,
  cancelRequested,
  onStart,
  onCancel,
  progress,
  error,
  results,
  edits,
  categories,
  onEdit,
  onReview,
}: Props) {
  return (
    <section aria-labelledby="ai-panel-title" className="ai-panel ai-review-view">
      <div className="ai-view-heading">
        <div>
          <span className="eyebrow">AI 建议审查</span>
          <h2 id="ai-panel-title">本地内容分析与整理建议</h2>
          <p>选择分类方案后，AI 会生成可审查的整理建议。</p>
        </div>
        <button type="button" onClick={onOpenSettings} className="prototype-button">配置分类</button>
      </div>

      <AnalysisSetupBar
        selectedEntries={selectedEntries}
        supportedFiles={supportedFiles}
        templates={templates}
        analysisSource={analysisSource}
        onChooseAnalysisSource={onChooseAnalysisSource}
        onOpenSettings={onOpenSettings}
        analysisBlockedReason={analysisBlockedReason}
        busy={busy}
        batchId={batchId}
        cancelRequested={cancelRequested}
        onStart={onStart}
        onCancel={onCancel}
        progress={progress}
        showConfigureAction={showConfigureAction}
      />

      <div className="ai-settings-row">
        <label className="prototype-field-label">模型<input aria-label="模型" value={model} onChange={(event) => setModel(event.target.value)} className="prototype-field" /></label>
        <div className="ai-provider-status"><span className={provider?.available ? "is-ready" : "is-warning"}>{provider?.message ?? "正在检查 Ollama…"}</span><button type="button" onClick={onRefreshProvider} className="prototype-button">刷新</button></div>
      </div>

      {error && <div role="alert" className="ai-feedback is-error">{error}</div>}
      {results.length > 0 && <div className="ai-results">
        {results.map((item) => {
          const name = item.source_path.split(/[\\/]/).at(-1) ?? item.source_path;
          const edit = edits[item.id] ?? { filename: item.suggested_filename, categoryId: item.category_id ?? "" };
          return <article key={item.id} className="ai-result-card">
            <div className="ai-result-heading"><div><h3>{name}</h3><p>{item.summary}</p></div><span className="confidence-badge">置信度 {Math.round(item.confidence * 100)}%</span></div>
            <p className="ai-result-meta">{item.keywords.join(" · ")}</p>
            <p className="ai-result-reason">{item.reason}</p>
            <div className="ai-result-fields">
              <label>建议文件名<input aria-label={`${name} 的建议文件名`} value={edit.filename} disabled={item.status !== "pending"} onChange={(event) => onEdit(item.id, { ...edit, filename: event.target.value })} className="prototype-field" /></label>
              <label>目标分类<select aria-label={`${name} 的目标分类`} value={edit.categoryId} disabled={item.status !== "pending"} onChange={(event) => onEdit(item.id, { ...edit, categoryId: event.target.value })} className="prototype-select"><option value="">保留原目录</option>{categories.filter((category) => category.enabled).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            </div>
            {item.status === "pending" ? <div className="ai-result-actions"><button type="button" onClick={() => onReview(item, "accept")} className="prototype-button primary">接受建议</button><button type="button" onClick={() => onReview(item, "reject")} className="prototype-button">拒绝</button></div> : <div className="ai-result-status">状态：{item.status}</div>}
          </article>;
        })}
      </div>}
    </section>
  );
}
