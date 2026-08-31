import type { AiCategory, AiCategoryTemplate, TemplateCategory } from "../../types/ai";

type Props = {
  categories: AiCategory[];
  templates: AiCategoryTemplate[];
  selectedTemplateId: string;
  templateDraft: AiCategoryTemplate | null;
  templateDirty: boolean;
  error: string | null;
  showClose?: boolean;
  onClose: () => void;
  onNewTemplate: () => void;
  onSelectTemplate: (templateId: string) => void;
  onRenameTemplate: (template?: AiCategoryTemplate | null) => void;
  onMakeGlobal: (template?: AiCategoryTemplate | null) => void;
  onRemoveTemplate: (template?: AiCategoryTemplate | null) => void;
  onTemplateNameChange: (value: string) => void;
  onTemplateCategoryChange: (index: number, field: keyof TemplateCategory, value: string | boolean) => void;
  onAddTemplateCategory: () => void;
  onRemoveTemplateCategory: (index: number) => void;
  onSaveTemplate: () => void;
  onCategoryChange: (index: number, field: keyof AiCategory, value: string | boolean) => void;
  onCategoryIdChange: (index: number, value: string) => void;
  onRemoveCategory: (category: AiCategory, index: number) => void;
  onAddCategory: () => void;
  onSaveCategories: () => void;
};

