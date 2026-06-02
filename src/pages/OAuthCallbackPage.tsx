import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/Button';

export const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing OAuth callback...');
  // Guard against React StrictMode's double-invocation of effects in dev. The BE consumes
  // the CSRF state on first use, so a second postMessage would race and report a false failure.
  // We deliberately do NOT clear the auto-close timer on unmount — under StrictMode the
  // cleanup would fire between the two effect invocations and (combined with this guard)
  // would prevent the window from ever closing.
  const dispatchedRef = useRef(false);

  useEffect(() => {
    if (dispatchedRef.current) return;
    dispatchedRef.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      const knownErrors: Record<string, string> = {
        access_denied: 'Access was denied. Please try again.',
        invalid_request: 'The authorization request was invalid.',
        invalid_client: 'OAuth client configuration error.',
        server_error: 'The authorization server encountered an error.',
        temporarily_unavailable: 'The service is temporarily unavailable. Please try again.',
      };
      setMessage(knownErrors[error] ?? 'Authorization failed. Please try again.');
      return;
    }

    if (code && state) {
      // Remove the authorization code + state from the URL immediately to prevent exposure
      // in browser history, server logs, and Referer headers.
      history.replaceState(null, '', window.location.pathname);
      try {
        // Check if opened in popup (has window.opener) or new tab
        const opener = window.opener as (Window & { closed: boolean }) | null;
        if (opener && !opener.closed) {
          // Popup case: Use postMessage to communicate with parent
          logger.info('📤 Sending code+state to parent window via postMessage');
          // targetOrigin is window.location.origin — safe because the OAuth callback route is
          // always served from the same origin as the opener window in production.
          opener.postMessage(
            { type: 'GMAIL_OAUTH_SUCCESS', code, state },
            window.location.origin
          );
        } else {
          // New tab / full-page redirect case: Use sessionStorage (cleared on tab close,
          // not readable cross-tab by XSS).
          logger.info('📤 Storing code+state in sessionStorage (no opener)');
          sessionStorage.setItem('gmail_oauth_payload', JSON.stringify({ code, state }));
        }

        setStatus('success');
        const isRedirectFlow = sessionStorage.getItem('gmail_oauth_pending_config') !== null;
        if (isRedirectFlow) {
          // Full-page redirect path — the original window is THIS one. window.close()
          // is blocked for windows not opened by script, so route back to the
          // integrations page where the Gmail card will pick up the pending result.
          setMessage('Authorization successful! Returning to integrations…');
          window.setTimeout(() => {
            window.location.href = '/settings#integrations';
          }, 800);
        } else {
          setMessage('Authorization successful! This window will close automatically.');
          window.setTimeout(() => {
            window.close();
          }, 1000);
        }
      } catch (err) {
        logger.error('Failed to communicate OAuth code:', err);
        setStatus('error');
        setMessage('Failed to save authorization code. Please try again.');
      }
    } else {
      setStatus('error');
      setMessage(
        !code ? 'No authorization code received.' : 'Missing CSRF state from authorization server.'
      );
    }
  }, [searchParams]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <div className="p-8 w-full max-w-md bg-white rounded-lg shadow-lg">
        {status === 'processing' && (
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full border-4 border-blue-600 animate-spin border-t-transparent" />
            <p className="mt-4 text-lg font-medium text-gray-700">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="flex justify-center items-center mx-auto w-16 h-16 bg-green-100 rounded-full">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="mt-4 text-lg font-medium text-gray-700">{message}</p>
            <p className="mt-2 text-sm text-gray-500">This window will close automatically.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="flex justify-center items-center mx-auto w-16 h-16 bg-red-100 rounded-full">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="mt-4 text-lg font-medium text-red-600">{message}</p>
            <Button
              onClick={() => window.close()}
              className="px-4 py-2 mt-4 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
            >
              Close Window
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
