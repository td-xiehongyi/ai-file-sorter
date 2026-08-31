# Template Library Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show every saved template in both the global and common sections, keep the editor layout stable while switching, and prevent asynchronous mutations from restoring stale template lists.

**Architecture:** Keep one SQLite record per template and the existing `is_global` flag. The React library renders the current global record as a highlighted default plus all records in the reusable list; mutations refresh the canonical list by ID from the backend, while selection remains ID-based. CSS gives the two-pane workspace a stable desktop height with internal scrolling and responsive auto-height on narrow screens.

**Tech Stack:** React + TypeScript + Vitest, existing Tauri Rust template commands, CSS, SQLite persistence.

**Spec:** `docs/ui-design/UI_DESIGN_SPEC.md`, `docs/ui-design/UI_INTERACTION_SPEC.md`

## Global Constraints

- Exactly one template may be global; the global template remains protected from deletion.
- The same template ID must be editable from either visual section.
- Template IDs and versions remain stable when only the name changes.
- Backend persistence remains the source of truth after every mutation.
- Responsive layouts must remain usable below 950px and 650px viewport widths.

---

### Task 1: Add failing regression tests

**Files:**
- Modify: `src/features/ai/TemplateSettingsView.test.tsx`
- Modify: `src/features/ai/AiPanel.test.tsx`
- Modify: `src/app/styles.test.ts` (if an existing style test harness is available; otherwise keep layout assertions in component tests)

- [x] Assert that a three-template input renders the global template once in the global group and all three templates in the common group.
- [x] Assert that selecting a template keeps its editor content and action set stable when another template has a different category count.
- [x] Add a regression test for a mutation response updating one template without dropping the other template IDs.
- [x] Run the focused tests and confirm the new expectations fail against the current implementation.

### Task 2: Make the template list and mutations canonical

**Files:**
- Modify: `src/features/ai/TemplateSettingsView.tsx`
- Modify: `src/features/ai/AiPanel.tsx`

- [x] Render the global template in the default section and render the complete `templates` array in the common section, using stable `template.id` keys.
- [x] Keep both sections wired to the same ID-based selection and editor draft.
- [x] Add a refresh helper that reads all templates from `getAiCategoryTemplates()` after save, rename, make-global, or delete, then restores the selected ID when it still exists.
- [x] Replace filter-and-append updates and stale-closure removal with the refresh helper; preserve global deletion protection.
- [x] Run the focused React tests until green.

### Task 3: Stabilize the two-pane layout

**Files:**
- Modify: `src/app/styles.css`

- [x] Give the desktop template grid a stable row height and align panes at the start.
- [x] Constrain the library list and editor category list to internal scroll areas so category count does not move the directory section.
- [x] Override the fixed height at the existing responsive breakpoints so narrow screens stack naturally.
- [x] Run the full frontend suite and production build.

### Task 4: Update UI documentation and verify

**Files:**
- Modify: `docs/ui-design/UI_DESIGN_SPEC.md`
- Modify: `docs/ui-design/UI_INTERACTION_SPEC.md`
- Modify: `docs/ui-design/REACT_VISUAL_ACCEPTANCE.md`

- [x] Document that the common list intentionally contains the global template and all reusable templates.
- [x] Document stable pane layout and internal scrolling behavior.
- [x] Run `pnpm check`, Rust template integration tests, `cargo fmt --check`, and `git diff --check`.
- [x] Report any environment-specific Rust linking limitation without treating it as a code pass.
