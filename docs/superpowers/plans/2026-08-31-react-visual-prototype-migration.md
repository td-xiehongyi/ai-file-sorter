# React 视觉原型迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `docs/ui-design/ai-file-sorter.html` 的最终用户可见界面完整迁移到 React，同时保留现有扫描、索引、AI 分析、模板管理、操作预览、执行、历史和撤销逻辑。

**Architecture:** 保留现有 `FilesFeature`、`AiPanel` 和操作 API 作为业务控制层，新增一个轻量的 React 工作区壳层负责侧栏、顶栏、页面视图和导航状态。视觉层采用 CSS 设计令牌与语义化组件类复刻 HTML 原型，业务组件只接收数据和回调，不直接承担整页布局。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS 4、Tauri、Vitest、JetBrains Mono 2.304。

**Spec:** `docs/ui-design/UI_DESIGN_SPEC.md`、`docs/ui-design/UI_INTERACTION_SPEC.md`、`docs/ui-design/ai-file-sorter.html`

## Global Constraints

- 产品名称统一显示为 `ai-file-sorter`，不得再显示 `AI File Organizer`、`Phase 5` 或设计方案说明。
- 页面主背景使用 `#f8f6f0`，侧栏使用 `#ebe7dd`，主要表面使用 `#fffdf8`，避免现有深色背景和高对比荧光色。
- 全局字体使用 JetBrains Mono 2.304；中文使用 `Microsoft YaHei` 回退，常用正文不低于 `13px`，辅助文字不低于 `11px`。
- 桌面端布局为 `260px` 侧栏加自适应主区；小于 `950px` 收窄侧栏，小于 `650px` 隐藏侧栏并改为单列。
- 移动、重命名、创建目录和执行 AI 建议仍必须经过 Rust 校验、预览、明确确认、执行时复核、历史和撤销流程；视觉迁移不得绕过安全边界。
- HTML 中的演示文案、内部实现说明和“方案选择”说明不进入最终用户界面。
- 只修改前端布局、样式和视图编排；不复制 HTML 中的静态假数据覆盖真实 API 状态。

---

### Task 1: 建立视觉迁移基线与共享设计令牌

**Files:**
- Create: `src/app/design-tokens.css`
- Modify: `src/app/styles.css`
- Create: `src/assets/fonts/JetBrainsMono-2.304/JetBrainsMono-Regular.woff2`
- Create: `src/assets/fonts/JetBrainsMono-2.304/JetBrainsMono-SemiBold.woff2`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Produces CSS variables `--color-canvas`、`--color-sidebar`、`--color-surface`、`--color-border`、`--color-text`、`--color-muted`、`--color-primary`、`--color-confirm` and font faces `JetBrains Mono`.
- `styles.css` imports the token file before component styles; existing Tailwind reset remains available.

- [x] **Step 1: Write the failing style contract test**

  Extend `src/app/App.test.tsx` to render `App` and assert that the root contains `ai-file-sorter`, the former `AI File Organizer` and `阶段五开发版` labels are absent, and the root advertises the light UI theme. The sidebar landmark is verified in Task 2 after the shell is introduced.

- [x] **Step 2: Add the font and token declarations**

  Add the licensed JetBrains Mono 2.304 regular and semibold webfont files under `src/assets/fonts/JetBrainsMono-2.304/`, then define:

  ```css
  @font-face {
    font-family: "JetBrains Mono";
    src: url("../assets/fonts/JetBrainsMono-2.304/JetBrainsMono-Regular.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }

  :root {
    --color-canvas: #f8f6f0;
    --color-sidebar: #ebe7dd;
    --color-surface: #fffdf8;
    --color-border: #ddd7cb;
    --color-text: #242824;
    --color-muted: #8d8c84;
    --color-primary: #78937f;
    --color-brand: #365744;
    --color-selected: #e4ebe1;
    --color-confirm: #d6ae63;
  }
  ```

- [x] **Step 3: Replace the dark global defaults**

  Change `html`, `body`, selection, focus, button, input, textarea and select defaults to use the token values, remove the `ambient` background layers, and keep a minimum viewport width of `320px`.

- [x] **Step 4: Run the focused test and visual build**

  Run `pnpm vitest run src/app/App.test.tsx` and `pnpm build`. Expected: the focused test passes and the production bundle builds.

