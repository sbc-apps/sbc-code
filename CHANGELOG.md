# Changelog

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

# Changelog

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
