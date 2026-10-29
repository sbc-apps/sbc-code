import type { Provider } from './bridge';

export type ActivityState = 'thinking' | 'running' | 'done' | 'error' | 'declined';

export interface Activity {
  key: string;
  label: string;
  state: ActivityState;
}

export interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  mode?: string;
  streaming: boolean;
  activities: Activity[];
}

export type UpdateInfo =
  | { state: 'idle' | 'checking' }
  | { state: 'downloading'; version: string }
  | { state: 'available' | 'installed' | 'updated'; version: string; releaseUrl: string };

export interface WriteReport {
  visible: boolean;
  mode: string;
  created: string[];
  modified: string[];
  attempted: number;
}

export interface State {
  initialized: boolean;
  version: string;
  showSplash: boolean;
  provider: Provider;
  models: string[];
  selectedModel: string;
  connection: 'connecting' | 'online' | 'offline';
  modelCount: number;
  status: string;
  workspace: { name: string; ready: boolean };
  editMode: 'automatic' | 'review';
  attachments: string[];
  report: WriteReport;
  error: string;
  busy: boolean;
  pendingSubmit: boolean;
  messages: Message[];
  update: UpdateInfo;
  updateDismissed: boolean;
  /** Incremented when a sent prompt is accepted, so the composer can clear itself. */
  acceptedPrompt: number;
}

export const initialState: State = {
  initialized: false,
  version: '',
  showSplash: true,
  provider: 'colibri',
  models: [],
  selectedModel: '',
  connection: 'connecting',
  modelCount: 0,
  status: 'Starting…',
  workspace: { name: 'No folder opened', ready: false },
  editMode: 'automatic',
  attachments: [],
  report: { visible: false, mode: 'Agent', created: [], modified: [], attempted: 0 },
  error: '',
  busy: false,
  pendingSubmit: false,
  messages: [],
  update: { state: 'idle' },
  updateDismissed: false,
  acceptedPrompt: 0,
};

export type Action =
  | { type: 'submit' }
  | { type: 'dismissError' }
  | { type: 'dismissUpdate' }
  | { type: 'host'; data: Record<string, unknown> };

let nextId = 1;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;

function updateLastAssistant(state: State, change: (message: Message) => Message): State {
  const index = state.messages.length - 1;
  const last = state.messages[index];
  if (!last || last.role !== 'assistant' || !last.streaming) {
    return state;
  }
  const messages = state.messages.slice();
  messages[index] = change(last);
  return { ...state, messages };
}

function applyActivity(message: Message, data: Record<string, unknown>): Message {
  const label = text(data.step, 'Agent').slice(0, 100);
  const id = typeof data.id === 'string' ? data.id : undefined;
  const activities = message.activities.slice();
  if (data.state === 'thinking') {
    // Only the latest "thinking" row stays visible; earlier ones are complete.
    const previous = activities.findIndex((item) => item.state === 'thinking');
    if (previous >= 0) {
      activities.splice(previous, 1);
    }
    activities.push({ key: 'think-' + nextId++, label, state: 'thinking' });
  } else if (data.state === 'started') {
    // The model has answered; its "thinking" step is over once a tool starts.
    const thinking = activities.findIndex((item) => item.state === 'thinking');
    if (thinking >= 0) {
      activities.splice(thinking, 1);
    }
    activities.push({ key: id ?? 'tool-' + nextId++, label, state: 'running' });
  } else if (data.state === 'finished') {
    const result: ActivityState = data.result === 'error' ? 'error' : data.result === 'declined' ? 'declined' : 'done';
    const index = id ? activities.findIndex((item) => item.key === id) : -1;
    if (index >= 0) {
      activities[index] = { ...activities[index], state: result };
    } else {
      activities.push({ key: id ?? 'tool-' + nextId++, label, state: result });
    }
  } else {
    return message;
  }
  return { ...message, activities };
}

function hostMessage(state: State, data: Record<string, unknown>): State {
  switch (data.type) {
    case 'init':
      return {
        ...state,
        initialized: true,
        version: text(data.version),
        showSplash: data.showSplash !== false,
      };
    case 'models': {
      const provider = data.provider === 'ollama' ? 'ollama' : 'colibri';
      const selected = text(data.selected);
      const models = strings(data.models);
      if (selected && !models.includes(selected)) {
        models.unshift(selected);
      }
      return { ...state, provider, models, selectedModel: selected || models[0] || '' };
    }
    case 'connection':
      return {
        ...state,
        connection: data.state === 'online' ? 'online' : data.state === 'offline' ? 'offline' : 'connecting',
        modelCount: typeof data.count === 'number' ? data.count : state.modelCount,
      };
    case 'attachments':
      return { ...state, attachments: strings(data.files) };
    case 'workspace':
      return { ...state, workspace: { name: text(data.name, 'No folder opened'), ready: data.ready === true } };
    case 'editPolicy':
      return { ...state, editMode: data.mode === 'review' ? 'review' : 'automatic' };
    case 'writeReport':
      return {
        ...state,
        report: {
          visible: true,
          mode: text(data.mode, 'Agent'),
          created: strings(data.created),
          modified: strings(data.modified),
          attempted: Number.isInteger(data.attempted) ? data.attempted as number : 0,
        },
      };
    case 'status':
      return { ...state, status: text(data.message) };
    case 'error':
      return {
        ...state,
        error: text(data.message, 'Unknown error'),
        pendingSubmit: state.pendingSubmit && state.busy,
      };
    case 'user':
      return {
        ...state,
        error: '',
        pendingSubmit: false,
        acceptedPrompt: state.acceptedPrompt + 1,
        messages: [...state.messages, {
          id: nextId++, role: 'user', text: text(data.text), streaming: false, activities: [],
        }],
      };
    case 'start':
      return {
        ...state,
        busy: true,
        status: text(data.mode, 'Chat') + ' running…',
        messages: [...state.messages, {
          id: nextId++, role: 'assistant', text: '', mode: text(data.mode, 'Chat'), streaming: true, activities: [],
        }],
      };
    case 'activity': {
      const next = updateLastAssistant(state, (message) => applyActivity(message, data));
      return { ...next, status: text(data.step, next.status).slice(0, 100) };
    }
    case 'delta':
      return updateLastAssistant(state, (message) => ({ ...message, text: message.text + text(data.text) }));
    case 'done': {
      const next = updateLastAssistant(state, (message) => ({
        ...message,
        streaming: false,
        // A cancelled or failed step should not keep spinning.
        activities: message.activities
          .filter((item) => item.state !== 'thinking')
          .map((item) => item.state === 'running' ? { ...item, state: 'error' as const } : item),
      }));
      return { ...next, busy: false, pendingSubmit: false };
    }
    case 'cleared':
      return {
        ...state,
        messages: [],
        busy: false,
        pendingSubmit: false,
        error: '',
        report: { ...initialState.report },
      };
    case 'update': {
      const version = text(data.version);
      const releaseUrl = text(data.releaseUrl);
      let update: UpdateInfo;
      switch (data.state) {
        case 'downloading':
          update = { state: 'downloading', version };
          break;
        case 'available':
        case 'installed':
        case 'updated':
          update = { state: data.state, version, releaseUrl };
          break;
        default:
          update = { state: data.state === 'checking' ? 'checking' : 'idle' };
      }
      return { ...state, update, updateDismissed: false };
    }
    default:
      return state;
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'submit':
      return { ...state, pendingSubmit: true, error: '' };
    case 'dismissError':
      return { ...state, error: '' };
    case 'dismissUpdate':
      return { ...state, updateDismissed: true };
    case 'host':
      return hostMessage(state, action.data);
  }
}
