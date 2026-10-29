import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { App } from './App';

const root = document.getElementById('root')!;
const logo = root.dataset.logo ?? '';

createRoot(root).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <App logo={logo} />
    </MotionConfig>
  </React.StrictMode>,
);
