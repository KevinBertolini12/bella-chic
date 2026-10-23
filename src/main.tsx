import React, {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { HelmetProvider } from 'react-helmet-async';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>,
);

// Registra o Service Worker para PWA e push notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    // Remove todos os SWs antigos que possam estar interceptando Firebase Auth
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const url = reg.active?.scriptURL || '';
      if (!url.endsWith('/sw.js')) {
        await reg.unregister();
      }
    }
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(reg => console.log('[SW] Registrado:', reg.scope))
      .catch(err => console.warn('[SW] Falha ao registrar:', err));
  });
}