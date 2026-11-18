import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/Button';
import {
  announceGmailOAuthCode,
  announceGmailOAuthError,
  GMAIL_OAUTH_PAYLOAD_KEY,
  GMAIL_OAUTH_PENDING_CONFIG_KEY,
  isPendingRedirectFor,
} from '@/features/settings/shell';

/** How long the pop-up waits for the app window to acknowledge the code. */
const ACK_WAIT_MS = 5000;
const NOT_RECEIVED =
  'The app did not receive this authorization (its tab may have been reloaded or closed). ' +
  'Go back to the app tab and connect Gmail again.';

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
    const opener = window.opener as (Window & { closed: boolean }) | null;
    const hasOpener = Boolean(opener && !opener.closed);

    if (error) {
      setStatus('error');
      // A pop-up flow's app window is told at once (it would otherwise wait out its timeout).
      if (state) {
        announceGmailOAuthError(state, error);
        if (opener && hasOpener) {
          opener.postMessage({ type: 'GMAIL_OAUTH_ERROR', state, error }, window.location.origin);
        }
      }
      // Clear redirect-flow state so an aborted/denied attempt can't leak into a
      // later flow (and so a lingering resume flag doesn't misroute the user).
      sessionStorage.removeItem(GMAIL_OAUTH_PENDING_CONFIG_KEY);
      sessionStorage.removeItem(GMAIL_OAUTH_PAYLOAD_KEY);
      sessionStorage.removeItem('onboarding_resume');
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

    if (!code || !state) {
      setStatus('error');
      setMessage(
        !code ? 'No authorization code received.' : 'Missing CSRF state from authorization server.'
      );
      return;
    }

    // Remove the authorization code + state from the URL immediately to prevent exposure
    // in browser history, server logs, and Referer headers.
    history.replaceState(null, '', window.location.pathname);
    // The redirect check hashes the state (async); everything after it runs once it settles.
    void (async () => {
      try {
        if (await isPendingRedirectFor(state, hasOpener)) {
          // Full-page redirect: THIS tab started the flow for this state (a pop-up inherits only a
          // stale copy of the opener's store) — sessionStorage (cleared on tab close, not readable
          // cross-tab by XSS). window.close() is blocked for windows not opened by script, so route
          // back to the integrations page where the Gmail card picks up the pending result (and
          // clears the pending config). When the flow started inside the onboarding wizard (flag
          // set by OnboardingPage), resume the wizard instead of the settings page.
          logger.info('📤 Storing code+state in sessionStorage (redirect flow)');
          sessionStorage.setItem(GMAIL_OAUTH_PAYLOAD_KEY, JSON.stringify({ code, state }));
          setStatus('success');
          const resumeOnboarding = sessionStorage.getItem('onboarding_resume') !== null;
          sessionStorage.removeItem('onboarding_resume');
          setMessage(
            resumeOnboarding
              ? 'Authorization successful! Returning to setup…'
              : 'Authorization successful! Returning to integrations…'
          );
          window.setTimeout(() => {
            window.location.href = resumeOnboarding ? '/onboarding' : '/settings#integrations';
          }, 800);
          return;
        }
        // Pop-up: its inherited copy of a pending config is not this flow's — drop it (this tab's
        // copy only; the app tab's store is its own).
        sessionStorage.removeItem(GMAIL_OAUTH_PENDING_CONFIG_KEY);

        // Pop-up: postMessage while the opener link survives, and the BroadcastChannel always
        // (Google's pages usually sever window.opener). The window closes only once the app window
        // acknowledged the code: the code is single-use, so a reloaded or closed app tab must be
        // told, never a silent "success".
        if (opener && hasOpener) {
          logger.info('📤 Sending code+state to parent window via postMessage');
          // targetOrigin is window.location.origin — the OAuth callback route is always served
          // from the same origin as the opener window.
          opener.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', code, state }, window.location.origin);
        }
        const closeSoon = () => {
          setStatus('success');
          setMessage('Authorization successful! This window will close automatically.');
          window.setTimeout(() => window.close(), 1000);
        };
        // Declared before the announce: an acknowledgement may arrive at once.
        const ack: { timer: number | undefined } = { timer: undefined };
        let acked = false;
        let stopAnnouncing: (() => void) | null = null;
        stopAnnouncing = announceGmailOAuthCode(code, state, () => {
          if (acked) return;
          acked = true;
          window.clearTimeout(ack.timer);
          stopAnnouncing?.();
          closeSoon();
        });
        if (!stopAnnouncing) {
          // No channel (a very old browser): only the opener's postMessage can deliver; it sends
          // no acknowledgement.
          if (hasOpener) {
            closeSoon();
          } else {
            setStatus('error');
            setMessage(NOT_RECEIVED);
          }
          return;
        }
        logger.info('📤 Handing code+state to the app window via BroadcastChannel');
        setMessage('Handing the authorization to the app…');
        ack.timer = window.setTimeout(() => {
          if (acked) return;
          stopAnnouncing?.();
          // The opener got the postMessage: an app tab on the bundle before the acknowledgement
          // never sends one, and the sign-in worked — the old success, not an error.
          if (hasOpener) {
            closeSoon();
            return;
          }
          setStatus('error');
          setMessage(NOT_RECEIVED);
        }, ACK_WAIT_MS);
      } catch (err) {
        logger.error('Failed to communicate OAuth code:', err);
        setStatus('error');
        setMessage('Failed to save authorization code. Please try again.');
      }
    })();
  }, [searchParams]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-muted">
      <div className="p-8 w-full max-w-md bg-card rounded-lg shadow-lg">
        {status === 'processing' && (
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full border-4 border-muted-foreground animate-spin border-t-transparent" />
            <p className="mt-4 text-lg font-medium text-muted-foreground">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="flex justify-center items-center mx-auto w-16 h-16 bg-success-muted rounded-full">
              <svg
                className="w-8 h-8 text-success"
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
            <p className="mt-4 text-lg font-medium text-muted-foreground">{message}</p>
            <p className="mt-2 text-sm text-muted-foreground">This window will close automatically.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="flex justify-center items-center mx-auto w-16 h-16 bg-destructive-muted rounded-full">
              <svg
                className="w-8 h-8 text-destructive"
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
            <p className="mt-4 text-lg font-medium text-destructive">{message}</p>
            <Button
              onClick={() => window.close()}
              className="px-4 py-2 mt-4 text-sm font-medium text-destructive-foreground bg-destructive rounded-md hover:bg-destructive/90"
            >
              Close Window
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
