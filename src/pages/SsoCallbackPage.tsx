import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { userService } from '@/services/user.service';
import { logger } from '@/lib/logger';

/**
 * SSO handoff landing page (cookie-based contract).
 *
 * The BE SSO callback sets the httpOnly `jwt` cookie (same as password login) and
 * 302-redirects here as `/sso/callback?sso=1` — with NO token and NO user in the URL.
 * There is nothing sensitive in the URL, so there is no fragment to parse or scrub.
 *
 * On mount we fetch the profile via the SAME endpoint the app uses on reload
 * (`userService.getCurrentUser()` → `GET /api/users/me`), which authenticates purely
 * off the cookie (apiClient sends `withCredentials: true`). On success we hydrate the
 * auth store from the SERVER response — mirroring the password path's `login(null, user)`
 * (cookie-only, no bearer token) — and derive the selected org from the trusted server
 * `user.organizationId`, never from a URL value. On failure we bounce to
 * `/login?ssoError=handoff`.
 */

export const SsoCallbackPage = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Completing sign-in…');
  // Guard against StrictMode double-invocation.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    let cancelled = false;

    // If the BE reported a failure it redirects to /login?ssoError=<code> directly, so a
    // successful hop here has no error param. We only read ?sso for display/logging — never
    // for auth. Auth rides entirely on the httpOnly cookie already set by the BE.
    const query = new URLSearchParams(window.location.search);
    const ssoError = query.get('ssoError');
    if (ssoError) {
      logger.error('SSO callback landed with an error code', ssoError);
      navigate(`/login?ssoError=${encodeURIComponent(ssoError)}`, { replace: true });
      return;
    }

    userService
      .getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        // Mirror the password-login path: cookie-only session, no bearer token to store.
        useAuthStore.getState().login(null, user);
        // Derive the org from the trusted server response, NOT any URL value.
        if (user.organizationId) {
          useAuthStore.getState().setSelectedOrganization(user.organizationId);
        }
        setMessage('Signed in. Redirecting…');
        navigate('/dashboard', { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.error('SSO callback failed to hydrate session from cookie', err);
        navigate('/login?ssoError=handoff', { replace: true });
      });

    return () => {
      cancelled = true;
    };
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
