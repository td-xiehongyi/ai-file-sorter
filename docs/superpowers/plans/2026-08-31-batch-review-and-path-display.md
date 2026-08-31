# Batch Review and Path Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep users in the AI review view until every generated document has been accepted or rejected, then create one safe operation preview for all accepted documents while displaying long paths without hiding their filenames.

**Architecture:** Review actions first update each result and collect accepted operation items in the React review session. Once every reviewable result reaches a terminal decision, the client submits one combined operation draft for one preview plan. The Rust boundary will expose a batch confirmation command that validates the plan against all accepted result IDs before marking them accepted. Path rendering will use a shared display component that keeps the raw path unchanged, shows a compact middle-ellipsized value, and exposes the complete value through a title and copy action.

**Tech Stack:** React + TypeScript + Vitest, Tauri Rust commands/services, CSS, existing operation preview and plan store.

**Spec:** `docs/ui-design/UI_INTERACTION_SPEC.md`, `docs/ui-design/UI_DESIGN_SPEC.md`, `docs/SAFETY_MODEL.md`

## Global Constraints

- React and AI never mutate files directly; every accepted operation still passes preview, explicit confirmation, execution-time revalidation, history, and undo eligibility checks.
- A review session may create at most one operation preview plan.
- Rejected, expired, or failed results never enter the combined operation draft.
- Raw canonical paths remain unchanged in operation requests and Rust validation; only user-facing rendering is compacted.
- Existing single-result review and manual operation flows remain compatible.
- Full paths remain available to keyboard and assistive-technology users and can be copied without relying on visual truncation.

---

### Task 1: Add failing regression tests for review gating

**Files:**
- Modify: `src/features/ai/AiPanel.test.tsx`
- Modify: `src/features/files/FilesFeature.test.tsx` (only if an existing integration harness covers navigation; otherwise keep the test in `AiPanel.test.tsx`)

- [x] Add a test with two pending AI results where accepting the first result does not call `onPreview` or navigate, and the UI reports one of two processed.
- [x] Extend the test so accepting the second result calls `onPreview` exactly once with one draft containing both operation items.
- [x] Add a mixed-decision test proving one rejection plus one acceptance creates a preview containing only the accepted item after both decisions are complete.
- [x] Run the focused tests and confirm they fail against the current per-card preview behavior.

### Task 2: Implement client-side review-session aggregation

**Files:**
- Modify: `src/features/ai/AiPanel.tsx`
- Modify: `src/features/ai/AiReviewView.tsx` or `src/features/ai/AnalysisSetupBar.tsx` only where review progress/status needs to be displayed

- [x] Track accepted operation items by result ID and the set of locally completed decisions without changing the existing per-result edit fields.
- [x] Change `review()` so it records the returned draft item and marks the card as locally accepted, but does not call `onPreview` for an individual result.
- [x] Keep reject/expired/error handling terminal for the current card and prevent failed reviews from blocking the remaining cards.
- [x] When all results are terminal, combine accepted items under one `root_path` and call `onPreview` once; keep the AI view visible when there are no accepted items.
- [x] Reset the review-session aggregation when a new analysis batch starts, results are replaced, or the user cancels the batch.
- [x] Add visible progress text and a clear empty-operations message for the all-rejected case.

### Task 3: Add a safe batch confirmation boundary

**Files:**
- Modify: `src/lib/ai-api.ts`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/src/services/suggestion_review.rs`
- Test: `src-tauri/tests/category_templates.rs` or a focused AI review integration test file already used by the repository

- [x] Define `confirm_analysis_results_preview(result_ids: Vec<String>, plan_id: String)` and its TypeScript wrapper.
- [x] Reuse the existing plan store validation, but require every supplied result ID to be pending and to match exactly one item in the combined plan by source path, target path, and content fingerprint.
- [x] Mark all matched results accepted in one database transaction; reject partial confirmation and leave all results pending when any item no longer matches.
- [x] Keep the existing single-result command available for compatibility, or route it through the batch implementation with a one-element list.
- [x] Add integration coverage for all-match success, one stale result rejection, duplicate IDs, and an empty ID list.
- [x] Run the focused Rust tests and formatting checks.

### Task 4: Render long paths with a shared compact display

**Files:**
- Create: `src/components/PathDisplay.tsx`
- Create: `src/lib/path-display.ts` additions for compact middle ellipsis and path segments
- Modify: `src/features/operations/OperationPreviewView.tsx`
- Modify: `src/features/operations/OperationHistoryView.tsx`
- Modify: `src/features/files/DirectoryStatus.tsx`
- Modify: `src/app/styles.css`
- Test: `src/lib/path-display.test.ts`, `src/features/operations/OperationPreview.test.tsx`

- [x] Add a pure formatter that preserves the drive/UNC root, final directory, and filename while replacing only the middle segments when a path exceeds the display budget.
- [x] Render compact text with the complete formatted path in `title`/accessible description and a small “复制路径” action that copies the raw display path and reports success.
- [x] Apply `min-width: 0` to path grid cells and use two-column desktop layout, two-line or stacked layout on narrow screens, without changing operation payloads.
- [x] Add tests for drive paths, UNC paths, extended Windows prefixes, short paths, and long paths where the filename remains visible.
- [x] Run focused path/preview tests and the full frontend check.

### Task 5: Synchronize documentation and verify end-to-end behavior

**Files:**
- Modify: `docs/ui-design/UI_INTERACTION_SPEC.md`
- Modify: `docs/ui-design/UI_DESIGN_SPEC.md`
- Modify: `docs/ui-design/REACT_VISUAL_ACCEPTANCE.md`

- [x] Document that review navigation is gated on all result decisions and that one combined preview is created.
- [x] Document compact path display, full-path access, copy behavior, and responsive wrapping.
- [x] Run `pnpm check`, focused Rust integration tests, `cargo fmt --check`, and `git diff --check`.
- [x] Confirm the focused Rust suite completes in the isolated target directory; no linker limitation affected this change.
