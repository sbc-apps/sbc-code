import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AnimateIcon } from '@animate-ui/react/icons';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { post, type Provider } from './bridge';
import { initialState, reducer, type State } from './state';
import { Splash } from './Splash';
import { MessageView } from './MessageView';
import { Bot } from './icons/bot';
import { ChevronDown } from './icons/chevron-down';
import { CircleAlert } from './icons/circle-alert';
import { CloudDownload } from './icons/cloud-download';
import { ExternalLink } from './icons/external-link';
import { FilePlus } from './icons/file-plus';
import { FileText } from './icons/file-text';
import { FolderOpen } from './icons/folder-open';
import { Key } from './icons/key';
import { LoaderCircle } from './icons/loader-circle';
import { MessageSquareCode } from './icons/message-square-code';
import { Paperclip } from './icons/paperclip';
import { Pause } from './icons/pause';
import { RefreshCw } from './icons/refresh-cw';
import { Rocket } from './icons/rocket';
import { Send } from './icons/send';
import { Settings } from './icons/settings';
import { ShieldCheck } from './icons/shield-check';
import { Sparkles } from './icons/sparkles';
import { Terminal } from './icons/terminal';
import { Trash2 } from './icons/trash-2';
import { Undo2 } from './icons/undo-2';
import { WandSparkles } from './icons/wand-sparkles';
import { X } from './icons/x';
import { Zap } from './icons/zap';

const MAX_PROMPT = 12000;

interface IconButtonProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

function IconButton({ label, onClick, children, disabled, className }: IconButtonProps) {
  return (
    <AnimateIcon animateOnHover asChild>
      <button
        type="button"
        className={'icon-button ' + (className ?? '')}
        title={label}
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    </AnimateIcon>
  );
}

function ProviderSwitch({ value, disabled }: { value: Provider; disabled: boolean }) {
  const options: Array<{ id: Provider; label: string }> = [
    { id: 'colibri', label: 'Colibri' },
    { id: 'ollama', label: 'Ollama' },
  ];
  return (
    <div className="segmented" role="radiogroup" aria-label="Model provider">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={'segment' + (value === option.id ? ' active' : '')}
          disabled={disabled}
          onClick={() => value !== option.id && post({ type: 'setProvider', provider: option.id })}
        >
          {value === option.id && (
            <motion.span
              layoutId="provider-pill"
              className="segment-pill"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="segment-label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint, icon }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <AnimateIcon animateOnHover asChild>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        title={hint}
        className={'toggle' + (checked ? ' on' : '')}
        onClick={() => onChange(!checked)}
      >
        {icon}
        <span>{label}</span>
        <span className="toggle-track" aria-hidden="true">
          <motion.span
            className="toggle-thumb"
            layout
            transition={{ type: 'spring', stiffness: 600, damping: 32 }}
          />
        </span>
      </button>
    </AnimateIcon>
  );
}

function UpdateBanner({ state, dismiss }: { state: State; dismiss: () => void }) {
  const update = state.update;
  if (state.updateDismissed || update.state === 'idle' || update.state === 'checking') {
    return null;
  }
  let icon: React.ReactNode;
  let message: string;
  let action: React.ReactNode = null;
  switch (update.state) {
    case 'downloading':
      icon = <LoaderCircle size={15} animate loop />;
      message = 'Updating to v' + update.version + '…';
      break;
    case 'installed':
      icon = <Rocket size={15} animate />;
      message = 'v' + update.version + ' is installed';
      action = <button type="button" className="link-button" onClick={() => post({ type: 'reloadWindow' })}>Reload</button>;
      break;
    case 'updated':
      icon = <Sparkles size={15} animate />;
      message = 'Updated to v' + update.version;
      action = <button type="button" className="link-button" onClick={() => post({ type: 'openReleaseNotes' })}>What's new <ExternalLink size={12} /></button>;
      break;
    case 'available':
      icon = <CloudDownload size={15} animate />;
      message = 'v' + update.version + ' is available';
      action = <button type="button" className="link-button" onClick={() => post({ type: 'checkUpdates' })}>Install</button>;
      break;
  }
  return (
    <motion.div
      className={'banner update ' + update.state}
      role="status"
      initial={{ opacity: 0, height: 0, y: -6 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0, y: -6 }}
    >
      {icon}
      <span className="banner-text">{message}</span>
      {action}
      {update.state !== 'downloading' && (
        <button type="button" className="banner-close" aria-label="Dismiss" onClick={dismiss}><X size={13} /></button>
      )}
    </motion.div>
  );
}

const SUGGESTIONS: Array<{ icon: React.ReactNode; title: string; prompt?: string; action?: () => void }> = [
  { icon: <MessageSquareCode size={16} />, title: 'Explain this project', prompt: 'Give me a short tour of this workspace: its purpose, structure and the most important files.' },
  { icon: <WandSparkles size={16} />, title: 'Fix problems in current file', action: () => post({ type: 'fixDiagnostics' }) },
  { icon: <FilePlus size={16} />, title: 'Create a new file', prompt: 'Create a new file ' },
  { icon: <Terminal size={16} />, title: 'Add tests', prompt: 'Find the main untested module in this workspace and add focused unit tests for it.' },
];

function EmptyState({ onPrompt }: { onPrompt: (text: string) => void }) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="empty-icon"><Bot size={30} animateOnView /></div>
      <h2>What should we build?</h2>
      <p>Ask a question, or let the Agent read, edit and verify files in your workspace.</p>
      <div className="suggestions">
        {SUGGESTIONS.map((item, index) => (
          <AnimateIcon key={item.title} animateOnHover asChild>
            <motion.button
              type="button"
              className="suggestion"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * index + 0.1 }}
              onClick={() => item.action ? item.action() : onPrompt(item.prompt ?? '')}
            >
              {item.icon}
              <span>{item.title}</span>
            </motion.button>
          </AnimateIcon>
        ))}
      </div>
    </motion.div>
  );
}

