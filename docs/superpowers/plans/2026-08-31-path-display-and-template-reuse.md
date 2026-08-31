# Path Display and Template Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep Windows extended paths for internal safety while showing readable paths, and make both global and common classification templates renameable and reusable.

**Architecture:** Add a small React display-only path formatter at the UI boundary; raw paths remain unchanged in callbacks, storage, and Rust validation. Keep the existing SQLite template model with exactly one global template and any number of common templates, removing only the global-rename restriction and clarifying the library UI.

**Tech Stack:** React + TypeScript + Vitest, Tauri Rust commands/repository, SQLite, existing CSS and UI design docs.

**Spec:** `docs/ui-design/UI_DESIGN_SPEC.md`, `docs/ui-design/UI_INTERACTION_SPEC.md`

## Global Constraints

- Internal file operations must continue using canonical paths returned by Rust.
- Exactly one template may be global; global templates remain protected from deletion.
- Template IDs, category IDs, and versions must remain stable when a template is renamed.
- Template names remain unique case-insensitively.

---

### Task 1: Lock the desired behavior with failing tests

**Files:**
- Create: `src/lib/path-display.test.ts`
- Modify: `src/features/ai/TemplateSettingsView.test.tsx`
- Modify: `src-tauri/tests/category_templates.rs`

- [x] Add tests for converting `\\?\\C:\\...` and `\\?\\UNC\\...` to display paths while leaving ordinary paths unchanged.
- [x] Add a UI test asserting a global template exposes a rename action and common templates retain rename/set-global/delete actions.
- [x] Change the Rust template test to require that global rename succeeds, preserves ID/version/global status, and still rejects duplicate names.
- [x] Run the focused Vitest and Rust tests and confirm they fail for the missing behavior.

### Task 2: Implement display-only Windows path formatting

**Files:**
- Create: `src/lib/path-display.ts`
- Modify: `src/app/TopBar.tsx`
- Modify: `src/features/files/DirectoryStatus.tsx`
- Modify: `src/features/files/FileList.tsx`
- Modify: `src/features/operations/OperationPreviewView.tsx`
- Modify: `src/features/operations/OperationHistoryView.tsx`

- [x] Implement `formatDisplayPath(path: string): string` for drive and UNC extended prefixes.
- [x] Pass formatted values to visible text and titles only; keep raw path values for selection, callbacks, and API payloads.
- [x] Run the path formatter and affected component tests.

### Task 3: Enable global-template rename and clarify reusable template groups

**Files:**
- Modify: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/tests/category_templates.rs`
- Modify: `src/features/ai/AiPanel.tsx`
- Modify: `src/features/ai/TemplateSettingsView.tsx`
- Modify: `src/features/ai/TemplateSettingsView.test.tsx`

- [x] Remove only the Rust rejection that blocks global-template rename; keep global deletion protection and name uniqueness validation.
- [x] Allow the React rename handler and editor action for global templates.
- [x] Render separate “全局模板（默认）” and “常用模板” groups while preserving selection, editing, setting-global, and deletion behavior.
- [x] Ensure all persisted templates remain available to the analysis template selector after reload.
- [x] Run focused frontend and Rust tests and then the full suites.

### Task 4: Synchronize documentation and verify the complete change

**Files:**
- Modify: `docs/ui-design/UI_DESIGN_SPEC.md`
- Modify: `docs/ui-design/UI_INTERACTION_SPEC.md`
- Modify: `docs/ui-design/REACT_VISUAL_ACCEPTANCE.md`

- [x] Document the readable display-path rule and the raw-path safety boundary.
- [x] Document one renameable global template plus renameable reusable common templates, with global deletion protection.
- [x] Run `pnpm check`, `cargo fmt --check`, and the focused Rust template suite; full Rust integration linking is blocked by a missing `msvcrt.lib` in the local toolchain.
- [x] Review the final diff and report verification limits explicitly.
