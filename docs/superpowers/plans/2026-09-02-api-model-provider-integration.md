# API Model Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the desktop app to configure, test, and use an external OpenAI-compatible model API while preserving the existing preview-confirm-execute-history-undo safety boundary.

**Architecture:** Keep `AiProvider` as the only model-facing Rust interface. Add a persisted non-secret provider profile, a platform credential-store adapter for the API key, and an OpenAI-compatible provider implementation selected by a Rust resolver. React calls narrow Tauri commands, never calls the remote API directly, and remote document-content transfer requires an explicit per-analysis consent before the existing analysis and operation-review pipeline continues.

**Tech Stack:** React + TypeScript + Vitest, Tauri 2, Rust 2024, `reqwest` blocking JSON client, SQLite migrations through the existing database layer, and the Windows platform credential store through a small `SecretStore` abstraction.

**Spec:** `docs/PHASE_05_AI.md` and `docs/SAFETY_MODEL.md`; UI reference: `docs/ui-design/ai-file-sorter.html`.

## Global Constraints

- React must not call an external model endpoint, read the filesystem, or store API keys.
- API keys must never be stored in SQLite, analysis results, logs, errors, HTML, or browser-visible state after submission.
- The default provider remains local Ollama; changing provider must not weaken existing file-root, path, preview, confirmation, recheck, history, or undo controls.
- Remote analysis must be opt-in at the time content is about to leave the device; no remote request is allowed without the explicit consent value reaching Rust.
- The first real implementation supports one OpenAI-compatible chat-completions protocol; Anthropic-specific behavior remains disabled until a separate adapter is designed and tested.
- No commit, push, merge, cleanup, or desktop release claim is made without explicit user authorization for that phase.

## File Map

- `src-tauri/src/models/ai_provider.rs`: provider kinds, public configuration DTOs, and command request types.
- `src-tauri/src/storage/migrations/008_ai_provider.sql`: non-secret provider profile and active-provider persistence.
- `src-tauri/src/storage/ai_provider_repository.rs`: SQLite reads/writes for public provider configuration only.
- `src-tauri/src/services/secret_store.rs`: secret-store interface and Windows-backed implementation boundary.
- `src-tauri/src/ai/openai_compatible.rs`: external chat-completions adapter implementing `AiProvider`.
- `src-tauri/src/services/provider_registry.rs`: provider validation, secret lookup, and provider construction.
- `src-tauri/src/commands/ai.rs` and `src-tauri/src/lib.rs`: narrow configuration, health-check, and analysis command wiring.
- `src/types/ai.ts` and `src/lib/ai-api.ts`: frontend DTOs and invoke wrappers.
- `src/features/ai/ProviderSettingsView.tsx`: provider configuration UI, separated from category-template editing.
- `src/features/ai/AiPanel.tsx`, `src/features/ai/AiReviewView.tsx`, and `src/features/ai/AnalysisSetupBar.tsx`: selected provider state, status, and remote-consent gate.
- `docs/ui-design/ai-file-sorter.html`: static preview already updated in this turn; keep it aligned with the implemented React interaction names.
- `src-tauri/tests/provider_config.rs`, `src-tauri/tests/secret_store.rs`, `src-tauri/tests/openai_compatible_provider.rs`, `src-tauri/tests/provider_commands.rs`, and frontend provider tests: automated evidence for each boundary.

### Task 1: Define the provider contract and validation rules

**Files:**
- Create: `src-tauri/src/models/ai_provider.rs`
- Modify: `src-tauri/src/models/mod.rs`, `src-tauri/src/ai/mod.rs`
- Test: `src-tauri/tests/provider_config.rs`

**Interfaces:**
- Produces `ProviderKind::{Ollama, OpenAiCompatible}`.
- Produces `AiProviderConfig { id, kind, display_name, base_url, model, enabled }`; this type contains no secret field.
- Produces `SaveAiProviderConfigRequest { config, api_key: Option<String> }`; `api_key` is input-only and must not be serializable in any response.
- Produces `PublicAiProviderConfig { config, api_key_present: bool }`.

