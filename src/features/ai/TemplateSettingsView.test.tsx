import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { AiCategory, AiCategoryTemplate } from "../../types/ai";
import { TemplateSettingsView } from "./TemplateSettingsView";

const categories: AiCategory[] = [];
const templates: AiCategoryTemplate[] = [
  { id: "global", name: "默认方案", version: 2, is_global: true, categories: [] },
  { id: "common-1", name: "项目资料", version: 1, is_global: false, categories: [] },
  { id: "common-2", name: "学习资料", version: 1, is_global: false, categories: [] },
];

it("offers rename for the global template and reusable actions for common templates", () => {
  render(
    <TemplateSettingsView
      categories={categories}
      templates={templates}
      selectedTemplateId="global"
      templateDraft={templates[0]}
      templateDirty={false}
      error={null}
      onClose={vi.fn()}
      onNewTemplate={vi.fn()}
      onSelectTemplate={vi.fn()}
      onRenameTemplate={vi.fn()}
      onMakeGlobal={vi.fn()}
      onRemoveTemplate={vi.fn()}
      onTemplateNameChange={vi.fn()}
      onTemplateCategoryChange={vi.fn()}
      onAddTemplateCategory={vi.fn()}
      onRemoveTemplateCategory={vi.fn()}
      onSaveTemplate={vi.fn()}
      onCategoryChange={vi.fn()}
      onCategoryIdChange={vi.fn()}
      onRemoveCategory={vi.fn()}
      onAddCategory={vi.fn()}
      onSaveCategories={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading", { name: "全局模板（默认）" })).toBeInTheDocument();
  const commonGroup = screen.getByRole("region", { name: "常用模板" });
  expect(commonGroup).toBeInTheDocument();
  for (const name of ["默认方案", "项目资料", "学习资料"]) {
    expect(within(commonGroup).getByText(name)).toBeInTheDocument();
  }
  expect(screen.getAllByRole("button", { name: "重命名" }).length).toBeGreaterThanOrEqual(3);
  expect(screen.getAllByRole("button", { name: "设为全局" }).length).toBeGreaterThanOrEqual(2);
});
