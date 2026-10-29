<div align="center">

<img src="media/sbc-logo.png" alt="SBC logo" width="100" height="100">

# SBC Code

### Local-first AI coding agent for Visual Studio Code

**Work with your codebase. Generate files. Make targeted edits. Run approved checks.**

Connect VS Code to your own AI models through **Ollama**, **Colibri**, or a compatible OpenAI-style endpoint. SBC Code combines a lightweight coding chat with a tool-using agent that can inspect your workspace, modify source files, and report what was actually saved.

[![CI](https://github.com/sbc-apps/sbc-code/actions/workflows/ci.yml/badge.svg)](https://github.com/sbc-apps/sbc-code/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/sbc-apps/sbc-code?label=GitHub%20Release)](https://github.com/sbc-apps/sbc-code/releases/latest)
![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D%201.90-007ACC)

[**Download the latest release**](https://github.com/sbc-apps/sbc-code/releases/latest) ·
[**Quick start**](#quick-start) ·
[**Features**](#capabilities) ·
[**Configuration**](#configuration)

</div>

---

> [!IMPORTANT]
> **Development status — v0.9.0.** SBC Code is an experimental extension, not a fully verified replacement for Codex, Claude Code, or GitHub Copilot. Tool calling, code quality, and response time depend on the selected model and inference server. Automated tests cover the extension and mocked server protocols; a complete real-model VS Code compatibility matrix is not yet available.

## Why SBC Code?

A coding assistant should do more than produce snippets in a conversation. SBC Code is designed around **workspace actions with observable results**:

- **Use local models.** Switch between Ollama and Colibri without changing coding tools or transferring your Colibri API key to Ollama.
- **Work in real project files.** The Agent can inspect source, create files, and perform exact edits in a trusted local workspace.
- **See what changed.** A file receipt distinguishes **Created**, **Modified**, and **No files created or modified**. A model's written claim is never treated as proof of a successful save.
- **Control write behavior.** Automatically save workspace edits by default, or enable explicit Diff review. Terminal/test commands always require separate confirmation.
- **Recover changes.** Use in-session edit checkpoints to review and restore the most recent AI changes.
- **Stay up to date.** Check signed-off stable GitHub Releases from inside the extension and verify downloaded VSIX assets with SHA-256 before installation.

## Capabilities

| Area | Available in v0.9.0 | Notes |
| --- | --- | --- |
| **AI Chat** | Streaming chat with cancellation, selectable models, code blocks, and copy actions | Conversation is held in extension memory |
| **Agent Mode** | File discovery, workspace search, bounded reads, multi-file edits, and tool activity | Requires a trusted, single-folder local workspace |
| **Automatic file edits** | Create/edit files and verify saved content on disk | Default; can switch to manual review |
| **Exact patching** | Unique, literal find/replace snippets with overlap and stale-source checks | Useful for targeted changes to existing files |
| **Small-model fallback** | Limited generation-to-file flow for an explicit single-file request | Does not replace reliable multi-step tool calling |
| **VS Code Problems** | Read diagnostics and request fixes for an active file | Uses VS Code language-service diagnostics |
| **Editor actions** | Explain Selection, Edit Selection, and Fix Current File Diagnostics | Available through commands/context menus |
| **Context** | Attach selected code, up to three files, or reference `@file(path)` | Attachments are explicit and size-limited |
| **Inline completion** | Optional AI ghost-text suggestions | Experimental; disabled by default |
| **Undo** | In-session, conflict-checked restore of recent AI edits | Not a substitute for Git/version control |
| **Verification** | Approved test/build commands, GitHub Actions CI, versioned VSIX releases | No unrestricted autonomous terminal access |

### How the agent works

```text
Your request in VS Code
          |
          v
   SBC Code Chat / Agent
          |
          v
 Ollama / Colibri / compatible model server
          |
          v
 Agent tools (trusted workspace only)
          |
          +-- list / search / read source
          +-- inspect VS Code diagnostics
          +-- propose exact patches or files
          +-- run allowlisted checks (with confirmation)
          |
          v
 VS Code WorkspaceEdit -> save -> verify
          |
          v
 Created / Modified receipt + session Undo
```

The inference service receives the prompts and tool-result context necessary for the request. Source files are not magically private when you select a remote endpoint; review the [privacy model](#privacy-and-security) before using one.

## Quick start

### 1. Install the extension

Download the current `sbc-code-X.Y.Z.vsix` from the [official Releases page](https://github.com/sbc-apps/sbc-code/releases/latest).

In Visual Studio Code:

1. Open **Extensions**.
2. Select **More Actions (…) → Install from VSIX…**.
3. Choose the downloaded `.vsix` file.
4. Run **Developer: Reload Window** if prompted.

You do not need Node.js to install the prebuilt VSIX. Node.js is needed for building from source.

### 2. Open your workspace

Use **File → Open Folder…** and select the project directory you want SBC Code to work in. Trust it only if you trust its contents. The SBC Code panel displays the active workspace and offers **Open Folder** when none is ready.

> Agent file operations currently require **one trusted local workspace folder**. Multi-root and remote workspace support are not implemented.

### 3. Connect a model provider

In the **SBC Code** panel, choose a **Provider**, refresh the available models, and select a model.

| Provider | Default endpoint | Model discovery |
| --- | --- | --- |
| **Ollama (Local)** | `http://127.0.0.1:11434` | Native `GET /api/tags` |
| **Colibri / Compatible** | `http://127.0.0.1:8000/v1` | OpenAI-compatible `GET /v1/models` |

The chat, inline completion, and Agent use the selected provider. Advanced Agent workflows work best with a **coding model that supports tool calling**, not just conversational text generation.

### 4. Ask SBC Code to do something

**Create a file:**

```text
Create a complete, responsive calculator website in index.html
inside the current workspace. Save the actual file, then tell me
which files were created or modified.
```

**Modify existing code:**

```text
Inspect src/app.ts. Improve its error handling without changing
unrelated behavior, and run the available checks if I approve.
```

**Investigate errors:**

```text
Read the current VS Code Problems for this file, identify the
underlying causes, and apply focused corrections.
```

With **Agent mode** on, successful writes appear in the file receipt and can be opened directly from the sidebar. If the receipt says **No files created or modified**, no successful save was confirmed—even if the model wrote code or claimed it created a file.

## Model providers

### Ollama

Install [Ollama](https://ollama.com/) and pull a model that suits your hardware and task:

```bash
ollama pull qwen3-coder
ollama list
```

Ollama normally runs as a background service. If it is not already running, start it with:

```bash
ollama serve
```

Choose **Ollama (Local)** in SBC Code. The extension uses Ollama's native tags endpoint to discover installed models and the OpenAI-compatible `/v1/chat/completions` endpoint for chat, streaming, and supported tools. Model support for tool calls varies; a general-purpose model may answer with code instead of invoking the editing tools.

For Ollama on another machine, change `sbcCode.ollamaBaseUrl`. The extension blocks unencrypted remote HTTP by default; use HTTPS when possible.

### Colibri and compatible servers

[Colibri](https://github.com/JustVugg/colibri) is a local inference engine. Follow its upstream instructions to install and run a supported model:

```bash
git clone https://github.com/JustVugg/colibri.git
cd colibri
./start-here.sh
```

In SBC Code, choose **Colibri / Compatible** and configure `sbcCode.baseUrl` if your server uses a different address. The default is `http://127.0.0.1:8000/v1`. Other OpenAI-compatible servers may work, but compatibility depends on their chat, streaming, and tool-call implementations.

If your compatible endpoint requires an API key, use **SBC Code: Set API Key**. The key is stored in VS Code **SecretStorage** rather than plain-text extension settings. A Colibri API key is not forwarded to the Ollama provider.

## Chat, Agent and editing policies

### Chat vs Agent

**Chat** is for explanations, questions, and generated text. A code block in a chat response is **not** a newly created file.

**Agent** can invoke workspace tools, including file writes. Agent mode is enabled by default for new conversations, but a trusted local folder must be open before it can work on source files.

### Automatic vs review mode

The default is **Automatic**:

```json
{
  "sbcCode.agentEditMode": "automatic"
}
```

The Agent can apply and save changes within the trusted workspace without requesting approval for every file. The extension validates paths and checks editor content before editing. **This is a powerful setting:** review file receipts, test generated code, and keep your project under version control.

If you want to inspect each proposed change first:

```json
{
  "sbcCode.agentEditMode": "review"
}
```

Review mode opens a VS Code Diff and requires **Approve File** before an edit. The editing policy applies to Agent edits and **Edit Selection**. Neither mode grants silent execution of terminal commands.

### Tools and practical limits

The current Agent toolset includes:

| Tool | Purpose |
| --- | --- |
| `list_files` | Find project file paths |
| `search_workspace` | Search text in workspace files |
| `read_file` | Read a file or a specified line range |
| `get_diagnostics` | Inspect VS Code Problems |
| `propose_patch` | Apply exact, non-overlapping source replacements |
| `propose_edits` | Create files or replace a complete, previously read file |
| `run_checks` | Run an allowlisted check after user confirmation |

The Agent is deliberately bounded: **up to five model rounds and ten tool executions per request**. A file-edit proposal supports **up to four files**, and exact patching supports **up to eight snippets per file**. Source-file reads are limited to **512 KiB per file**, with **18,000 characters** and **250 lines** per requested window. Large tasks may need to be split across prompts.

When a model does not produce valid tool calls, SBC Code has a limited fallback for certain **explicit single-file creation** requests, including a complete HTML file. It does not guarantee full multi-file project generation from a small model.

### Undo and recovery

Use **Undo edit** in the sidebar or **SBC Code: Restore Last AI Edit** in the Command Palette. The extension previews the proposed restoration and asks for confirmation. It refuses to restore over later modifications that do not match the recorded AI result.

Checkpoints exist only for the current VS Code extension session, retaining up to **five recent edit batches** subject to a size budget. They are not durable backups; use Git for reliable project history.

## Context and diagnostics

You can attach context without indexing or uploading your entire repository automatically:

- **Attach selection:** send the code currently selected in the editor.
- **+ File:** attach up to **three** source files.
- **`@file(src/path.ts)`:** explicitly reference a file in a request.
- **Fix problems:** send the current editor's existing VS Code diagnostics to the Agent for investigation.

Attachments are limited to **8,000 characters per file** and **16,000 characters combined**. Attached file content is provided for that request rather than automatically included in every later turn. Agent tools can inspect other permitted files when needed in Agent mode.

Diagnostic results are capped and sourced from VS Code; merely reading Problems does **not** run TypeScript, ESLint, or another compiler. The Agent may request an approved check separately.

## Updates and releases

SBC Code is distributed through [GitHub Releases](https://github.com/sbc-apps/sbc-code/releases), not through a claimed Marketplace listing.

- The extension checks for newer **stable** GitHub Releases shortly after startup and then approximately every **six hours**.
- A notification offers **Install Update**, **View Release**, or **Later**.
- **Install Update** downloads the official versioned VSIX, verifies its SHA-256 digest and expected size, and invokes VS Code's extension installer.
- Installing an update requires your action. VS Code may need a window reload to activate it.
- Run **SBC Code: Check for Updates** whenever you want to check manually.

Automatic notifications can be disabled with `sbcCode.updateNotifications`; manual checks continue to work. An internet connection is required to check GitHub Releases, even when inference is fully local.

For each new package version, successful CI on the trusted `main` branch triggers the release workflow to build and publish a VSIX with a checksum file on SBC's self-hosted GitHub Actions runners.

## Configuration

Configure SBC Code through **Settings → Extensions → SBC Code** or your VS Code settings JSON.

| Setting | Default | Description |
| --- | --- | --- |
| `sbcCode.provider` | `colibri` | Default provider; sidebar selection is also stored in extension state |
| `sbcCode.baseUrl` | `http://127.0.0.1:8000/v1` | Colibri / OpenAI-compatible API base |
| `sbcCode.ollamaBaseUrl` | `http://127.0.0.1:11434` | Ollama server origin |
| `sbcCode.model` | empty | Optional fixed Colibri model ID |
| `sbcCode.ollamaModel` | empty | Optional fixed Ollama model name |
| `sbcCode.agentEditMode` | `automatic` | `automatic` or `review` for file edits |
| `sbcCode.maxTokens` | `2048` | Maximum model output tokens per request |
| `sbcCode.temperature` | `0.2` | Model sampling temperature |
| `sbcCode.maxContextChars` | `12000` | Maximum characters from an editor selection |
| `sbcCode.inlineSuggestions` | `false` | Experimental inline code suggestions |
| `sbcCode.updateNotifications` | `true` | Periodic GitHub Release notifications |
| `sbcCode.allowInsecureRemote` | `false` | Explicitly allow non-local HTTP; not recommended |

Example Ollama configuration:

```json
{
  "sbcCode.provider": "ollama",
  "sbcCode.ollamaBaseUrl": "http://127.0.0.1:11434",
  "sbcCode.agentEditMode": "automatic",
  "sbcCode.inlineSuggestions": false
}
```

The sidebar remembers the active provider independently of User Settings. If you upgrade from a very old VSIX and settings appear unregistered, install the latest release and run **Developer: Reload Window**.

## Privacy and security

SBC Code is **local-first, not automatically isolated from every network**.

- **Inference location is configurable.** If you select a remote model endpoint, prompts and source snippets used by Agent tools may be transmitted to that endpoint. Localhost defaults keep model requests on your own machine.
- **Explicit workspace trust.** File-editing tools require one trusted local workspace and reject known secret paths and files resolving outside the workspace, including symlink escapes.
- **Constrained execution.** Only an allowlist of project checks is available, and every check requires confirmation. Project scripts can still execute arbitrary code once you approve them.
- **No unprompted repository upload.** Chat uses explicit attachments; Agent-mode tools can search/read permitted project files to satisfy the request.
- **Credential handling.** An optional Colibri-compatible server key is stored in VS Code SecretStorage, and is not forwarded to Ollama.
- **Update verification.** The updater checks official release metadata, the VSIX file size, and SHA-256 before installing.
- **No built-in analytics or telemetry are included** in the extension's current implementation. GitHub update checks still contact GitHub.

Automatic file editing can modify your source code, so use version control, inspect results, and test changes before deploying. Never treat model-generated code as automatically secure or correct.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| **No files created or modified** | Confirm Agent mode, a trusted local folder, and a model that can use tools or generate a supported single-file fallback |
| **Ollama is unavailable** | Check `ollama list`, whether the server is running, and `sbcCode.ollamaBaseUrl` |
| **No models in the picker** | Pull or start a model, then select **Refresh Models** |
| **Provider setting not registered** | Install the current VSIX and run **Developer: Reload Window** |
| **Agent does not complete a large task** | Split work into smaller requests; tool rounds, file counts, and context windows are bounded |
| **Inline suggestions are missing** | Enable `sbcCode.inlineSuggestions` and ensure a model is selected; CPU inference can be slow |
| **Update notification is missing** | Check `sbcCode.updateNotifications`, internet access, and **SBC Code: Check for Updates** |
| **An edit cannot be restored** | In-session checkpoints may have expired, or the file changed after the AI edit; use Git to recover earlier versions |

For a reproducible problem, please open an [issue](https://github.com/sbc-apps/sbc-code/issues) with the installed extension version, provider, model name, reproduction steps, and relevant sanitized logs. **Do not paste API keys or private project source into public issues.**

## Development

### Prerequisites

- **Visual Studio Code 1.90+**
- **Node.js 20+** for the current build tooling
- A running model server only for manual inference tests

```bash
git clone https://github.com/sbc-apps/sbc-code.git
cd sbc-code

npm install
npm run check
npm test
npm run package
```

Use **F5** in VS Code to launch the Extension Development Host. The `npm run package` command produces an installable `.vsix` file.

For a manually started Colibri server, a lightweight transport smoke test is available:

```bash
COLIBRI_BASE_URL=http://127.0.0.1:8000/v1 npm run smoke:colibri
npm run smoke:colibri -- --tools
```

Set `COLIBRI_MODEL` to target a particular installed model. The smoke test uses a fixed prompt and does not read workspace files.

### Continuous integration and releases

The [CI workflow](https://github.com/sbc-apps/sbc-code/actions/workflows/ci.yml) runs TypeScript checks, Node tests, script checks, and VSIX packaging on SBC self-hosted runners. Pull requests from forks do not run untrusted code on those runners. A successful trusted `main` CI run can trigger the [Release workflow](https://github.com/sbc-apps/sbc-code/actions/workflows/release.yml) for a new version.

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Project scope

SBC Code is being developed as a capable, self-hosted-model coding assistant. Features such as durable conversation persistence, advanced repository indexing, multi-root/remote workspaces, arbitrary shell automation, automatic Git commits, and production-grade parity with commercial agent products are **not yet available**.

The repository's current package manifest is marked `UNLICENSED`. Public source visibility does not, by itself, grant a general reuse or redistribution license.

---

<div align="center">

**SBC Code — Built for developers who want direct control over where their AI runs.**

Designed & built by **[SBC](https://sbc.om/)**

[Releases](https://github.com/sbc-apps/sbc-code/releases) · [Issues](https://github.com/sbc-apps/sbc-code/issues) · [Changelog](CHANGELOG.md)

</div>
