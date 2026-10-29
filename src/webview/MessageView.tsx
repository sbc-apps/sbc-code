import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AnimateIcon } from '@animate-ui/react/icons';
import { parseMarkdown, type Block, type Inline } from '../messageMarkdown';
import { post } from './bridge';
import type { Activity, Message } from './state';
import { Bot } from './icons/bot';
import { Check } from './icons/check';
import { CircleAlert } from './icons/circle-alert';
import { CircleCheck } from './icons/circle-check';
import { Copy } from './icons/copy';
import { LoaderCircle } from './icons/loader-circle';
import { X } from './icons/x';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <AnimateIcon animateOnHover asChild>
      <button
        type="button"
        className="ghost-button small"
        title={label}
        aria-label={label}
        onClick={() => {
          post({ type: 'copy', text });
          setCopied(true);
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copied ? 'done' : 'copy'}
            className="icon-swap"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </motion.span>
        </AnimatePresence>
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </AnimateIcon>
  );
}

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((item, index) => {
        switch (item.kind) {
          case 'code':
            return <code key={index} className="inline-code">{item.text}</code>;
          case 'strong':
            return <strong key={index}>{item.text}</strong>;
          case 'em':
            return <em key={index}>{item.text}</em>;
          default:
            return <React.Fragment key={index}>{item.text}</React.Fragment>;
        }
      })}
    </>
  );
}

const CodeBlock = React.memo(function CodeBlock({ block }: { block: Extract<Block, { kind: 'code' }> }) {
  return (
    <section className="code-panel">
      <header className="code-header">
        <span className="code-language">{block.language || 'code'}</span>
        {block.complete && <CopyButton text={block.code} label="Copy code" />}
      </header>
      <pre><code>{block.code}{!block.complete && <span className="caret" aria-hidden="true" />}</code></pre>
    </section>
  );
});

function Blocks({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseMarkdown(text), [text]);
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'code':
            return <CodeBlock key={index} block={block} />;
          case 'heading': {
            const Tag = (['h3', 'h3', 'h4', 'h5'] as const)[block.level];
            return <Tag key={index}><Inlines items={block.inlines} /></Tag>;
          }
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag key={index}>
                {block.items.map((item, itemIndex) => <li key={itemIndex}><Inlines items={item} /></li>)}
              </Tag>
            );
          }
          case 'quote':
            return <blockquote key={index}><Inlines items={block.inlines} /></blockquote>;
          default:
            return <p key={index}><Inlines items={block.inlines} /></p>;
        }
      })}
    </>
  );
}

function ActivityIcon({ state }: { state: Activity['state'] }) {
  switch (state) {
    case 'done':
      return <CircleCheck size={13} className="activity-icon done" />;
    case 'error':
      return <CircleAlert size={13} className="activity-icon error" />;
    case 'declined':
      return <X size={13} className="activity-icon declined" />;
    default:
      return <LoaderCircle size={13} animate loop className="activity-icon running" />;
  }
}

function Timeline({ activities }: { activities: Activity[] }) {
  if (!activities.length) {
    return null;
  }
  return (
    <ol className="timeline" aria-label="Agent activity">
      <AnimatePresence initial={false}>
        {activities.map((activity) => (
          <motion.li
            key={activity.key}
            layout="position"
            className={'timeline-row ' + activity.state}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
          >
            <ActivityIcon state={activity.state} />
            <span className="timeline-label">{activity.label}</span>
            {activity.state !== 'thinking' && activity.state !== 'running' && (
              <span className="timeline-result">{activity.state}</span>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

export const MessageView = React.memo(function MessageView({ message }: { message: Message }) {
  const assistant = message.role === 'assistant';
  return (
    <motion.article
      className={'message ' + message.role}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      {assistant && (
        <header className="message-header">
          <span className="avatar"><Bot size={14} animate={message.streaming} loop={message.streaming} /></span>
          <span className="message-author">SBC Code</span>
          {message.mode && <span className="badge">{message.mode}</span>}
        </header>
      )}
      {assistant && <Timeline activities={message.activities} />}
      <div className="message-content">
        {message.text
          ? <Blocks text={message.text} />
          : message.streaming && <span className="typing" aria-label="Generating"><i /><i /><i /></span>}
      </div>
      {assistant && !message.streaming && message.text && (
        <footer className="message-actions">
          <CopyButton text={message.text} label="Copy response" />
        </footer>
      )}
    </motion.article>
  );
});