- [ ] Write tests rejecting an empty model, an empty base URL, credentials embedded in a URL, and non-HTTPS remote URLs.
- [ ] Write tests allowing `http://127.0.0.1`/`localhost` only for local development and allowing HTTPS external API URLs.
- [ ] Write tests proving `PublicAiProviderConfig` contains only `api_key_present`, never key material.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml provider_config` and confirm the new tests fail before implementation.
- [ ] Implement the DTOs and pure validation helpers with no network or filesystem access.
- [ ] Run the same targeted test command and confirm all provider-config tests pass.

### Task 2: Persist public settings and store the secret separately

**Files:**
- Create: `src-tauri/src/storage/migrations/008_ai_provider.sql`
- Create: `src-tauri/src/storage/ai_provider_repository.rs`
- Create: `src-tauri/src/services/secret_store.rs`
- Modify: `src-tauri/src/storage/mod.rs`, `src-tauri/src/services/mod.rs`
- Test: `src-tauri/tests/secret_store.rs`, `src-tauri/tests/ai_storage_and_tasks.rs`

**Interfaces:**
- Produces `read_active_provider(&Connection) -> Result<Option<AiProviderConfig>>`.
- Produces `save_active_provider(&mut Connection, &AiProviderConfig) -> Result<AiProviderConfig>`.
- Produces `SecretStore::get(service, account)`, `SecretStore::set(service, account, value)`, and `SecretStore::delete(service, account)`.
- The production secret-store account is derived from the stable provider profile ID; SQLite stores only provider metadata and an `api_key_present`-derivable record.

- [ ] Write a migration test proving the provider table has one active profile and no `api_key`, `secret`, or token column.
- [ ] Write fake-secret-store tests for set, get, delete, missing-secret, and storage failure behavior.
- [ ] Write a regression test proving index rebuild does not delete the global provider profile or secret reference.
- [ ] Run the focused Rust tests and confirm the new tests fail before implementation.
- [ ] Add migration `008_ai_provider.sql` and repository functions using the existing app database connection.
- [ ] Implement the platform credential-store adapter behind `SecretStore`; map failures to user-safe messages that do not echo the secret.
- [ ] Run the focused Rust tests and inspect the database fixture to confirm no secret value is persisted.

### Task 3: Implement the OpenAI-compatible provider adapter

**Files:**
- Create: `src-tauri/src/ai/openai_compatible.rs`
- Modify: `src-tauri/src/ai/mod.rs`
- Test: `src-tauri/tests/openai_compatible_provider.rs`

**Interfaces:**
- Produces `OpenAiCompatibleProvider::new(config: AiProviderConfig, api_key: String) -> Result<Self, String>`.
- Implements `AiProvider::provider_id()`, `model()`, `health()`, and `analyze(&ProviderAnalysisRequest)`.
- Sends `Authorization: Bearer <key>` and JSON to `<base_url>/chat/completions`, with the existing prompt version and strict `AiSuggestionPayload` validation applied after response parsing.

- [ ] Write a local HTTP fixture test asserting the health request uses the configured endpoint and bearer header without persisting the header.
- [ ] Write an analysis fixture test asserting filename, language, text, and categories are sent in the expected request shape and the strict suggestion payload is returned.
- [ ] Write tests rejecting non-2xx responses, malformed JSON, missing choices/content, extra suggestion fields, and request timeouts.
- [ ] Write a test proving error strings contain endpoint/status context but never the API key or full request body.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml openai_compatible_provider` and confirm the tests fail before implementation.
- [ ] Implement the minimal blocking `reqwest` adapter with explicit connect/request timeouts and no streaming requirement.
- [ ] Reuse the existing `AiProvider` response validation path where possible; do not create a second suggestion schema.
- [ ] Run the targeted adapter tests and the existing Ollama provider tests.

### Task 4: Add provider resolution and safe Tauri commands

**Files:**
- Create: `src-tauri/src/services/provider_registry.rs`
- Modify: `src-tauri/src/commands/ai.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/services/mod.rs`
- Test: `src-tauri/tests/provider_commands.rs`, `src-tauri/tests/analysis_service.rs`

**Interfaces:**
- Produces `get_ai_provider_config() -> Result<PublicAiProviderConfig, AppError>`.
- Produces `save_ai_provider_config(request: SaveAiProviderConfigRequest) -> Result<PublicAiProviderConfig, AppError>`.
- Produces `test_ai_provider_connection(request: TestAiProviderRequest) -> Result<ProviderStatus, AppError>`; it performs health check only and sends no document content.
- Updates `StartAnalysisRequest` to carry the selected provider ID and `remote_content_consent: bool`; Rust resolves the provider and secret internally.

