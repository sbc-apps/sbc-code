import * as React from 'react';
import { motion } from 'motion/react';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { CircleCheck } from './icons/circle-check';
import { LoaderCircle } from './icons/loader-circle';
import { CircleAlert } from './icons/circle-alert';
import type { Provider } from './bridge';

interface SplashProps {
  logo: string;
  version: string;
  provider: Provider;
  connection: 'connecting' | 'online' | 'offline';
  modelCount: number;
  workspace: { name: string; ready: boolean };
  onDone: () => void;
}

/** Shortest and longest time the splash stays on screen. It never blocks a ready UI. */
const MIN_MS = 900;
const MAX_MS = 2800;

type StepState = 'pending' | 'done' | 'warn';

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return <CircleCheck size={14} animate className="step-icon done" />;
  }
  if (state === 'warn') {
    return <CircleAlert size={14} animate className="step-icon warn" />;
  }
  return <LoaderCircle size={14} animate loop className="step-icon pending" />;
}

export function Splash(props: SplashProps) {
  const { onDone, connection } = props;
  const [elapsed, setElapsed] = React.useState(false);

  React.useEffect(() => {
    const minimum = setTimeout(() => setElapsed(true), MIN_MS);
    const maximum = setTimeout(onDone, MAX_MS);
    return () => {
      clearTimeout(minimum);
      clearTimeout(maximum);
    };
  }, [onDone]);

  React.useEffect(() => {
    if (elapsed && connection !== 'connecting') {
      const settle = setTimeout(onDone, 150);
      return () => clearTimeout(settle);
    }
    return undefined;
  }, [elapsed, connection, onDone]);

  const providerName = props.provider === 'ollama' ? 'Ollama' : 'Colibri';
  const steps: Array<{ label: string; state: StepState }> = [
    { label: 'Agent engine ready', state: 'done' },
    {
      label: connection === 'online'
        ? providerName + ' · ' + props.modelCount + ' model' + (props.modelCount === 1 ? '' : 's')
        : connection === 'offline' ? providerName + ' offline' : 'Connecting to ' + providerName,
      state: connection === 'online' ? 'done' : connection === 'offline' ? 'warn' : 'pending',
    },
    {
      label: props.workspace.ready ? 'Workspace · ' + props.workspace.name : 'No trusted workspace',
      state: props.workspace.ready ? 'done' : 'warn',
    },
  ];

  return (
    <motion.div
      className="splash"
      role="status"
      aria-label="SBC Code is starting"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      onClick={onDone}
      onKeyDown={(event) => (event.key === 'Escape' || event.key === 'Enter') && onDone()}
      tabIndex={0}
    >
      <div className="splash-glow" aria-hidden="true" />
      <div className="splash-mark">
        <motion.div
          className="splash-ring"
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1, rotate: 360 }}
          transition={{
            opacity: { duration: 0.5 },
            scale: { type: 'spring', stiffness: 180, damping: 18 },
            rotate: { duration: 5, ease: 'linear', repeat: Infinity },
          }}
        />
        <motion.img
          src={props.logo}
          alt=""
          className="splash-logo"
          initial={{ scale: 0.5, opacity: 0, filter: 'blur(10px)', rotate: -12 }}
          animate={{ scale: 1, opacity: 1, filter: 'blur(0px)', rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
        />
      </div>

      <motion.div
        className="splash-title"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.45, ease: 'easeOut' }}
      >
        <ShimmeringText
          text="SBC Code"
          duration={1.2}
          color="var(--vscode-foreground)"
          shimmeringColor="var(--sbc-accent)"
        />
      </motion.div>
      <motion.p
        className="splash-tagline"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        Local-first AI coding agent
      </motion.p>

      <ul className="splash-steps">
        {steps.map((step, index) => (
          <motion.li
            key={index}
            className={'splash-step ' + step.state}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45 + index * 0.12, duration: 0.3 }}
          >
            <StepIcon state={step.state} />
            <span>{step.label}</span>
          </motion.li>
        ))}
      </ul>

      <div className="splash-progress" aria-hidden="true">
        <motion.div
          className="splash-progress-bar"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: connection === 'connecting' ? 0.7 : 1 }}
          transition={{ duration: connection === 'connecting' ? 1.6 : 0.35, ease: 'easeOut' }}
        />
      </div>
      {props.version && <span className="splash-version">v{props.version}</span>}
    </motion.div>
  );
}
