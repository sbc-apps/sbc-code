# SBC Code

<img src="media/sbc-logo.png" alt="SBC official logo" width="96" height="96">

**Local-first AI coding agent for VS Code**, built by SBC. Works with [Colibri](https://github.com/JustVugg/colibri), [Ollama](https://ollama.com/), and compatible local AI servers.

> **Status:** 0.9.0 experimental autonomous coding agent with automatic file writes inside a trusted workspace and optional manual review.

## Logo

The extension's visual identity uses the original SBC 227×227 PNG from [`sbc-apps/sbc-signer-extension/public/logo.png`](https://github.com/sbc-apps/sbc-signer-extension/blob/main/public/logo.png). The activity-bar SVG matches the original mark in [`sbc-apps/sbc-website/public/logo.svg`](https://github.com/sbc-apps/sbc-website/blob/main/public/logo.svg). Both are kept in `media/` and packaged into the VSIX.

## Fixing "sbcCode.provider is not a registered configuration"

Install **v0.7.1** through the GitHub Release or the in-extension update notification, then run **Developer: Reload Window** from VS Code's Command Palette. The provider selector now stores its selection in extension state rather than writing to User Settings, avoiding the error when VS Code retains older VSIX configuration metadata. If the extension still shows a previous version, uninstall its old installation, reload VS Code and reinstall the new VSIX. Verify the installed version from Extensions → SBC Code → version.

## Use Ollama as your coding model server

SBC Code supports both **Colibri** (the existing default) and **Ollama**. In the SBC Code sidebar, choose **Ollama (Local)** from the **Provider** dropdown. The model list refreshes from Ollama's native `GET /api/tags` endpoint and shows models already installed on your computer. Select a model and use Chat, Agent, code edits and optional inline completion exactly as with Colibri.

On the machine running VS Code and Ollama, install a model and start the Ollama service:

```bash
ollama pull qwen3-coder
ollama serve
```

If Ollama already runs in the background, you do not need to start `ollama serve` again. Use `ollama list` to see locally installed models. SBC Code connects to the Ollama origin at `http://127.0.0.1:11434` by default. You can change it with `sbcCode.ollamaBaseUrl`. The editor uses Ollama's OpenAI-compatible `/v1/chat/completions` for chat, streaming and tools, and `/api/tags` for model discovery. **Tool support depends on the selected Ollama model.** The extension intentionally omits the unsupported `tool_choice` request parameter when using Ollama.

The sidebar **Provider** choice is saved in VS Code extension storage (not written to `settings.json`), so switching works even when VS Code has not refreshed extension configuration metadata. You can still set `sbcCode.provider` manually in a correctly loaded extension's Settings; each provider remembers its own selected model. The legacy Colibri server URL and `sbcCode.model` setting are preserved. For Ollama use the separate `sbcCode.ollamaModel` override if required; otherwise leave it empty. **Your Colibri API key is not forwarded to Ollama.** Local Ollama does not require a key. Configuring remote HTTP Ollama requires the existing explicit `sbcCode.allowInsecureRemote` option; prefer HTTPS.

### Example VS Code settings

```json
{
  "sbcCode.provider": "ollama",
  "sbcCode.ollamaBaseUrl": "http://127.0.0.1:11434",
  "sbcCode.ollamaModel": "",
  "sbcCode.inlineSuggestions": false
}
```

Use the **Refresh Models** action after pulling a new Ollama model. Switching providers clears the current in-memory chat history to avoid mixing contexts from different backends. Existing explicit file-edit approvals, diffs, rollback and workspace protections remain in force.

## How to create a real file (instead of just generating code)

1. Open a **local folder** in VS Code via **File → Open Folder** and trust the workspace. SBC Code displays the active workspace folder above chat, or an **Open Folder** button if none is ready.
2. Keep **Agent mode** enabled in the SBC Code composer (now selected by default). The ordinary Chat mode answers questions but **cannot create or edit files**.
3. Ask the agent to create a website or new file in the active workspace, for example: `Create index.html with a complete working HTML/CSS/JS calculator`.
4. In the default **Automatic** edit mode the extension writes and saves approved-scope changes directly in the trusted workspace without requiring a click for every file. Optionally set `sbcCode.agentEditMode` to `review` in VS Code Settings if you prefer a Diff confirmation for each edit.
5. Check the **Files changed by SBC Code** receipt. It reports **Created: index.html** or **Modified: ...** only after a successful on-disk save has been verified.

If the answer includes HTML but the status says **No files created or modified**, the model only wrote chat text, or the file proposal was rejected or failed. The file does **not** exist as a result of that chat message. For explicit single-file requests, a limited fallback asks a model without functioning tool calls for complete source text and saves it through the same guarded tool. It does not guess multi-file projects or overwrite an existing file it has not read. The status comes from actual tool execution, not model-written claims like "I found a file". This is particularly important when using a local model without working tool-call support.

The receipt is per request; it summarizes the latest prompt rather than indexing your repository. Workspace trust, secure path restrictions, verified saves and undo checkpoints still apply. Set `sbcCode.agentEditMode: "review"` to require Diff approval before writing. **Terminal commands still require separate approval** even in Automatic edit mode.

## Automatic edit mode

SBC Code defaults to `"sbcCode.agentEditMode": "automatic"`. In a trusted local workspace the Agent can create and modify source files directly, persist them to disk, and report exactly what changed. The edit tools still check file paths, secret exclusions and stale source versions. You can switch to `"review"` mode in Settings to approve each diff instead. Both modes preserve session checkpoints for Undo.

The small-model fallback supports an **explicit single-file creation request**. If a local model such as Llama 3.2 fails to issue any tool call but can generate a complete HTML document, SBC Code can write it as the requested file (or `index.html` for an explicit HTML calculator). Multi-file projects require a model that reliably supports tool calling.

Source code is saved automatically; workspace scripts and terminal commands remain separately permission-gated. Automatic edits do not run builds, tests, servers or deploy anything without permission.

## Features

- **Streaming chat** in a VS Code Activity Bar sidebar; stop a response at any time.
- **File context:** explicitly attach up to three local source files from the editor sidebar, or reference a file with `@file(src/path.ts)` in your prompt.
- **Agent activity timeline:** see thinking rounds and individual tool outcomes (done, declined or error).
- **Code responses:** fenced code blocks with per-block copy actions and plain-text rendering that does not execute model-provided HTML.
- **Agent mode:** inspect files, search the workspace, read VS Code Problems, propose exact source patches or full-file changes across up to four files, and run approved project checks.
- **Exact patch editing:** replace small unique source snippets rather than rewriting the full file; reject stale, ambiguous, overlapping or unread code.
- **Diff and approvals:** review every proposed agent file change before applying; confirm each allowed test command before execution.
- **Reversible edits:** restore the most recent AI edit, including reviewed multi-file edits, after preview and confirmation. Restore refuses to overwrite later user changes.
- **Optional inline suggestions:** disabled by default because CPU inference may be too slow for per-keystroke completions.
- **Model discovery** from `GET /v1/models`, model picker, and persistent selection.
- **Explicit source context:** opt in to attaching the editor's selected code (never automatically sends the entire repository).
- **Explain Selection:** right-click selected code or use the Command Palette.
- **Edit Selection:** request replacement code, review a complete file diff, then explicitly apply the edit. No automatic file writes.
- **Local-first security:** localhost is the default; remote endpoints require HTTPS unless you opt into insecure remote HTTP. Optional API key stored in VS Code SecretStorage rather than workspace settings.

## GitHub Releases and in-editor updates

SBC Code publishes stable releases at [GitHub Releases](https://github.com/sbc-apps/sbc-code/releases). When trusted main-branch CI passes, a separate release workflow builds a `.vsix`, generates a SHA-256 checksum file, and publishes a new `vX.Y.Z` release **only when the package version is new**. Release creation and packaging use SBC's self-hosted CI runners.

**First installation:** If you previously installed SBC Code from a CI artifact, install version 0.6.0 once from GitHub Releases. Older versions do not contain the updater. In VS Code, open Extensions → More Actions → **Install from VSIX...** and choose `sbc-code-0.6.0.vsix`.

After that, the extension checks the official public GitHub Releases API shortly after startup and every six hours. It shows a notification for each new stable version. Choose **Install Update** to download the official VSIX, verify its exact SHA-256 digest and file size from GitHub release metadata, and install through VS Code's built-in extension installer. Choose **Reload Window** to activate the new version. Updates are never installed without approval.

Open the Command Palette and run **SBC Code: Check for Updates** to check at any time. Disable automatic notifications with `sbcCode.updateNotifications: false`. Manual checks remain available.

**Why a custom updater?** VS Code normally disables built-in automatic extension updates for manually installed VSIX files. Installing from a GitHub Release is separate from publishing through the Visual Studio Marketplace. The custom update check sends only a request to GitHub; it does not transmit your project files, model prompts, or workspace content.

## Requirements

- Visual Studio Code 1.90 or newer.
- Node.js 20 or newer to build the extension.
- A running Colibri server, or an OpenAI-compatible server implementing `/v1/models` and `/v1/chat/completions`.

## Start Colibri

For an installation based on [Colibri's quickstart](https://github.com/JustVugg/colibri#the-one-step-way):

```bash
git clone https://github.com/JustVugg/colibri.git
cd colibri
./start-here.sh
```

Colibri downloads a model and starts its server. It typically prints:

```text
OpenAI base URL: http://127.0.0.1:8000/v1
```

For a fast first coding experiment, consider `qwen3-coder-30b` (about 19 GB model download). Larger disk-streaming models can be very slow on CPU when coding-agent prompts are long.

## Run the extension in development

```bash
git clone https://github.com/sbc-apps/sbc-code.git
cd sbc-code
npm install
npm run check
npm test
```

Open this folder in VS Code and press **F5** to launch the Extension Development Host. Click the **SBC Code** icon in the Activity Bar. The panel discovers models from Colibri; choose one and start chatting. Enable **Agent mode** in the composer to allow the model to use workspace tools (requires a trusted single-folder local workspace and a tool-calling-capable model).

If you need to enter a model name manually, run **SBC Code: Select Model** from the Command Palette.

To build an installable VSIX:

```bash
npm run package
```

Then use VS Code → **Extensions** → **...** → **Install from VSIX...**.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `sbcCode.baseUrl` | `http://127.0.0.1:8000/v1` | Local or HTTPS-compatible API base URL |
| `sbcCode.model` | empty | Optional fixed model ID; overrides the sidebar model selection |
| `sbcCode.maxTokens` | `1024` | Maximum generated tokens |
| `sbcCode.temperature` | `0.2` | Sampling temperature |
| `sbcCode.maxContextChars` | `12000` | Limit for selected source context |
| `sbcCode.inlineSuggestions` | `false` | Optional AI ghost-text completions with throttling |
| `sbcCode.allowInsecureRemote` | `false` | Explicitly allow non-local HTTP (not recommended) |

Set an authenticated server's token with **SBC Code: Set API Key**. Leave the prompt empty to remove the saved token. Colibri does not require an API key by default.

## Attach source files for context

Use **+ File** above the chat input to select files in the current VS Code workspace. You can remove each attachment before sending. Alternatively, type `@file(src/app.ts)` in your message to explicitly include that file. Attachments are sent **only with that message** and are not cached as source text in later chat turns; reattach files for later context.

For safety and local model performance, only one trusted local workspace is supported, with a maximum of **3 files**, **8,000 characters per file** and **16,000 characters total**. Secret files, external symlink targets and binary files are blocked. The extension does not search the whole repository just to pick a file.

## Edit selection safely

1. Select code in a text editor.
2. Run **SBC Code: Edit Selection** (or right-click the selection).
3. Describe the change you need.
4. Review the VS Code diff editor.
5. Choose **Apply Change** to modify the current document. The extension refuses the change if the document changed while the model was working.

Edits remain unsaved until you save the file yourself. The model may be incorrect: always review its proposed code and run your normal tests.

## Fix VS Code Problems

Use **Fix problems** in the SBC Code sidebar, right-click in an editor and select **SBC Code: Fix Current File Diagnostics**, or open the Command Palette and run that command. The extension retrieves the current file's diagnostics from VS Code (including TypeScript/ESLint diagnostics when their language services are active) and asks the Agent to inspect relevant code and propose exact patches.

The Agent also has a read-only `get_diagnostics` tool for Problems in the trusted workspace or a specific file. Results are bounded to 40 entries with truncated diagnostic messages. Only files inside the one trusted local workspace are eligible. **No compiler or linter is executed** merely to read Problems, and proposed edits still require review and approval.

## Local Colibri HTTP compatibility tests

The development test suite starts a local HTTP server that imitates the documented Colibri API and checks model discovery, authorization, ordinary chat responses, fragmented SSE streaming, OpenAI tool calls and API error handling. This verifies the extension's transport contract but does **not** prove correct model output from a real Colibri installation. Real-model testing is still required before production release. To run a manual test against a Colibri server you have installed locally, use:

```bash
COLIBRI_BASE_URL=http://127.0.0.1:8000/v1 npm run smoke:colibri
# Optional: check tool-calling protocol (requires a compatible model)
npm run smoke:colibri -- --tools
```

You can set `COLIBRI_MODEL` to choose a specific installed model and `COLIBRI_API_KEY` if the server requires authentication. This smoke test sends a short fixed prompt, does not read your code, and does not execute model-proposed tools. It can be slow on CPU-only large models.

## Targeted Agent patches and line-range reads

The Agent now exposes `propose_patch` for targeted edits to existing files. Unlike `propose_edits`, it does not ask the model to return the entire source file. Each patch uses a **literal, exact** `find` string and a `replace` string; an empty replacement deletes just the matched snippet. A snippet must be unique, non-overlapping, and present in the source actually returned by `read_file` for the current Agent turn. All edits still use VS Code diff previews, user approval, and session-only undo checkpoints.

For larger files, `read_file` accepts an optional **1-based** line range `start_line` and `end_line`, with a maximum of 250 lines and 18,000 characters in the returned window. Its metadata reports total line count, and the source text preserves original line endings. The file itself is capped at 512 KiB. If the whole file is longer than the context limit, the model must request a smaller window before applying a patch.

Full-file replacements of existing files remain available with `propose_edits`, but now require a complete, current `read_file` result. New files can still be proposed separately. Neither path can write files without user approval. Patch batches support 1–4 files and at most 8 non-overlapping snippets per file. Only already-read source may be modified.

```json
{
  "changes": [
    {
      "path": "src/app.ts",
      "patches": [
        { "find": "const enabled = false;", "replace": "const enabled = true;" }
      ]
    }
  ]
}
```

## Restore the last AI edit

Choose **Undo edit** in the SBC Code sidebar header or run **SBC Code: Restore Last AI Edit** from the Command Palette. The extension previews each file diff and asks for explicit confirmation before restoring. If the agent created a file, restore deletes that file **only after confirmation**. If any file has changed since the AI edit, the whole restore is refused rather than overwriting the newer work.

Checkpoints exist **only in extension memory for this VS Code session**, up to five recent edit batches and 2,000,000 characters per batch. Large-file edits may exceed the checkpoint budget, in which case the editor warns you to use VS Code Undo instead. Restored files may need saving. This is not a replacement for version control.

## Agent workflow

1. Open a trusted, single-folder local workspace in VS Code.
2. Select a Colibri model with tool-calling support, such as Qwen3-Coder or Qwen3.6.
3. Enable **Agent mode** above the chat input.
4. Ask the agent to locate code, inspect files, and make a small change.
5. Review each diff and select **Approve File** before the change is applied.
6. A proposed test or build runs only after **Run Once** confirmation.

Current tool limits: maximum 5 model rounds, 10 tool executions, 4 files in one edit proposal, 512 KiB file size for bounded reads, 18,000 returned characters per read, 8 exact patch snippets per file, no workspace secrets, no arbitrary terminal commands, and no multi-root workspace. A file must be read by the agent before it may be edited. No automatic commits, pushes, or deployments.

## Privacy and limits

- Requests travel to the endpoint you configure. The default Colibri endpoint is on your own machine; changing the URL may send selected code to a different server.
- Chat does not scan the repository without consent. Agent mode can read and search allowed workspace files via tools when you enable it; the contents of tool results are sent to your configured model endpoint.
- Chat history is kept only in extension memory during the session. Attached file contents are excluded from future conversation turns; the model endpoint still receives them for the requested message. No analytics or telemetry are included.
- Selection context has a configurable character cap. Secrets may be present in files you select; review before sending.
- Model support for tools, context windows, and streaming varies. Agent mode requires compatible tool calling. It can run only an explicit allowlist of project checks with confirmation, and all code edits require review. Inline completion is experimental.
- Large MoE models streamed from disk can be slow on CPU, especially with long prompts or repeated agent loops.

## Development

```bash
npm run check
npm test
npm run watch
```

Contributions should include tests, preserve explicit approval for writes, and avoid uploading files without the user's knowledge.

**Designed & built by [SBC](https://sbc.om/).**