- [ ] Write command tests proving the default configuration resolves to Ollama when no external profile exists.
- [ ] Write command tests proving a remote provider is rejected when `remote_content_consent` is false before any adapter request is made.
- [ ] Write command tests proving missing credentials, disabled profiles, stale profile IDs, and provider validation failures are reported without secret material.
- [ ] Run the focused command tests and confirm they fail before implementation.
- [ ] Register the new commands in `app_builder` and keep all model calls inside Rust.
- [ ] Replace the hard-coded Ollama construction in `get_ai_provider_status` and `start_analysis_batch` with the provider registry while preserving the current model/result snapshot fields.
- [ ] Keep the existing analysis task concurrency, cancellation, content limits, fingerprinting, and result persistence unchanged.
- [ ] Run provider command tests plus the complete existing AI Rust test set.

### Task 5: Connect React configuration and remote-consent UX

**Files:**
- Create: `src/features/ai/ProviderSettingsView.tsx`, `src/features/ai/ProviderSettingsView.test.tsx`
- Modify: `src/types/ai.ts`, `src/lib/ai-api.ts`, `src/features/ai/AiPanel.tsx`, `src/features/ai/AiReviewView.tsx`, `src/features/ai/AnalysisSetupBar.tsx`, `src/features/ai/TemplateSettingsView.tsx`, related CSS
- Test: `src/features/ai/AiPanel.test.tsx`, `src/lib/ai-api.test.ts`

**Interfaces:**
- Produces frontend types matching `ProviderKind`, `AiProviderConfig`, `PublicAiProviderConfig`, and `ProviderStatus`.
- Produces `getAiProviderConfig`, `saveAiProviderConfig`, and `testAiProviderConnection` wrappers around the registered Tauri commands.
- `ProviderSettingsView` accepts public config/status and emits save/test events; it clears the API key input after a successful save and never renders a returned key.

- [ ] Write component tests for local/API switching, required API URL/model validation, masked key input, test-success/test-failure states, and the remote-content warning.
- [ ] Write `AiPanel` tests proving the analysis button is blocked until remote consent is accepted for an external provider and that local Ollama does not show the remote warning.
- [ ] Write API-wrapper tests asserting exact command names and payloads, including `remote_content_consent`.
- [ ] Run targeted Vitest tests and confirm they fail before implementation.
- [ ] Add provider settings to the existing settings view without duplicating template state or changing category-template behavior.
- [ ] Add a blocking confirmation step immediately before starting a remote analysis; explain that selected document content will be sent to the configured endpoint and show provider/model/base URL.
- [ ] Show provider/model in the AI review and result metadata, while excluding API key and raw content from the UI history.
- [ ] Keep unsupported Anthropic-specific selection visibly disabled or labeled as unavailable until its own adapter exists.
- [ ] Run targeted Vitest tests, then the full frontend test suite.

### Task 6: Synchronize documentation and complete verification

**Files:**
- Modify: `docs/PHASE_05_AI.md`, `docs/ARCHITECTURE.md`, `docs/SAFETY_MODEL.md`, `docs/ROADMAP.md`, `docs/ui-design/UI_INTERACTION_SPEC.md`, `docs/ui-design/ai-file-sorter.html`
- Test/verification: Rust and frontend test commands, manual desktop acceptance record

- [ ] Document the supported MVP protocol, credential boundary, explicit remote-consent gate, provider health states, and the fact that file operations remain local Rust operations.
- [ ] Update the static HTML preview so its labels match the implemented command and provider terminology; remove any preview option that is not yet supported by the real adapter.
- [ ] Run `git diff --check` and the repository documentation/link checks.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml` using a separate target directory if the active checkout cache is locked.
- [ ] Run the frontend test command; if dependency cleanup or missing test tooling blocks execution, record it as unverified rather than passing.
- [ ] Perform desktop acceptance with a local Ollama provider and a controlled HTTPS test endpoint: configure, test health, accept the remote-content warning, analyze one non-sensitive text file, review the result, preview the move, confirm execution, inspect history, and undo.
- [ ] Verify a denied remote-consent path produces zero remote analysis requests.
- [ ] Verify API keys are absent from SQLite, logs, UI snapshots, analysis history, and error messages.
- [ ] Stop at the verification boundary and request explicit authorization before any commit, push, or release claim.

## Execution Order

1. Tasks 1–2 establish data and secret boundaries.
2. Task 3 adds the protocol adapter behind the existing interface.
3. Task 4 routes health checks and analysis through the selected provider.
4. Task 5 exposes the behavior in React and adds the consent gate.
5. Task 6 synchronizes docs and distinguishes automated evidence from real desktop acceptance.

The HTML preview completed in this turn is design evidence only; it is not evidence that an external provider is integrated or that remote content has been sent.
