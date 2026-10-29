import { ModelProvider } from './modelProviders';

/**
 * Provider selection is owned by the extension rather than the VS Code settings
 * writer. A manually installed VSIX may temporarily run with stale configuration
 * metadata; switching backends must not fail with "not a registered configuration".
 */
export const PROVIDER_STATE_KEY = 'sbcCode.activeProvider';
let activeProvider: ModelProvider | undefined;

export function validProvider(value: unknown): ModelProvider | undefined {
  return value === 'ollama' || value === 'colibri' ? value : undefined;
}

export function initializeProvider(savedValue: unknown, configuredValue: unknown): ModelProvider {
  activeProvider = validProvider(savedValue) ?? validProvider(configuredValue) ?? 'colibri';
  return activeProvider;
}

export function selectProvider(value: ModelProvider): ModelProvider {
  activeProvider = value;
  return value;
}

export function effectiveProvider(configuredValue: unknown): ModelProvider {
  return activeProvider ?? validProvider(configuredValue) ?? 'colibri';
}
