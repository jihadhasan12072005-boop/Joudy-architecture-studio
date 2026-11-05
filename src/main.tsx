import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts: bundled with the app and cached offline by the service
// worker — no Google Fonts / CDN request (important for unreliable networks).
import '@fontsource/ibm-plex-sans-arabic/300.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import './styles/app.css';
import './styles/print.css';
import { App } from './App';
import { initServiceWorker } from './components/UpdateBanner';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initServiceWorker();
if (navigator.storage?.persist) {
  // Ask the browser not to evict our IndexedDB data under storage pressure.
  navigator.storage.persisted().then((p) => {
    if (!p) void navigator.storage.persist();
  });
}
