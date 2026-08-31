import type { AiCategoryTemplate, AnalysisCategorySource, AnalysisProgress } from "../../types/ai";
import type { SearchEntry } from "../../types/search";

type Props = {
  selectedEntries: SearchEntry[];
  supportedFiles: SearchEntry[];
  templates: AiCategoryTemplate[];
  analysisSource: AnalysisCategorySource | null;
  onChooseAnalysisSource: (value: string) => void;
  onOpenSettings: () => void;
  analysisBlockedReason: string | null;
  busy: boolean;
  batchId: string | null;
  cancelRequested: boolean;
  onStart: () => void;
  onCancel: () => void;
  progress: AnalysisProgress | null;
  showConfigureAction?: boolean;
};

export function AnalysisSetupBar({
  selectedEntries,
  supportedFiles,
  templates,
  analysisSource,
  onChooseAnalysisSource,
  onOpenSettings,
  analysisBlockedReason,
  busy,
  batchId,
  cancelRequested,
  onStart,
  onCancel,
  progress,
  showConfigureAction = false,
}: Props) {
  const globalTemplates = templates.filter((template) => template.is_global);
  const reusableTemplates = templates.filter((template) => !template.is_global);

  return (
    <section aria-label="AI 分析准备" className="analysis-setup-view">
      <div className="selection-bar" aria-label="文件选择操作">
        <div className="selection-summary">
          <strong>{selectedEntries.length > 0 ? `已选择 ${selectedEntries.length} 个文件` : "尚未选择文件"}</strong>
          <span>{supportedFiles.length > 0 ? `${supportedFiles.length} 个文件可进行 AI 分析` : "请先在文件列表中选择文件"}</span>
        </div>
        <div className="selection-controls">
          {selectedEntries.length > 0 && <label className="selection-source">分类方案（本次分析）<select aria-label="分类方案" value={analysisSource?.kind === "template" ? `template:${analysisSource.template_id}` : analysisSource?.kind === "root_custom" ? "root_custom" : ""} onChange={(event) => onChooseAnalysisSource(event.target.value)} className="prototype-select"><option value="">请选择分类方案</option>{globalTemplates.length > 0 && <optgroup label="全局默认">{globalTemplates.map((template) => <option key={template.id} value={`template:${template.id}`}>{template.name} · 全局默认 · v{template.version}</option>)}</optgroup>}{reusableTemplates.length > 0 && <optgroup label="常用模板">{reusableTemplates.map((template) => <option key={template.id} value={`template:${template.id}`}>{template.name} · v{template.version}</option>)}</optgroup>}<option value="root_custom">当前目录自定义分类</option></select></label>}
          {selectedEntries.length > 0 && <button type="button" onClick={onOpenSettings} className="prototype-button">管理分类</button>}
          <button type="button" disabled={analysisBlockedReason !== null} onClick={onStart} className="prototype-button primary">分析所选文件（{supportedFiles.length}）</button>
          {busy && batchId && <button type="button" disabled={cancelRequested} onClick={onCancel} className="prototype-button">{cancelRequested ? "取消中…" : "取消分析"}</button>}
        </div>
      </div>
      <div className="selection-feedback">
        {selectedEntries.length > supportedFiles.length && <span>已忽略不支持的格式</span>}
        {progress && <span role="status">{progress.completed_files}/{progress.total_files} · {progress.phase}</span>}
      </div>
      {analysisBlockedReason && <div role="status" aria-live="polite" className="ai-feedback is-warning">
        <span>{analysisBlockedReason}</span>
        {!busy && showConfigureAction && <button type="button" onClick={onOpenSettings} className="prototype-button">现在配置分类</button>}
      </div>}
    </section>
  );
}
