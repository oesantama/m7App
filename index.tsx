import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Registrar Service Worker para PWA (Multi-plataforma Offline)
registerSW({ immediate: true });

// Fix: Import 'App' from './App' to match the App.tsx file exactly.
// The casing conflict is addressed by using uppercase and neutralizing the lowercase app.tsx.
// @ts-ignore
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

import ErrorBoundary from './components/ErrorBoundary';

const root = ReactDOM.createRoot(rootElement!);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
