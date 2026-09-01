import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from './config';
import { logger } from '@/lib/logger';
import { noteSessionIssued, noteSessionRenewed } from '@/lib/sessionClock';
import { useAuthStore } from '@/stores/authStore';
import { useScopeStore } from '@/stores/scopeStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';
import { useSubscriptionGateStore } from '@/stores/subscriptionGateStore';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable sending cookies with requests
});

/**
 * Request-context interceptor (exported for unit testing — see api-client.scope.test.ts).
 *
 * D-ADM-1 scope contract: requests to the Alliance console API (`/api/alliances`) carry
 * `X-Alliance-Context` (from the URL-derived scopeStore) and MUST NOT carry
 * `X-Organization-Context` — the two scopes are mutually exclusive. Both headers are
 * transport-only; the backend authorizes from the route param, never from these headers.
 * All other requests keep the existing org-context behavior verbatim.
 */
export const applyRequestContext = (
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig => {
  // For FormData (file uploads), remove the default Content-Type so the browser
  // can set multipart/form-data with the correct boundary automatically.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const { scope, allianceId } = useScopeStore.getState();
  if (config.url?.startsWith('/api/alliances')) {
    // Alliance-scoped: never leak the org context onto a cross-org console call.
    delete config.headers['X-Organization-Context'];
    if (allianceId !== null) {
      config.headers['X-Alliance-Context'] = String(allianceId);
    }
  } else if (scope === 'platform') {
    // Platform (global-admin) console: cross-org by definition (D-ADM-1) — never attach
    // an org context onto a platform call. The BE authorizes the global admin from the
    // role, not a header; a stale org context could scope a reused handler to one org.
    delete config.headers['X-Organization-Context'];
  } else {
    // Add selected organization context — read directly from Zustand store to avoid
    // JSON.parse(localStorage) on every request (avoids parsing cost and stale-parse issues).
    //
    // ⚠ Do NOT fall back to `user.organizationId` here. It was tried and reverted: a
    // transport-level fallback cannot tell a read from a destructive write, and it
    // defeats deliberate fail-closed guards. deleteUser (userController.ts:1288) returns
    // 400 asking a global admin to pick a workspace before removing a user who belongs to
    // MULTIPLE workspaces — supplying a default silently removes them from the admin's own
    // workspace instead. Where a default is safe, do it per-endpoint on the server, the way
    // skillLabelController.ts:46 already does.
    const selectedOrgId = useAuthStore.getState().selectedOrganizationId;
    if (selectedOrgId) {
      config.headers['X-Organization-Context'] = String(selectedOrgId);
      logger.debug(
        `🏢 [API] Organization Context set | ${config.method?.toUpperCase()} ${config.url}`
      );
    } else {
      logger.warn(
        '⚠️ [API] No organization context set!',
        config.method?.toUpperCase(),
        config.url
      );
    }
  }

  // Add department context filter — attach CSV header when user has narrowed their view
  const selectedDeptIds = useDepartmentContextStore.getState().getSelectedDeptIds();
  if (selectedDeptIds.length > 0) {
    config.headers['X-Department-Context'] = selectedDeptIds.join(',');
  }

  return config;
};

// Request interceptor to add auth token and organization/alliance context
apiClient.interceptors.request.use(
  applyRequestContext,
  (error: unknown) => Promise.reject(error instanceof Error ? error : new Error(String(error)))
);

/** A request we have already retried once after refreshing. Marked so it can never loop. */
type RetriableConfig = InternalAxiosRequestConfig & { _sessionRetry?: boolean };

/**
 * Endpoints whose own 401 must NOT be answered by refreshing.
 *
 * These are the calls that ESTABLISH or END a session rather than use one. A 401 from
 * `/api/auth/login` means the password was wrong — refreshing would be an irrelevant round trip
 * whose failure then signs the user out of a session they never had. `/api/auth/refresh` is
 * excluded for the obvious reason.
 *
 * ⚠️ Deliberately NOT "everything under /api/auth". `2fa/setup`, `2fa/disable`,
 * `switch-organization` and `my-organizations` are called from inside a live session and MUST be
 * refreshable like any other request — only the login-time siblings belong here.
 */
const SESSION_ESTABLISHING_PATHS = [
  '/api/auth/refresh',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/signup',
  '/api/auth/register',
  '/api/auth/2fa/authenticate',
  '/api/auth/select-organization',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/check-email',
  '/api/auth/validate-invitation',
  '/api/auth/sso/',
];

const isRefreshable = (url: string | undefined): boolean =>
  !SESSION_ESTABLISHING_PATHS.some((path) => (url ?? '').startsWith(path));

/**
 * The refresh currently in flight, shared by everyone who hits a 401 while it runs.
 *
 * Single-flight is not an optimisation here, it is the correctness property. The app fires many
 * requests at once, so an expired access token produces a burst of simultaneous 401s. Letting
 * each one refresh independently means several rotations of the same refresh token in the same
 * instant — which the backend correctly reads as token REUSE and answers by revoking the whole
 * family. Racing to renew the session would be the thing that destroys it.
 */
let refreshInFlight: Promise<void> | null = null;

const requestRefresh = async (): Promise<void> => {
  try {
    // A bare axios call, not `apiClient` — going through the instance would re-enter this same
    // interceptor on failure and recurse.
    const response = await axios.post<{ data?: { expiresIn?: string } }>(
      `${API_BASE_URL}/api/auth/refresh`,
      {},
      { withCredentials: true }
    );
    // The server states the lifetime of the token it just minted. Reporting it is what lets the
    // renewal scheduler run AHEAD of expiry instead of waiting for something to hit a 401 —
    // and it is the only source that is right on every deployment, since ACCESS_TOKEN_TTL is
    // an operator's choice.
    noteSessionRenewed(response.data?.data?.expiresIn);
  } catch (err) {
    const status = (err as { response?: { status?: number } } | undefined)?.response?.status;
    // 409 is NOT a failure. It means another TAB rotated the token moments ago and has already
    // set the new cookie pair on this browser — cookies are shared, so we hold the fresh session
    // too and simply need to retry. Treating 409 as terminal is exactly how a multi-tab user
    // gets signed out for having two tabs open.
    if (status === 409) {
      // The cookies ARE fresh, we just did not mint them, so the schedule must move too. No
      // lifetime to learn: the winning tab holds that response.
      noteSessionRenewed();
      return;
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
};

/**
 * Renew the session if it is not already being renewed, and resolve when it has been.
 *
 * Exported because the WebSocket path needs the same guarantee: a handshake rejected for an
 * expired token must join this queue rather than start a second, competing refresh.
 */
export const ensureFreshSession = (): Promise<void> => {
  refreshInFlight ??= requestRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

/**
 * Response error handler. Exported so tests can drive the REAL transformation
 * instead of hand-mirroring it: everything downstream depends on the fact that a
 * failure with a body arrives as a fresh `Error` carrying `status`/`data` and no
 * `.response`, and a hand-written fixture cannot fail when that changes.
 */
export const handleResponseError = async (error: unknown): Promise<unknown> => {
  // Type guard for axios error
  const isAxiosError = (
    err: unknown
  ): err is { response?: { status?: number; data?: unknown }; config?: RetriableConfig } =>
    typeof err === 'object' && err !== null && 'response' in err;

  if (isAxiosError(error) && error.response?.status === 401) {
    // Only redirect to login if not already there
    const currentPath = window.location.pathname;
    const isOnAuthPage =
      currentPath === '/login' ||
      currentPath === '/signup' ||
      currentPath === '/forgot-password' ||
      currentPath === '/reset-password';

    // Before this, EVERY 401 was terminal: sign the user out and send them to /login. That was
    // survivable while the access token lasted seven days. It is not survivable now that it
    // lasts fifteen minutes — the same user would be bounced to the login screen four times an
    // hour, mid-sentence, with a refresh token in their cookie jar that would have renewed the
    // session silently.
    //
    // So a 401 is now a QUESTION ("is this session actually over?") and only the refresh
    // endpoint answers it.
    const original = error.config;
    if (original && !isOnAuthPage && !original._sessionRetry && isRefreshable(original.url)) {
      original._sessionRetry = true;
      try {
        await ensureFreshSession();
        return await apiClient.request(original);
      } catch {
        // The session really is over. Fall through to the sign-out below.
      }
    }

    if (!isOnAuthPage) {
      useAuthStore.getState().logout();
      sessionStorage.clear();
      window.location.href = '/login';
    }
  }

  // 402 = subscription inactive/expired (requireActiveSubscription). Surface a
  // global gate overlay explaining why the app is unavailable + how to renew,
  // instead of leaving the user with silently-failing blank screens. Global
  // admins never receive a 402, so this only gates regular users in an expired org.
  if (isAxiosError(error) && error.response?.status === 402) {
    const data = error.response.data as { error?: string; message?: string } | undefined;
    useSubscriptionGateStore
      .getState()
      .setGated(data?.error ?? data?.message ?? 'Your subscription is not active.');
  }

  // Extract error message from response
  if (isAxiosError(error) && error.response?.data) {
    const errorData = error.response.data as { error?: string; message?: string };
    const baseError = error as { message?: string };
    const rawMessage =
      errorData.error ?? errorData.message ?? baseError.message ?? 'Unknown error';
    const status = error.response.status ?? 0;

    // 5xx errors hide internal details; client errors pass through user-facing messages
    const errorMessage =
      status >= 500
        ? 'A server error occurred. Please try again later.'
        : rawMessage;

    const enhancedError = new Error(errorMessage) as Error & { status?: number; data?: unknown };
    enhancedError.status = status;
    enhancedError.data = errorData;

    return Promise.reject(enhancedError);
  }

  return Promise.reject(error instanceof Error ? error : new Error(String(error)));
};

/**
 * Every sign-in path — password, org picker, workspace switch, signup auto-login, 2FA — answers
 * through the BE's `establishSession`, which reports the access-token lifetime as
 * `data.auth.expiresIn` (and, for native clients, the tokens beside it). Reading it HERE rather
 * than in each auth service keeps "a session just started" in ONE place on this side too; six
 * services each remembering to record it is the drift `establishSession` exists to prevent.
 *
 * Exported for the test, which drives THIS function rather than reaching into axios's handler
 * array — a private shape that type-checks differently under the app tsconfig than the loose one.
 */
export const noteSessionFromResponse = (response: AxiosResponse): AxiosResponse => {
  const body = response.data as { data?: { auth?: { expiresIn?: unknown } } } | undefined;
  const expiresIn = body?.data?.auth?.expiresIn;
  if (typeof expiresIn === 'string') noteSessionIssued(expiresIn);
  return response;
};

// Response interceptor to handle errors
apiClient.interceptors.response.use(noteSessionFromResponse, handleResponseError);