export function TemplateSettingsView({
  categories,
  templates,
  selectedTemplateId,
  templateDraft,
  templateDirty,
  error,
  showClose = true,
  onClose,
  onNewTemplate,
  onSelectTemplate,
  onRenameTemplate,
  onMakeGlobal,
  onRemoveTemplate,
  onTemplateNameChange,
  onTemplateCategoryChange,
  onAddTemplateCategory,
  onRemoveTemplateCategory,
  onSaveTemplate,
  onCategoryChange,
  onCategoryIdChange,
  onRemoveCategory,
  onAddCategory,
  onSaveCategories,
}: Props) {
  return (
    <section aria-labelledby="template-settings-title" className="ai-panel template-settings-view">
      <div className="ai-view-heading">
        <div>
          <span className="eyebrow">模型与分类设置</span>
          <h2 id="template-settings-title">分类模板</h2>
          <p>设置全局模板，或查看和修改已保存的分类模板。</p>
        </div>
        {showClose && <button type="button" onClick={onClose} className="prototype-button">返回 AI 审查</button>}
      </div>

      <div className="template-settings-grid">
        <section className="template-library" aria-labelledby="template-library-title">
          <div className="template-section-heading"><div><h3 id="template-library-title">模板库</h3><p>全局模板会成为文件分析时的默认方案。</p></div><button type="button" onClick={onNewTemplate} className="prototype-button primary">新建模板</button></div>
          {templates.length === 0 && <p className="template-empty">还没有保存的模板。</p>}
          <div className="template-list" aria-label="模板列表">
            {templates.map((template) => <article key={template.id} className={`template-list-item${selectedTemplateId === template.id ? " is-selected" : ""}`}>
              <button type="button" onClick={() => onSelectTemplate(template.id)} className="template-list-select"><span>{template.name}</span><small>v{template.version} · {template.is_global ? "当前全局" : "已保存"}</small></button>
              <div className="template-list-actions"><button type="button" onClick={() => onSelectTemplate(template.id)} className="template-link">查看/修改</button>{!template.is_global && <><button type="button" onClick={() => onRenameTemplate(template)} className="template-link">重命名</button><button type="button" onClick={() => onMakeGlobal(template)} className="template-link">设为全局</button><button type="button" onClick={() => onRemoveTemplate(template)} className="template-link danger">删除模板</button></>}</div>
            </article>)}
          </div>
        </section>

        <section className="template-editor" aria-labelledby="template-editor-title">
          {!templateDraft ? <p className="template-empty">选择一个模板开始编辑，或新建模板。</p> : <>
            <div className="template-section-heading"><div><h3 id="template-editor-title">{templateDraft.name}</h3><p>模板版本 v{templateDraft.version}{templateDirty ? " · 有未保存修改" : ""}</p></div><span className={`template-badge${templateDraft.is_global ? " is-global" : ""}`}>{templateDraft.is_global ? "当前全局" : "已保存"}</span></div>
            <div className="template-editor-actions">{!templateDraft.is_global && <><button type="button" onClick={() => onRenameTemplate()} className="prototype-button">重命名</button><button type="button" onClick={() => onMakeGlobal()} className="prototype-button">设为全局</button><button type="button" onClick={() => onRemoveTemplate()} className="prototype-button danger">删除模板</button></>}</div>
            <label className="prototype-field-label">模板名称<input aria-label="模板名称" disabled={templateDraft.is_global || templateDraft.version > 0} value={templateDraft.name} onChange={(event) => onTemplateNameChange(event.target.value)} className="prototype-field" /></label>
            <div className="template-category-list">{templateDraft.categories.map((category, index) => <div key={`${category.id}-${index}`} className="template-category-row">
              <input aria-label={`模板分类 ${index + 1} 名称`} value={category.name} onChange={(event) => onTemplateCategoryChange(index, "name", event.target.value)} className="prototype-field" />
              <input aria-label={`模板分类 ${index + 1} 描述`} value={category.description} onChange={(event) => onTemplateCategoryChange(index, "description", event.target.value)} className="prototype-field" />
              <label className="template-checkbox"><input type="checkbox" checked={category.default_enabled} onChange={(event) => onTemplateCategoryChange(index, "default_enabled", event.target.checked)} />默认启用</label>
              <button type="button" onClick={() => onRemoveTemplateCategory(index)} className="prototype-button danger">删除模板分类 {index + 1}</button>
              <details><summary>高级设置</summary><label className="prototype-field-label">分类 ID<input aria-label={`模板分类 ${index + 1} ID`} value={category.id} onChange={(event) => onTemplateCategoryChange(index, "id", event.target.value)} className="prototype-field" /></label></details>
            </div>)}<button type="button" onClick={onAddTemplateCategory} className="prototype-button">新增模板分类</button></div>
            <div className="template-save-row"><button type="button" onClick={onSaveTemplate} className="prototype-button primary">保存模板</button></div>
          </>}
        </section>
      </div>

      <section className="directory-category-settings" aria-labelledby="directory-category-title">
        <div className="template-section-heading"><div><h3 id="directory-category-title">当前目录自定义分类</h3><p>仅影响当前授权目录，可独立于模板库保存。</p></div><div className="template-editor-actions"><button type="button" onClick={onAddCategory} className="prototype-button">新增分类</button><button type="button" onClick={onSaveCategories} className="prototype-button primary">保存分类</button></div></div>
        <div className="directory-category-list">{categories.map((category, index) => <div key={`${category.id}-${index}`} className="directory-category-row">
          <input aria-label={`分类 ${index + 1} 名称`} value={category.name} onChange={(event) => onCategoryChange(index, "name", event.target.value)} className="prototype-field" />
          <input aria-label={`分类 ${index + 1} 描述`} value={category.description} onChange={(event) => onCategoryChange(index, "description", event.target.value)} className="prototype-field" />
          <input aria-label={`分类 ${index + 1} 目录`} value={category.directory_path} readOnly className="prototype-field" />
          <label className="template-checkbox"><input type="checkbox" checked={category.enabled} onChange={(event) => onCategoryChange(index, "enabled", event.target.checked)} />启用</label>
          <button type="button" onClick={() => onRemoveCategory(category, index)} className="prototype-button danger">删除分类 {index + 1}</button>
          <details><summary>高级设置</summary><label className="prototype-field-label">分类 ID<input aria-label={`分类 ${index + 1} ID`} value={category.id} onChange={(event) => onCategoryIdChange(index, event.target.value)} className="prototype-field" /></label></details>
        </div>)}</div>
      </section>
      {error && <div role="alert" className="ai-feedback is-error">{error}</div>}
    </section>
  );
}
