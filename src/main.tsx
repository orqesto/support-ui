import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DOMPurify from 'dompurify';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import './styles/tiptap.css';
import App from './App.tsx';
import { ThemeProvider } from './contexts/ThemeContext';
import { startSessionRenewal } from './lib/sessionRenewal';

// Force rel="noopener noreferrer" and target="_blank" on every anchor tag sanitized by DOMPurify.
// Guard prevents duplicate registration on HMR reloads.
if (!DOMPurify.isSupported || !(DOMPurify as { _anchorHookRegistered?: boolean })._anchorHookRegistered) {
  (DOMPurify as { _anchorHookRegistered?: boolean })._anchorHookRegistered = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('target', '_blank');
    }
  });
}

// Renew the access token on a timer rather than letting a background poller discover its
// death with a 401. Started before render so a tab restored into an authenticated session
// schedules immediately.
startSessionRenewal();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
