# Exclusive Workspace Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让左侧五个导航入口分别渲染一个独立主视图，避免文件浏览、AI、操作预览、历史和设置内容同时出现在一个页面。

**Architecture:** 保留 `FilesFeature` 作为扫描、AI、模板、操作和历史的状态控制器；新增纯渲染分发层，根据 `activeView` 只选择一个页面。导航仍由 `App` 和 `WorkspaceShell` 管理，不引入 React Router，不改变 Rust API 或安全链路。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Tauri、现有业务 API。

**Spec:** `docs/superpowers/specs/2026-08-31-exclusive-workspace-views-design.md`

## Global Constraints

- 五个一级导航必须对应五个互斥主视图。
- `FilesFeature` 保留现有业务状态和 API 调用，不创建第二套状态机。
- 页面切换不得等同于取消分析、预览或执行任务。
- 确认执行只提交现有 `planId`，不得从页面重新拼装路径。
- 不引入 React Router，不复制 HTML 原型的静态演示数据。
- 继续使用现有 Rust 校验、预览、确认、执行时复核、历史和撤销链路。
- 视图在 950px 与 650px 断点下不得出现横向溢出或内容重叠。

---

### Task 1: 建立独占视图分发接口

**Files:**
- Modify: `src/features/files/FilesFeature.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- `FilesFeature` 接收 `activeView` 和 `onNavigate(view: WorkspaceView)`。
- `WorkspaceViewContent`（可为同文件内组件）只接收当前视图、控制器数据和回调，返回一个主视图。
- `App` 继续持有 `activeView`，并将 `setActiveView` 传入 `FilesFeature`。

- [x] **Step 1: 为导航互斥性写失败测试**

在 `src/app/App.test.tsx` 中增加断言：点击“文件浏览”“AI 建议审查”“操作预览”“历史与撤销”“模型与分类设置”后，主内容分别只包含对应页面标识；文件表格、AI 建议、操作预览、历史和模板库不能同时存在。

- [x] **Step 2: 运行测试确认当前实现失败**

运行 `pnpm vitest run src/app/App.test.tsx`。预期：新增的互斥视图断言失败，证明现有 `FilesFeature` 会同时渲染多个区域。

- [x] **Step 3: 添加导航回调和分发层**

将 `FilesFeature` 的渲染改为单一 `renderActiveView()` 或 `WorkspaceViewContent` 分支。每个分支只返回一个页面根节点；错误、扫描进度等跨视图反馈通过当前视图的顶部反馈区显示。`FilesFeature` 中现有状态和 API handler 保持不变。

- [x] **Step 4: 将流程跳转接入导航回调**

在有效预览生成后调用 `onNavigate("preview")`；分析完成且有结果后调用 `onNavigate("ai")`；取消预览调用 `onNavigate("ai")`。执行完成后保留结果状态，不隐式取消或清除历史。

- [x] **Step 5: 运行测试确认分发通过**

再次运行 `pnpm vitest run src/app/App.test.tsx`，预期导航和互斥视图测试通过。

### Task 2: 固化文件浏览页边界和分析入口

**Files:**
- Modify: `src/features/files/FilesFeature.tsx`
- Modify: `src/features/ai/AiPanel.tsx`
- Modify: `src/features/ai/AiReviewView.tsx`
- Modify: `src/features/files/FileBrowserView.tsx`
- Test: `src/features/files/FileBrowser.test.tsx`
- Test: `src/features/ai/AiPanel.test.tsx`

**Interfaces:**
- `files` 视图只显示 `FileBrowserView`、目录状态、扫描反馈和手动 `OperationPanel`。
- 文件页可显示紧凑的分析准备栏（选择数量、分类来源、分析按钮），但不显示 AI 建议卡片。
- `ai` 视图显示完整 `AiReviewView`，使用已有 `AiPanel` handler。

- [x] **Step 1: 写文件页边界测试**

增加测试：`activeView="files"` 时存在文件表格和分析准备操作，不存在 `.ai-result-card`、模板库和历史记录；选择普通文件后分类方案选择器和分析按钮仍可用。

- [x] **Step 2: 从 AI 审查视图提取分析准备区**

将选择摘要、分类来源选择、管理分类、分析和取消分析按钮提取为可复用的 `AnalysisSetupBar`（或等价组件）。该组件只接收数据和回调，不调用 API；`AiReviewView` 保留完整审查卡片和模型状态。

- [x] **Step 3: 组装文件浏览分支**

在 `files` 分支渲染目录状态、`FileBrowserView`、分析准备区和手动操作面板。禁止渲染 `AiReviewView` 的结果列表、模板设置内容和历史列表。

- [x] **Step 4: 组装 AI 审查分支**

在 `ai` 分支渲染 `AiPanel`/`AiReviewView`，保留进度、取消、重试、编辑建议、接受/拒绝和 `onPreview` 回调。无选择文件时显示返回文件页的空状态。

- [x] **Step 5: 运行文件与 AI 测试**

运行 `pnpm vitest run src/features/files/FileBrowser.test.tsx src/features/ai/AiPanel.test.tsx`，预期现有选择、筛选、分析门禁和建议审查测试全部通过。

### Task 3: 固化操作预览与历史页面边界

**Files:**
- Modify: `src/features/files/FilesFeature.tsx`
- Modify: `src/features/operations/OperationPreviewView.tsx`
- Modify: `src/features/operations/OperationHistoryView.tsx`
- Modify: `src/features/operations/OperationPanel.tsx`
- Test: `src/features/operations/OperationPreview.test.tsx`
- Test: `src/features/operations/OperationHistory.test.tsx`

**Interfaces:**
- `preview` 视图只接收 `OperationPreviewResponse`、确认/取消回调和 busy 状态。
- `history` 视图只接收历史记录、撤销回调和 busy 状态。
- `OperationPanel` 只留在文件浏览页，仍通过 `onPreview` 创建计划。

- [x] **Step 1: 写预览和历史独占测试**

断言预览页显示 From → To 和并排的“取消计划”“确认并执行”，不显示文件表格或历史；历史页显示记录和撤销状态，不显示预览按钮或模板编辑器。

- [x] **Step 2: 添加无计划预览空状态**

当 `operationPreview` 为空时，预览页显示“没有待确认的操作计划”和返回 AI 审查入口；不渲染空的确认按钮。

- [x] **Step 3: 添加历史空状态和独占渲染**

当历史为空时显示尚无执行记录；有记录时沿用当前撤销资格、禁用状态和错误反馈，不显示文件浏览内容。

- [x] **Step 4: 接入取消与执行后的导航**

取消预览后回到 `ai`；确认执行后清理已消费的预览并刷新文件与历史，保留真实执行结果提示，允许用户通过侧栏进入 `history`。

- [x] **Step 5: 运行操作测试**

运行 `pnpm vitest run src/features/operations/OperationPreview.test.tsx src/features/operations/OperationHistory.test.tsx`，预期确认、取消和撤销语义保持通过。

### Task 4: 固化模板设置页面边界

**Files:**
- Modify: `src/features/files/FilesFeature.tsx`
- Modify: `src/features/ai/TemplateSettingsView.tsx`
- Modify: `src/features/ai/AiPanel.tsx`
- Test: `src/features/ai/AiPanel.test.tsx`

**Interfaces:**
- `settings` 视图只渲染模板库、模板编辑器和当前目录分类设置。
- 全局模板继续禁止重命名和删除；非全局模板继续支持查看/修改、重命名、设为全局和删除。
- 设置页不提供“应用模板”按钮，模板只在文件页分析前选择。

- [x] **Step 1: 写设置页边界测试**

断言设置页包含模板库和新建入口，不包含文件表格、AI 建议卡片、操作预览和历史列表，也不包含“应用模板”文案。

- [x] **Step 2: 将设置视图作为独立分支渲染**

仅在 `activeView="settings"` 时渲染 `TemplateSettingsView`，将当前模板 CRUD handler 原样传入，不复制模板状态。

- [x] **Step 3: 保留来源页返回行为**

从 AI 或文件页进入设置时，使用已有 `configOpen`/`onClose` 返回来源视图；侧栏直接进入设置时不依赖其他页面内容。

- [x] **Step 4: 运行设置测试**

运行 `pnpm vitest run src/features/ai/AiPanel.test.tsx`，预期模板 CRUD、全局模板保护和设置页渲染测试通过。

### Task 5: 统一导航状态、空状态和响应式验收

**Files:**
- Modify: `src/app/App.test.tsx`
- Modify: `src/features/files/FileBrowser.test.tsx`
- Modify: `src/features/ai/AiPanel.test.tsx`
- Modify: `src/features/operations/OperationPreview.test.tsx`
- Modify: `src/features/operations/OperationHistory.test.tsx`
- Modify: `src/app/styles.css` only if the new page wrappers need spacing adjustments
- Modify: `docs/ui-design/REACT_VISUAL_ACCEPTANCE.md`

**Interfaces:**
- 所有页面根节点提供稳定的可测试标识或标题。
- 交互控件继续提供键盘焦点、可访问名称和 busy/disabled 状态。

- [x] **Step 1: 增加全流程导航测试**

覆盖文件选择 → AI 审查 → 生成预览 → 操作预览 → 执行结果 → 历史，以及设置页往返；断言每个阶段只有一个视图根节点。

- [x] **Step 2: 检查视图切换期间状态保留**

验证切换侧栏不会清空文件选择、AI 结果、模板草稿或有效 `planId`；只有对应取消或执行 handler 才改变这些状态。

- [x] **Step 3: 运行前端全量验证**

运行 `pnpm check`，预期 TypeScript、全部 Vitest 测试和 Vite 构建通过。

- [x] **Step 4: 更新视觉验收记录**

在 `REACT_VISUAL_ACCEPTANCE.md` 中记录五个独占页面、空状态和导航跳转的验收结果，保留真实 API 数据差异说明。

### Task 6: 完成 Git 交付前检查

**Files:**
- No source changes expected.

- [x] **Step 1: 检查变更范围**

运行 `git diff --check`、`git status --short --branch` 和 `git diff --stat`，确认没有生成物、临时 target 目录或无关文件。

- [x] **Step 2: 运行必要的 Rust 回归检查**

运行 `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 和 `cargo test --manifest-path src-tauri/Cargo.toml --target-dir src-tauri/target-exclusive-views`。验证完成后仅删除本次新建且已确认路径属于项目的临时 target 目录。

- [x] **Step 3: 汇总交付状态**

报告实现文件、测试结果、未完成的手动桌面验收项；未得到用户明确授权前不自动推送或创建 PR。