- [ ] **Step 5: Commit the baseline**

  ```powershell
  git add src/app/design-tokens.css src/app/styles.css src/assets/fonts/JetBrainsMono-2.304 src/app/App.test.tsx
  git commit -m "style: establish light visual tokens and font"
  ```

### Task 2: 将 App 重构为原型一致的应用壳层

**Files:**
- Create: `src/app/WorkspaceShell.tsx`
- Create: `src/app/Sidebar.tsx`
- Create: `src/app/TopBar.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- `WorkspaceShell` accepts `{ activeView: WorkspaceView; onNavigate(view: WorkspaceView): void; rootPath: string | null; providerLabel: string; children: React.ReactNode }`.
- `WorkspaceView` is the union `"files" | "ai" | "preview" | "history" | "settings"`.
- `Sidebar` emits only `onNavigate`; it does not call Tauri APIs.
- `TopBar` displays the real root path and provider state passed by the controller; it must not hard-code `qwen3:8b`.

- [x] **Step 1: Add navigation contract tests**

  In `src/app/App.test.tsx`, assert that all five navigation labels exist, clicking a navigation item changes the active view, and the sidebar has a `nav` landmark.

- [x] **Step 2: Implement `Sidebar`**

  Recreate the HTML sidebar: 260px desktop column, brand mark, `ai-file-sorter` label, workspace label, five navigation items, optional count badges, and safety footer. Use buttons with visible focus states and `aria-current="page"` for the active item.

- [x] **Step 3: Implement `TopBar`**

  Recreate the 72px top bar with breadcrumb, local AI status pill, and responsive truncation for long paths. Use the provider status supplied by React state.

- [x] **Step 4: Implement `WorkspaceShell` and wire `App`**

  Keep `activeView` in `App`; render `WorkspaceShell` around the existing feature controller. Remove the old `Phase 5 · Local AI Suggestions`, `AI File Organizer`, version footer and prototype-only explanatory copy.

- [x] **Step 5: Run shell tests**

  Run `pnpm vitest run src/app/App.test.tsx`. Expected: navigation, labels, active state and accessibility assertions pass.

- [ ] **Step 6: Commit the shell**

  ```powershell
  git add src/app/App.tsx src/app/App.test.tsx src/app/WorkspaceShell.tsx src/app/Sidebar.tsx src/app/TopBar.tsx
  git commit -m "feat: add prototype workspace shell"
  ```

### Task 3: 迁移文件浏览页与选择操作栏

**Files:**
- Create: `src/features/files/FileBrowserView.tsx`
- Create: `src/features/files/DirectoryStatus.tsx`
- Modify: `src/features/files/FileBrowser.tsx`
- Modify: `src/features/files/FileList.tsx`
- Modify: `src/features/files/FilesFeature.tsx`
- Modify: `src/features/files/FileBrowser.test.tsx`

**Interfaces:**
- `FileBrowserView` consumes the existing `useFiles` state, `selectedPaths`, `onToggleSelection`, `changeNotice` and `watcherError`.
- `DirectoryStatus` consumes `{ rootPath: string | null; status: IndexStatus | null }` and renders only status data received from the controller.
- The selection bar consumes `selectedEntries`, the selected analysis source and callbacks already exposed by `AiPanel`; it never directly starts analysis.

- [x] **Step 1: Add file-page assertions**

  Update `FileBrowser.test.tsx` to assert the light card/table structure, search and filter controls, selected row state, and the presence of the `AI 分类方案` selector only when ordinary files are selected.

- [x] **Step 2: Move directory status into a reusable view**

  Render the current authorization path and index status as two light `status-card` surfaces matching the HTML grid. Preserve loading, empty, error and watcher-notice states.

- [x] **Step 3: Restyle the browser and table**

  Map existing file entries to the HTML table columns, keep pagination/search/filter behavior unchanged, add `title` attributes for truncated paths, and use semantic table/list roles where the existing structure permits.

- [x] **Step 4: Rebuild the selection bar**

  Use the HTML three-column layout: selected-file summary, category source selector with “管理分类”, and batch action buttons. Keep “分析所选文件” as the single primary action and retain the existing operation preview callbacks.

- [x] **Step 5: Verify file interactions**

  Run `pnpm vitest run src/features/files/FileBrowser.test.tsx src/features/ai/AiPanel.test.tsx`. Expected: selection, filtering, source selection and existing analysis gating remain green.

- [ ] **Step 6: Commit the file view**

  ```powershell
  git add src/features/files src/features/ai/AiPanel.test.tsx
  git commit -m "style: migrate file browser to prototype layout"
  ```

### Task 4: 将 AI 审查与模板设置拆为原型中的两个视图

**Files:**
- Create: `src/features/ai/AiReviewView.tsx`
- Create: `src/features/ai/TemplateSettingsView.tsx`
- Modify: `src/features/ai/AiPanel.tsx`
- Modify: `src/features/ai/AiPanel.test.tsx`
- Modify: `src/features/files/FilesFeature.tsx`

**Interfaces:**
- `AiReviewView` receives the existing AI task state, results, edit handlers, provider state and preview callback from `AiPanel`.
- `TemplateSettingsView` receives template list, draft, dirty state and the existing save/rename/delete/set-global callbacks; global templates remain non-renamable and non-deletable.
- `FilesFeature` owns view selection but does not duplicate template or analysis state.

- [x] **Step 1: Add view-level tests**

  Extend `AiPanel.test.tsx` to assert that the AI review view renders suggestion cards, confidence badges and review actions, while the settings view renders the template library/editor and no “应用模板” button.

- [x] **Step 2: Extract the AI review surface**

  Recreate the HTML split layout: a primary suggestion panel and a secondary analysis-settings panel. Preserve progress, cancellation, retry, inline filename/category editing, and the existing `onPreview` safety handoff.

- [x] **Step 3: Extract the template library/editor**

  Recreate the settings page with a left template library and right category editor. Keep new-template, save, rename, set-global and delete operations connected to current APIs and show dirty-state protection on navigation.

- [x] **Step 4: Remove duplicated whole-page layout from `AiPanel`**

  Leave `AiPanel` as the stateful controller and render `AiReviewView` or `TemplateSettingsView` based on the active view supplied by `FilesFeature`; do not create a second API state machine.

- [x] **Step 5: Run AI tests**

  Run `pnpm vitest run src/features/ai/AiPanel.test.tsx src/lib/ai-api.test.ts`. Expected: template CRUD rules, source freezing, analysis cancellation and review actions pass.

- [ ] **Step 6: Commit the AI views**

  ```powershell
  git add src/features/ai src/features/files/FilesFeature.tsx
  git commit -m "feat: split AI review and template settings views"
  ```

### Task 5: 迁移操作预览、确认执行与历史撤销页面

**Files:**
- Create: `src/features/operations/OperationPreviewView.tsx`
- Create: `src/features/operations/OperationHistoryView.tsx`
- Modify: `src/features/operations/OperationPanel.tsx`
- Modify: `src/features/operations/OperationPreview.tsx`
- Modify: `src/features/operations/OperationHistory.tsx`
- Modify: `src/features/files/FilesFeature.tsx`
- Modify: `src/features/operations/OperationPreview.test.tsx`
- Modify: `src/features/operations/OperationHistory.test.tsx`

**Interfaces:**
- `OperationPreviewView` consumes `OperationPreviewResponse`, `onConfirm`, `onCancel` and `busy` without changing the operation API.
- `OperationHistoryView` consumes `OperationHistoryItem[]`, `onUndo` and `busy` without changing undo semantics.
- Confirmation actions remain sibling buttons: `确认并执行` uses amber emphasis, `取消计划` uses the neutral style.

- [x] **Step 1: Add preview and history layout assertions**

  Assert that preview rows use aligned From → To columns, the action panel places the two buttons side by side, and history items expose undo availability without showing internal implementation notes.

- [x] **Step 2: Rebuild the preview page**

  Use the HTML single-panel layout, explicit status badge, operation rows and bottom action row. Preserve conflict, expiration, directory-creation and invalid-plan messages from the existing response.

- [x] **Step 3: Rebuild the history page**

  Use consistent history rows with operation type, source/target summary, timestamp/status and an aligned undo control. Keep unavailable and already-undone states visible but visually secondary.

- [x] **Step 4: Restyle the manual operation panel**

  Keep batch move and single-file rename functionality, but place controls in the same card/button language as the prototype and route all submissions through the existing preview callback.

- [x] **Step 5: Run operation tests**

  Run `pnpm vitest run src/features/operations/OperationPreview.test.tsx src/features/operations/OperationHistory.test.tsx src/features/operations/OperationPanel.test.tsx`. Expected: preview, confirmation, cancellation and undo behavior remain green.

- [ ] **Step 6: Commit the operation views**

  ```powershell
  git add src/features/operations src/features/files/FilesFeature.tsx
  git commit -m "style: migrate preview and history views"
  ```

### Task 6: 统一响应式、可访问性和交互细节

**Files:**
- Modify: `src/app/design-tokens.css`
- Modify: `src/app/styles.css`
- Modify: `src/app/WorkspaceShell.tsx`
- Modify: `src/app/Sidebar.tsx`
- Modify: `src/features/files/FileBrowserView.tsx`
- Modify: `src/features/ai/AiReviewView.tsx`
- Modify: `src/features/ai/TemplateSettingsView.tsx`
- Modify: `src/features/operations/OperationPreviewView.tsx`
- Test: `src/app/App.test.tsx`, `src/features/files/FileBrowser.test.tsx`, `src/features/ai/AiPanel.test.tsx`

**Interfaces:**
- All interactive controls expose keyboard focus, accessible names and disabled/busy states.
- Responsive breakpoints are centralized in CSS and do not change domain callbacks.

- [x] **Step 1: Add keyboard and focus tests**

  Assert that navigation buttons, category selector, analysis action, confirmation action and cancel action are keyboard-focusable and expose disabled state while busy.

- [x] **Step 2: Implement responsive breakpoints**

  At widths below 950px collapse the sidebar to an icon rail and stack split panels; below 650px hide the sidebar, stack toolbars and make selection/action bars single-column without horizontal overflow.

- [x] **Step 3: Normalize text and spacing**

  Apply the 30px page title, 18px section title, 13px body, 12px secondary and 11px metadata scale; normalize border radii to 8–15px and button heights to 38–42px.

- [x] **Step 4: Remove remaining prototype-only copy**

  Search `src` for `Phase 5`、`AI File Organizer`、`方案模板管理完整版`、`原型` and internal safety explanation strings; retain only concise user-facing safety messages required for the current action.

- [x] **Step 5: Run the full frontend suite**

  Run `pnpm check`. Expected: typecheck, all Vitest tests and Vite production build pass.

- [ ] **Step 6: Commit accessibility and responsive polish**

  ```powershell
  git add src/app src/features
  git commit -m "style: polish responsive and accessible prototype UI"
  ```

### Task 7: 完成视觉验收与文档同步

**Files:**
- Modify: `docs/ui-design/UI_DESIGN_SPEC.md`
- Modify: `docs/ui-design/UI_INTERACTION_SPEC.md`
- Create: `docs/ui-design/REACT_VISUAL_ACCEPTANCE.md`
- Test: `src/app/App.test.tsx`, all existing frontend tests

**Interfaces:**
- Acceptance document records viewport, route/view, state and expected visible result; it does not introduce new product behavior.

- [x] **Step 1: Add the visual acceptance checklist**

  Document checks for the five views, empty/loading/error states, selected files, template source selection, analysis progress, preview conflicts, confirmation and undo states at 1440px, 950px and 650px widths.

- [x] **Step 2: Compare React against the HTML baseline**

  Start the app with `pnpm tauri dev`, capture the same states represented by `docs/ui-design/ai-file-sorter.html`, and record any intentional runtime-data differences such as real provider status or actual file names.

- [x] **Step 3: Update the design docs**

  Change statements that say the target UI is not implemented, and document the final React component mapping while keeping the safety model as the normative behavior source.

- [x] **Step 4: Run release-level checks**

  Run `pnpm check:all` and inspect `git diff --check`. Expected: frontend and Rust checks pass, with no whitespace errors.

- [ ] **Step 5: Commit the acceptance evidence**

  ```powershell
  git add docs/ui-design docs/superpowers/plans/2026-08-31-react-visual-prototype-migration.md
  git commit -m "docs: record React visual prototype acceptance"
  ```

## Completion Criteria

- React 启动后默认显示与 HTML 原型一致的浅色应用壳层和文件浏览页。
- 五个导航视图均可在真实运行时状态下访问，不依赖 HTML 中的静态假数据。
- 模板选择发生在文件预览/分析前；设置页保留模板新建、查看、修改、重命名和删除规则；不存在“应用模板”按钮。
- AI 建议、操作预览、确认执行、取消计划、历史和撤销的现有安全流程全部保持有效。
- `pnpm check:all` 通过，且在 1440px、950px、650px 三个宽度下没有重叠、裁切或不可操作控件。