function WriteReport({ state }: { state: State }) {
  const { report } = state;
  if (!report.visible) {
    return null;
  }
  const changed = report.created.length + report.modified.length > 0;
  const reason = report.mode === 'Chat'
    ? 'Chat answers in text only. Turn on Agent to create or edit files.'
    : report.attempted > 0
      ? 'No file write was confirmed. A proposal may have been declined or failed.'
      : 'No file-editing tool succeeded yet. Text output is not a saved file.';
  return (
    <motion.div
      layout
      className={'write-report' + (changed ? ' changed' : '')}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {changed ? (
        <>
          <strong>Files changed</strong>
          <div className="file-list">
            {[...report.created.map((name) => ['Created', name]), ...report.modified.map((name) => ['Modified', name])]
              .map(([kind, name]) => (
                <button key={kind + name} type="button" className="file-link" title={'Open ' + name}
                  onClick={() => post({ type: 'openFile', path: name })}>
                  {kind === 'Created' ? <FilePlus size={13} /> : <FileText size={13} />}
                  <span className="file-kind">{kind}</span>
                  <span className="file-name">{name}</span>
                </button>
              ))}
          </div>
        </>
      ) : (
        <span className="muted">{reason}</span>
      )}
    </motion.div>
  );
}

function useStickToBottom(dependency: unknown) {
  const ref = React.useRef<HTMLElement>(null);
  const pinned = React.useRef(true);
  React.useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }
    const onScroll = () => {
      pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, []);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (element && pinned.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [dependency]);
  return ref;
}

