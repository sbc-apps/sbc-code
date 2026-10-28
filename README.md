# SBC Code

**Local-first AI coding agent for VS Code**, built by SBC. It works with [Colibri](https://github.com/JustVugg/colibri) and other OpenAI-compatible chat-completions servers.

> **Status:** 0.1.0 experimental development build. Includes an initial tool-using Agent mode, but is not yet at feature parity with Codex, Claude Code or GitHub Copilot.

## Features

- **Streaming chat** in a VS Code Activity Bar sidebar; stop a response at any time.
- **File context:** explicitly attach up to three local source files from the editor sidebar, or reference a file with `@file(src/path.ts)` in your prompt.
- **Agent activity timeline:** see thinking rounds and individual tool outcomes (done, declined or error).
- **Code responses:** fenced code blocks with per-block copy actions and plain-text rendering that does not execute model-provided HTML.
- **Agent mode:** inspect files, search the workspace, propose changes across up to four files per request, and run approved project checks.
- **Diff and approvals:** review every proposed agent file change before applying; confirm each allowed test command before execution.
- **Optional inline suggestions:** disabled by default because CPU inference may be too slow for per-keystroke completions.
- **Model discovery** from `GET /v1/models`, model picker, and persistent selection.
- **Explicit source context:** opt in to attaching the editor's selected code (never automatically sends the entire repository).
- **Explain Selection:** right-click selected code or use the Command Palette.
- **Edit Selection:** request replacement code, review a complete file diff, then explicitly apply the edit. No automatic file writes.
- **Local-first security:** localhost is the default; remote endpoints require HTTPS unless you opt into insecure remote HTTP. Optional API key stored in VS Code SecretStorage rather than workspace settings.

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

## Agent workflow

1. Open a trusted, single-folder local workspace in VS Code.
2. Select a Colibri model with tool-calling support, such as Qwen3-Coder or Qwen3.6.
3. Enable **Agent mode** above the chat input.
4. Ask the agent to locate code, inspect files, and make a small change.
5. Review each diff and select **Approve File** before the change is applied.
6. A proposed test or build runs only after **Run Once** confirmation.

Current tool limits: maximum 5 model rounds, 10 tool executions, 4 file edits in one proposal, 48 KiB file-read size, no workspace secrets, no arbitrary terminal commands, and no multi-root workspace. A file must be read by the agent before it may be edited. No automatic commits, pushes, or deployments.

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
