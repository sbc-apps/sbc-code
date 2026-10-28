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
