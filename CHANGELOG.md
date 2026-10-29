# Changelog

## 1.0.0 — animated sidebar, splash screen and automatic updates

### Interface
- Rebuild the sidebar in React with [Animate UI](https://animate-ui.com) and Motion: animated icons, sliding provider switch, live connection indicator, theme-aware styling and reduced-motion support.
- Add an animated splash screen with live startup checks (engine, provider/model count, workspace). It closes as soon as the server responds, at most 2.8 s; skip with click/Enter/Esc or disable with `sbcCode.showSplash`.
- Render replies as safe Markdown (headings, lists, inline code, code blocks with copy) without ever interpreting model output as HTML.
- Show an Agent activity timeline, clickable Created/Modified file receipts, an update banner and starter suggestions.

### Automatic updates
- New `sbcCode.autoUpdate` setting: `install` (default) downloads, verifies (SHA-256 + size) and installs new stable releases in the background, then offers to reload; `notify` and `off` are also available.
- Activate on startup so checks run without opening the sidebar; re-check on window focus after sleep.
- Use ETag conditional requests (304 responses do not consume GitHub API rate limit) and coordinate checks/installs across VS Code windows.
- Announce the new version after reload and remove stale downloaded VSIX files.
- `sbcCode.updateNotifications` is deprecated; `false` still disables checks when `autoUpdate` is unset.

### Performance
- Coalesce streamed tokens (~40 webview updates/s instead of one per token).
- Inline suggestions: typing-pause debounce, cancellation of superseded requests, LRU result cache, no full-document reads per keystroke.
- Configurable Agent budget with `sbcCode.agentMaxSteps` (default 8, previously fixed at 5 steps / 10 tools).
- Fix the `maxTokens` fallback to match the documented 2048 default.

### Engineering
- Publish a version-less `sbc-code.vsix` with every release so https://github.com/sbc-apps/sbc-code/releases/latest/download/sbc-code.vsix always installs the newest version.
- Bundle the webview with esbuild; commit `package-lock.json` and use `npm ci` in CI and releases.
- Add tests for update policy, completion cache and Markdown rendering (61 tests).
- Add THIRD_PARTY_NOTICES.md.


## 0.9.0 — autonomous, verified on-disk source editing

- Automatically apply and save workspace file edits in trusted local projects by default; no repeated Approve File prompts.
- Preserve optional manual Diff review via `sbcCode.agentEditMode: "review"`.
- Save new and modified files to disk and verify their contents before emitting Created / Modified receipts.
- Support creating files in new nested directories, while retaining workspace/symlink/secret restrictions.
- Add a constrained single-file generation fallback for smaller Ollama models that output complete source without tool calls.
- Make Edit Selection save automatically and persist Undo restores to disk.
- Keep terminal/test command execution permission-gated and checkpoints available for rollback.


## 0.8.0 — verified Agent file operations

- Enable Agent mode by default for new SBC Code conversations. Chat mode remains available for read-only questions.
- Show the actual trusted workspace folder, or **Open Folder** when no local folder is selected.
- Provide per-request **Created / Modified / No files changed** receipts derived only from approved, successful WorkspaceEdit tool responses.
- Report denied or failed edit attempts instead of taking the language model's "file created" claims at face value.
- Reinforce the Agent's tool instructions to use propose_edits to create files and never confuse generated HTML with saved files.
- Add regression tests for execution-evidence-driven write receipts.


## 0.7.1 — provider settings registration compatibility

- Fix the "sbcCode.provider is not a registered configuration" failure when switching model providers.
- Store provider selection in VS Code extension global state instead of writing to User Settings.
- Preserve manual provider changes from settings.json, independent model preferences and Colibri/Ollama endpoints.
- Add tests for provider state selection and the settings contribution in package.json.


## 0.7.0 — Ollama provider

- Add Ollama as a first-class provider in the SBC Code sidebar, alongside Colibri.
- Discover installed Ollama models through `/api/tags`; use the OpenAI-compatible `/v1/chat/completions` for Chat, Streaming, Agent tools and inline completions.
- Persist provider choice and model selection separately for each backend.
- Give Ollama its own configurable URL and optional model override.
- Exclude the unsupported `tool_choice` parameter in Ollama Agent requests.
- Keep the Colibri API key isolated from Ollama and retain local-first endpoint security.
- Add native Ollama endpoint parsing tests and HTTP integration tests against an Ollama-shaped local server.


## 0.6.1 — official SBC icon

- Use the original SBC organization logo as the VSIX/extension listing icon (`media/sbc-logo.png`).
- Replace the Activity Bar's generic code icon with the official SBC SVG mark (`media/sbc-code.svg`).
- Add a packaging regression test to verify that the logo asset matches the approved SBC source.


## 0.6.0 — GitHub Releases and updates

- Automatically publish stable GitHub Releases from successful trusted main-branch CI using SBC self-hosted runners.
- Attach versioned VSIX and a SHA-256 checksum file; avoid overwriting published releases.
- Check for new stable releases on startup, every six hours, or via **Check for Updates**.
- Notify once per release, with **Install Update**, **View Release**, and **Later** actions.
- Verify the official VSIX asset's SHA-256 digest and size before installing with VS Code's built-in VSIX installer.
- Add optional update notifications setting and updater regression tests.


## 0.5.0 — development

- Add a read-only `get_diagnostics` Agent tool for TypeScript, ESLint and other VS Code Problems within the trusted workspace.
- Add a Fix Current File Diagnostics command, editor context action and sidebar shortcut to request reviewed Agent fixes.
- Bound diagnostic reporting to avoid unnecessarily large local-model prompts and exclude secret/out-of-workspace paths.
- Add HTTP integration tests using a local Colibri-compatible mock server for models, chat, streaming, tool calls and failures.
- Add an optional real-server Colibri smoke script, including a no-execution tool protocol probe.
- Keep existing diff review, approval, checkpoint and rollback protections.


## 0.4.0 — development

- Add `propose_patch` to make exact, reviewable multi-file source edits without returning complete file contents.
- Reject ambiguous, overlapping, stale, unseen and no-op snippets; keep existing diff approval and undo checkpoints.
- Add `read_file` line windows (1-based, 250 lines and 18,000-character response limit) for files up to 512 KiB.
- Include unsaved VS Code text in Agent reads and check read version before patching.
- Require complete current reads before the model may replace an existing entire file.
- Add regression tests for exact patch matching, overlaps, line endings and range bounds.


## 0.3.0 — development

- Add a session-only checkpoint store for approved agent and selection edits.
- Support one-command, diff-previewed restoration of the last AI edit.
- Refuse to overwrite files modified after the edit, and require explicit confirmation before deleting new files.
- Add Command Palette and sidebar controls, and size-bounded checkpoint tests.

## 0.2.0 — development

- Attach up to three explicitly selected workspace files to one prompt, or use `@file(relative/path)` references.
- Enforce per-file and combined source-context limits, path and symlink protection, and explicit-only file transfer.
- Display a tool activity timeline with thinking rounds, completion/decline/error status.
- Render fenced code blocks safely with copy-code actions, without accepting model-supplied HTML.
- Keep attached source code out of subsequent chat history to reduce accidental data reuse.
- Add tests for file references, context bounds and tool status handling.

## 0.1.0 — initial development version

- Local Colibri / OpenAI-compatible chat with streaming output and cancellation.
- Initial agent mode with workspace file discovery/search/read, reviewed multi-file edits and allowlisted approval-gated checks.
- Opt-in, throttled inline ghost-text suggestions.
- Model discovery, selection, and persisted model preference.
- Explicit attachment of selected source text.
- Explain Selection command.
- Edit Selection command with a full-document diff preview and explicit approval.
- API key stored in VS Code SecretStorage.
- Local-first connection defaults, remote HTTP protection, tests, and CI.

This is an early development release. This is an experimental agent foundation, not feature parity with mature commercial coding agents. No autonomous shell execution, background indexing, deployments or automatic Git changes.
