# Windows Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Tauri application easy for other Windows users to install from a versioned GitHub Release without requiring the development toolchain.

**Architecture:** Keep the existing Tauri bundle as the product boundary. A tag-triggered GitHub Actions workflow installs the locked frontend dependencies, runs the existing frontend and Rust checks, and invokes `pnpm tauri build` on `windows-latest`; the generated NSIS and MSI artifacts are attached to a draft GitHub Release. WebView2 remains Tauri's default bootstrapper mode for a small installer, while AI runtime setup remains a first-run/user documentation concern.

**Tech Stack:** Tauri 2, React/Vite, Rust, pnpm 11, GitHub Actions, NSIS/WiX.

**Spec:** User-approved “让其他电脑简单运行” release design from the current conversation.

## Global Constraints

- Support the first release target as Windows 10/11 x64.
- Do not commit signing certificates, API keys, Ollama models, or generated build directories.
- Preserve the existing local-first and AI privacy boundaries.
- Do not claim public release readiness until a clean Windows machine has completed the manual acceptance flow.
- Keep the existing untracked `src-tauri/target-api-verify/` untouched.

### Task 1: Add the release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: root `package.json` scripts, `pnpm-lock.yaml`, `src-tauri/tauri.conf.json`.
- Produces: a draft GitHub Release with Windows NSIS/MSI artifacts for tags matching `v*`.

- [x] **Step 1: Define triggers and permissions**

  Trigger on pushed tags matching `v*`, allow manual dispatch, and grant `contents: write` for release creation.

- [x] **Step 2: Define the Windows build job**

  Use `windows-latest`, checkout the repository, install Node 24 and pnpm 11, install Rust stable, cache Rust artifacts, run `pnpm install --frozen-lockfile`, run `pnpm check` and `pnpm check:rust`, then run `pnpm tauri build`.

- [x] **Step 3: Publish draft release assets**

  Use `tauri-apps/tauri-action@v1` with the existing version from `tauri.conf.json`, attach generated artifacts, and create a draft release named from the tag.

- [x] **Step 4: Validate workflow structure**

  Parse the YAML and inspect the diff; do not require a remote GitHub run in this workspace.

### Task 2: Document installation and release acceptance

**Files:**
- Modify: `README.md`
- Create: `docs/DISTRIBUTION_WINDOWS.md`

**Interfaces:**
- Consumes: existing Tauri build configuration and Phase 5 AI provider documentation.
- Produces: user-facing installation instructions and a release-owner checklist.

- [x] **Step 1: Add a “普通用户安装” section**

  Explain that users download the Windows `x64-setup.exe` from GitHub Releases, install it, and do not need Node.js, pnpm, Rust, or the source repository.

- [x] **Step 2: Explain WebView2 and AI prerequisites**

  State that the installer uses Tauri's default WebView2 bootstrapper behavior and may need internet access if WebView2 is missing. Explain that AI features require either local Ollama plus a configured model or an OpenAI-compatible provider; basic file organization remains available without AI.

- [x] **Step 3: Add the release checklist**

  Include clean-machine install, launch, scan, search, move/rename, undo, restart recovery, Chinese/long paths, uninstall, upgrade-data preservation, and AI privacy checks. Mark code signing as a separate production step.

### Task 3: Verify the deliverable locally

**Files:**
- No source changes.

**Interfaces:**
- Consumes: changed workflow and docs.
- Produces: fresh evidence for configuration validity and local packaging status.

- [x] **Step 1: Run frontend and Rust checks**

  Run `pnpm check` and `pnpm check:rust`; record the exact results.

- [x] **Step 2: Build the Windows installer**

  Run `pnpm tauri build` and inspect `src-tauri/target/release/bundle` for the generated `.exe` and `.msi`.

- [x] **Step 3: Review the worktree**

  Confirm only the intended workflow and documentation files changed, and confirm `src-tauri/target-api-verify/` remains untouched.
