import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Never let a SW trap Vite HMR /src modules during local development —
    // that was serving a stale Film Room and hiding the AI coach UI.
    if (import.meta.env.DEV) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      if (typeof caches !== 'undefined') {
        void caches.keys().then((keys) => {
          for (const key of keys) void caches.delete(key);
        });
      }
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal — the app works fine without the cache layer, it just
      // won't survive a dropped connection on repeat visits.
    });
  });
}
