import * as vscode from 'vscode';
import { ColibriClient } from './colibriClient';
import { ChatViewProvider } from './chatView';
import { AgentTools } from './agentTools';
import { AgentRunner } from './agentRunner';
import { captureSelection, readSettings } from './config';
import { EditSelectionController } from './editSelection';
import { registerInlineCompletion } from './inlineCompletion';
import { EditCheckpoints } from './editCheckpoints';
import { ReleaseUpdates } from './releaseUpdates';
import { PROVIDER_STATE_KEY, initializeProvider, selectProvider } from './providerSelection';
import { validProvider } from './providerSelection';

const SECRET_KEY = 'sbcCode.apiKey';

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'AbortError' ? 'Request cancelled.' : error.message;
  }
  return String(error);
}

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('sbcCode');
  initializeProvider(
    context.globalState.get<string>(PROVIDER_STATE_KEY),
    config.get<string>('provider', 'colibri'),
  );

  const client = new ColibriClient(
    () => {
      const settings = readSettings();
      return {
        baseUrl: settings.baseUrl, provider: settings.provider,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        allowInsecureRemote: settings.allowInsecureRemote,
      };
    },
    () => Promise.resolve(context.secrets.get(SECRET_KEY)),
  );

  const releaseUpdates = new ReleaseUpdates(context);
  context.subscriptions.push(releaseUpdates);
  const checkpoints = new EditCheckpoints(context);
  const agentTools = new AgentTools(context, checkpoints);
  const agent = new AgentRunner(client, agentTools);
  const chat = new ChatViewProvider(context, client, agent, releaseUpdates);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
  const edits = new EditSelectionController(client, () => chat.getModel(), checkpoints, context);
  registerInlineCompletion(context, client, () => chat.getModel());

  function register(command: string, callback: () => Promise<void>): void {
    context.subscriptions.push(vscode.commands.registerCommand(command, async () => {
      try {
        await callback();
      } catch (error) {
        const message = errorMessage(error);
        if (message !== 'Request cancelled.') {
          void vscode.window.showErrorMessage('SBC Code: ' + message);
        }
      }
    }));
  }

  register('sbcCode.openChat', async () => {
    await vscode.commands.executeCommand('sbcCode.chatView.focus');
  });
  register('sbcCode.refreshModels', () => chat.refreshModels());
  register('sbcCode.checkForUpdates', () => releaseUpdates.check(true));
  register('sbcCode.selectModel', () => chat.chooseModel());
  register('sbcCode.editSelection', () => edits.run());
  register('sbcCode.restoreLastEdit', () => checkpoints.restoreLast());
  register('sbcCode.fixDiagnostics', () => chat.fixCurrentFileDiagnostics());
  register('sbcCode.explainSelection', async () => {
    const selection = captureSelection(vscode.window.activeTextEditor, readSettings().maxContextChars);
    await chat.explainSelection(selection);
  });

  register('sbcCode.setApiKey', async () => {
    const key = await vscode.window.showInputBox({
      title: 'SBC Code: API Key',
      prompt: 'Enter the API key. Leave blank to remove any saved key. Colibri localhost requires no key by default.',
      placeHolder: 'API key',
      password: true,
      ignoreFocusOut: true,
    });
    if (key === undefined) {
      return;
    }
    if (!key.trim()) {
      await context.secrets.delete(SECRET_KEY);
      void vscode.window.showInformationMessage('SBC Code: stored API key cleared.');
    } else {
      await context.secrets.store(SECRET_KEY, key.trim());
      void vscode.window.showInformationMessage('SBC Code: API key saved in VS Code SecretStorage.');
    }
  });

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('sbcCode.provider')) {
      // Respect changes made manually in settings.json, without relying on
      // configuration writes when the provider is selected from the sidebar.
      const configured = vscode.workspace.getConfiguration('sbcCode').get<string>('provider', 'colibri');
      const provider = validProvider(configured);
      if (provider) {
        selectProvider(provider);
        void context.globalState.update(PROVIDER_STATE_KEY, provider);
      }
    }
    if (event.affectsConfiguration('sbcCode.baseUrl') ||
        event.affectsConfiguration('sbcCode.ollamaBaseUrl') ||
        event.affectsConfiguration('sbcCode.provider')) {
      void chat.onProviderSettingsChanged();
    }
  }));
}

export function deactivate(): void {
  // VS Code disposes providers when the Extension Host shuts down.
}