export function App({ logo }: { logo: string }) {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const [splashDone, setSplashDone] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');
  const [agentMode, setAgentMode] = React.useState(true);
  const [attachSelection, setAttachSelection] = React.useState(false);
  const textarea = React.useRef<HTMLTextAreaElement>(null);
  const lastSent = React.useRef('');

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as unknown;
      if (data && typeof data === 'object' && typeof (data as { type?: unknown }).type === 'string') {
        dispatch({ type: 'host', data: data as Record<string, unknown> });
      }
    };
    window.addEventListener('message', onMessage);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Clear the composer only once the host accepted the prompt.
  React.useEffect(() => {
    if (state.acceptedPrompt > 0) {
      setPrompt((current) => current.trim() === lastSent.current ? '' : current);
    }
  }, [state.acceptedPrompt]);

  React.useLayoutEffect(() => {
    const element = textarea.current;
    if (element) {
      element.style.height = 'auto';
      element.style.height = Math.min(element.scrollHeight, 220) + 'px';
    }
  }, [prompt]);

  const last = state.messages[state.messages.length - 1];
  const scroller = useStickToBottom(state.messages.length + ':' + (last?.text.length ?? 0) + ':' + (last?.activities.length ?? 0));
  const finishSplash = React.useCallback(() => setSplashDone(true), []);
  const showSplash = !splashDone && (!state.initialized || state.showSplash);

  const send = () => {
    const text = prompt.trim();
    if (!text || state.busy || state.pendingSubmit) {
      return;
    }
    lastSent.current = text;
    dispatch({ type: 'submit' });
    post({ type: 'send', prompt: text, attachSelection, agentMode });
  };

  const fillPrompt = (text: string) => {
    setPrompt(text);
    requestAnimationFrame(() => {
      const element = textarea.current;
      element?.focus();
      element?.setSelectionRange(text.length, text.length);
    });
  };

  const connectionLabel = state.connection === 'online'
    ? state.modelCount + ' model' + (state.modelCount === 1 ? '' : 's') + ' available'
    : state.connection === 'offline' ? 'Server offline' : 'Connecting…';

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <Splash
            key="splash"
            logo={logo}
            version={state.version}
            provider={state.provider}
            connection={state.connection}
            modelCount={state.modelCount}
            workspace={state.workspace}
            onDone={finishSplash}
          />
        )}
      </AnimatePresence>

      <main className="layout" aria-hidden={showSplash}>
        <header className="topbar">
          <div className="brand">
            <img src={logo} alt="" className="brand-logo" />
            <div className="brand-text">
              <strong>SBC Code</strong>
              {state.version && <span>v{state.version}</span>}
            </div>
          </div>
          <div className="toolbar">
            <IconButton label="Fix problems in current file (Agent)" onClick={() => post({ type: 'fixDiagnostics' })}>
              <WandSparkles size={16} />
            </IconButton>
            <IconButton label="Restore last AI edit" onClick={() => post({ type: 'restoreLastEdit' })}>
              <Undo2 size={16} />
            </IconButton>
            <IconButton label="New conversation" onClick={() => post({ type: 'clear' })}>
              <Trash2 size={16} />
            </IconButton>
            <IconButton label="Set API key" onClick={() => post({ type: 'setApiKey' })}>
              <Key size={16} />
            </IconButton>
            <IconButton label="Settings" onClick={() => post({ type: 'openSettings' })}>
              <Settings size={16} />
            </IconButton>
          </div>
        </header>

        <AnimatePresence>
          <UpdateBanner key="update" state={state} dismiss={() => dispatch({ type: 'dismissUpdate' })} />
        </AnimatePresence>

        <section className="model-bar" aria-label="Model">
          <ProviderSwitch value={state.provider} disabled={state.busy} />
          <div className="model-select">
            <span className={'dot ' + state.connection} title={connectionLabel} aria-label={connectionLabel} />
            <select
              aria-label="Model"
              value={state.selectedModel}
              onChange={(event) => event.target.value && post({ type: 'setModel', model: event.target.value })}
            >
              {state.models.length === 0 && <option value="">No models — check your server</option>}
              {state.models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
            <ChevronDown size={14} className="select-chevron" />
            <IconButton label="Refresh models" onClick={() => post({ type: 'refreshModels' })}>
              <RefreshCw size={15} animate={state.connection === 'connecting'} loop={state.connection === 'connecting'} />
            </IconButton>
          </div>
        </section>

        <div className="chips">
          {state.workspace.ready ? (
            <span className="chip ready" title="Agent workspace">
              <FolderOpen size={13} /> {state.workspace.name}
            </span>
          ) : (
            <AnimateIcon animateOnHover asChild>
              <button type="button" className="chip missing" onClick={() => post({ type: 'openFolder' })}>
                <FolderOpen size={13} /> Open Folder
              </button>
            </AnimateIcon>
          )}
          <span
            className="chip"
            title={state.editMode === 'review'
              ? 'Each Agent edit opens a diff for approval'
              : 'Agent edits are saved automatically in the trusted workspace; checkpoints allow undo'}
          >
            <ShieldCheck size={13} /> {state.editMode === 'review' ? 'Review edits' : 'Auto-save edits'}
          </span>
        </div>

        <AnimatePresence>
          {state.error && (
            <motion.div
              className="banner error"
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <CircleAlert size={15} animate />
              <span className="banner-text">{state.error}</span>
              <button type="button" className="banner-close" aria-label="Dismiss error"
                onClick={() => dispatch({ type: 'dismissError' })}><X size={13} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="messages" ref={scroller} aria-label="Conversation" aria-live="polite">
          <AnimatePresence mode="popLayout">
            {state.messages.length === 0
              ? <EmptyState key="empty" onPrompt={fillPrompt} />
              : state.messages.map((message) => <MessageView key={message.id} message={message} />)}
          </AnimatePresence>
        </section>

        <form
          className={'composer' + (state.busy ? ' busy' : '')}
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <WriteReport state={state} />
          <div className="status-line" role="status">
            {state.busy
              ? <ShimmeringText text={state.status || 'Working…'} duration={1} color="var(--vscode-descriptionForeground)" shimmeringColor="var(--vscode-foreground)" />
              : <span>{state.status}</span>}
          </div>

          <AnimatePresence initial={false}>
            {state.attachments.length > 0 && (
              <motion.div className="attachments" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                {state.attachments.map((file) => (
                  <motion.span key={file} layout className="attachment" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                    <FileText size={12} />
                    <span title={file}>{file}</span>
                    <button type="button" aria-label={'Remove ' + file} onClick={() => post({ type: 'removeFile', file })}>
                      <X size={11} />
                    </button>
                  </motion.span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="input-shell">
            <textarea
              ref={textarea}
              rows={2}
              maxLength={MAX_PROMPT}
              value={prompt}
              aria-label="Message"
              placeholder={agentMode ? 'Ask the Agent to build, fix or refactor…  (@path to attach)' : 'Ask SBC Code anything…'}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <div className="input-actions">
              <div className="input-options">
                <Toggle
                  checked={agentMode}
                  onChange={setAgentMode}
                  label="Agent"
                  hint="Agent mode can read, create and edit workspace files"
                  icon={<Zap size={13} />}
                />
                <Toggle
                  checked={attachSelection}
                  onChange={setAttachSelection}
                  label="Selection"
                  hint="Attach the current editor selection"
                  icon={<MessageSquareCode size={13} />}
                />
                <IconButton label="Attach up to 3 files" onClick={() => post({ type: 'attachFiles' })}>
                  <Paperclip size={15} />
                </IconButton>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {state.busy ? (
                  <motion.div key="stop" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                    <AnimateIcon animateOnHover asChild>
                      <button type="button" className="send-button stop" aria-label="Stop" title="Stop" onClick={() => post({ type: 'cancel' })}>
                        <Pause size={16} />
                      </button>
                    </AnimateIcon>
                  </motion.div>
                ) : (
                  <motion.div key="send" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                    <AnimateIcon animateOnHover animateOnTap asChild>
                      <button
                        type="submit"
                        className="send-button"
                        aria-label="Send"
                        title="Send (Enter)"
                        disabled={!prompt.trim() || state.pendingSubmit}
                      >
                        {state.pendingSubmit ? <LoaderCircle size={16} animate loop /> : <Send size={16} />}
                      </button>
                    </AnimateIcon>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="hint">Enter to send · Shift+Enter for a new line</div>
        </form>
      </main>
    </>
  );
}
