import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';
import type { User } from '@/types';

/**
 * SSO handoff landing page.
 *
 * The BE 302-redirects here with the session in the URL fragment:
 *   `/sso/callback#token=<urlencoded JWT>&user=<base64url-encoded JSON>`
 * We read the fragment, decode it, call `authStore.login(token, user)`, then
 * IMMEDIATELY scrub the fragment via `history.replaceState` (mirrors
 * OAuthCallbackPage) so the token never lingers in history/Referer (T-05-01).
 * A missing/malformed fragment redirects to `/login?ssoError=handoff`.
 */

/** Decode a base64url string to UTF-8 (fragment `user` is base64url per plan 04). */
const base64UrlDecode = (input: string): string => {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  // Reconstruct UTF-8 bytes so non-ASCII names decode correctly.
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const SsoCallbackPage = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Completing sign-in…');
  // Guard against StrictMode double-invocation.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    // Fragment shape: `#token=<enc>&user=<base64url>`. Use URLSearchParams over
    // the hash body (minus the leading '#').
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const rawToken = params.get('token');
    const rawUser = params.get('user');

    // Scrub the fragment immediately — before any await/navigation — so the JWT
    // never persists in browser history, the Referer header, or logs (T-05-01).
    history.replaceState({}, '', '/sso/callback');

    if (!rawToken || !rawUser) {
      logger.error('SSO callback missing token/user fragment');
      navigate('/login?ssoError=handoff', { replace: true });
      return;
    }

    try {
      const token = decodeURIComponent(rawToken);
      const user = JSON.parse(base64UrlDecode(rawUser)) as User;
      useAuthStore.getState().login(token, user);
      if (user.organizationId) {
        useAuthStore.getState().setSelectedOrganization(user.organizationId);
      }
      setMessage('Signed in. Redirecting…');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      logger.error('SSO callback failed to parse handoff fragment', err);
      navigate('/login?ssoError=handoff', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <div className="p-8 w-full max-w-md text-center bg-white rounded-lg shadow-lg">
        <div className="mx-auto w-16 h-16 rounded-full border-4 border-blue-600 animate-spin border-t-transparent" />
        <p className="mt-4 text-lg font-medium text-gray-700">{message}</p>
      </div>
    </div>
  );
};
