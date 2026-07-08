<!-- generated-by: gsd-doc-writer -->
# Frontend Overview — Odly (email-service FE)

> Updated: 2026-06-04 (Wave 5 D commits 1-3: all 4 rule tables use shared RuleEditor + useRuleManagement; prettifyRulePattern utility; RoutingRulesSettings source/dept picker in renderBanners; two-tier routing rules model planned). Covers FE structure, pages, state, API layer, and real-time subscriptions.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Directory Structure](#directory-structure)
3. [Pages / Routes](#pages--routes)
4. [State Management](#state-management)
5. [API Layer](#api-layer)
6. [WebSocket / Real-Time](#websocket--real-time)
7. [Auth Flow](#auth-flow)
8. [Key Component Groups](#key-component-groups)
9. [Known Issues / Deferred Items](#known-issues--deferred-items)

---

## Tech Stack

| Concern | Technology | Version |
|---------|-----------|---------|
| Framework | React (Strict Mode enabled) | 18.2 |
| Language | TypeScript | 5.3 |
| Router | React Router DOM | 6.21 — `BrowserRouter` with v7 future flags (`v7_startTransition`, `v7_relativeSplatPath`) |
| Global state | Zustand | 5.0.8 — `persist` middleware for auth, messages, and tickets filter state |
| Server state | TanStack React Query | 5.17 — `QueryClientProvider` at root; retry=1, refetchOnWindowFocus=false. Services currently use Axios directly; Query is available for future migration. |
| HTTP client | Axios | 1.6 — centralized `apiClient` with request/response interceptors |
| WebSocket | Socket.IO client | 4.8 — singleton `socketManager` with reference-counted connections |
| Styling | Tailwind CSS + `tailwind-merge` + `clsx` | 3.4 — dark/light mode via `ThemeContext` |
| UI primitives | Hand-rolled (`components/ui/`) | — no external headless library |
| Rich text editor | Tiptap | 3.10 — reply composer and KB editor |
| Charts | Recharts | 3.6 |
| Drag-and-drop | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) | 6.3 / 10.0 |
| Multi-select | React Select | 5.10 |
| Captcha | Cloudflare Turnstile (`@marsidev/react-turnstile`) | 1.4 — login, signup, forgot-password |
| HTML sanitizer | DOMPurify | 3.3 — applied at root in `main.tsx`; all `<a>` tags forced to `rel="noopener noreferrer" target="_blank"` |
| Form validation | Zod | 3.22 |
| Build tool | Vite | 6.4 — `npm run dev` → HMR; `npm run build` → `tsc && vite build` |
| Test runner | Vitest + Testing Library | 4.1 |
| Linting | ESLint 8 + `@typescript-eslint` | `npm run lint` |
| Formatting | Prettier | 3.6 — `npm run format` |

**Base URL:** `VITE_API_URL` env var; falls back to `http://localhost:3000` (see `FE-app/src/lib/config.ts`).

---

## Directory Structure

```
FE-app/src/
├── assets/          Static assets (images, icons)
├── components/      React components grouped by domain
│   ├── admin/       Super-admin views (global org list, plan management)
│   ├── auth/        ProtectedRoute, PermissionGuard — route-level access control
│   ├── billing/     Billing intelligence charts and panels
│   ├── common/      Cross-cutting primitives (Turnstile wrapper)
│   ├── contacts/    Contact/requester display components
│   ├── dashboard/   Dashboard widgets
│   ├── filters/     Reusable filter panel components
│   ├── kb/          Knowledge base file upload, entry listing, Q&A viewer
│   ├── layout/      Layout shell, OrganizationSwitcher, SLANotificationBell, ThemeToggle
│   ├── messages/    Inbox list, thread view, reply composer, AI panel, Kanban
│   ├── modals/      Application-level modal dialogs
│   ├── organization/ Org settings forms
│   ├── pricing/     Pricing plan display
│   ├── settings/    Integrations, categories, labels, AI config, spam rules
│   ├── shared/      RichTextEditor, WebSocketStatus, WebSocketDebug, TranslateButton, RuleEditor<T>, DepartmentMultiPicker
│   ├── sla/         SLA dashboard charts and breach tables
│   ├── spam/        Spam log viewer
│   ├── statistics/  Stats charts by agent/category/channel
│   ├── tickets/     Ticket list, detail panel, comments, Kanban, Jira dialogs
│   └── ui/          Design system: Button, Card, Dialog, Drawer, Input, Badge, Pagination, etc.
├── contexts/
│   └── ThemeContext.tsx    Light/dark theme; persists to localStorage key `theme`; reads system preference on first load
├── hooks/           Custom React hooks (see list below)
├── lib/
│   ├── api-client.ts      Axios instance + interceptors
│   ├── config.ts          API_BASE_URL constant
│   ├── constants.ts       Shared constants
│   ├── linkify.tsx        URL → clickable link transformer
│   ├── logger.ts          Console logger (debug filtered in production)
│   ├── messageHelpers.tsx Shared rendering helpers: channel icon, spam check accessors, `humanizeSignalFlag`, `getFilteredCategoryMeta`
│   ├── socketManager.ts   Socket.IO singleton with ref-counting + org-room tracking
│   ├── prettifyRulePattern.ts  Format regex/pipe patterns to readable labels (used in all 4 rule tables)
│   ├── stripHtml.ts       Strip HTML tags utility
│   ├── browserDetect.ts   `detectBrowser()` returns 'chrome' | 'firefox' | 'safari' | 'edge' | 'brave' | 'unknown'; `getPopupUnblockInstructions(browser)` returns browser-specific copy for popup-block recovery banners
│   └── utils.ts           Tailwind cn() + misc helpers
├── pages/           Top-level page components (one per route)
├── services/        API service modules (one per domain entity)
├── stores/          Zustand stores
├── styles/          Global CSS (index.css, tiptap.css)
├── test/            Shared test setup (Vitest)
├── types/           Shared TypeScript types and RBAC definitions
└── utils/           Misc utilities (imapProviders.ts — IMAP provider presets)
```

---

## Pages / Routes

All authenticated routes are wrapped in the inline `PrivateRoute` component (checks `isAuthenticated && user` from `authStore`; redirects to `/login`). Some routes add `<ProtectedRoute>` for RBAC or role gating. Non-critical pages are code-split via `React.lazy` + `<Suspense>`.

On page reload, `App.tsx` detects that the persisted user has no `role` (intentionally excluded from persistence) and re-fetches the profile via `GET /api/users/me` before rendering protected routes. A `LoadingFallback` is shown during this re-hydration to prevent fail-open redirects.

| Path | Component | Auth | Guard | Load |
|------|-----------|------|-------|------|
| `/login` | `LoginPage` | — | — | Eager; redirects to `/dashboard` if authenticated |
| `/signup` | `SignupPage` | — | — | Eager; redirects to `/dashboard` if authenticated |
| `/verify-email` | `VerifyEmailPage` | — | — | Eager |
| `/forgot-password` | `ForgotPasswordPage` | — | — | Eager; redirects to `/dashboard` if authenticated |
| `/reset-password` | `ResetPasswordPage` | — | — | Eager; redirects to `/dashboard` if authenticated |
| `/oauth/gmail/callback` | `OAuthCallbackPage` | — | — | Eager |
| `/dashboard` | `DashboardPage` | Yes | — | Eager |
| `/messages` | `MessagesPage` | Yes | — | Lazy |
| `/messages/:id` | `MessageDetailPage` | Yes | — | Lazy |
| `/knowledge-base` | `KnowledgeBasePage` | Yes | — | Lazy |
| `/tickets` | `TicketsPage` | Yes | — | Lazy |
| `/tickets/create` | `CreateTicketPage` | Yes | — | Lazy |
| `/tickets/edit/:id` | `EditTicketPage` | Yes | — | Lazy |
| `/tickets/:id` | `TicketDetailPage` | Yes | — | Lazy |
| `/statistics` | `StatisticsPage` | Yes | — | Lazy |
| `/sla` | `SLADashboardPage` | Yes | `VIEW_STATISTICS` | Lazy |
| `/settings` | `SettingsPage` | Yes | — | Lazy; tabs for integrations, categories, labels, AI, spam |
| `/users` | `UsersPage` | Yes | `VIEW_USERS` | Lazy |
| `/organization` | `OrganizationPage` | Yes | — | Lazy |
| `/email-templates` | `EmailTemplatesPage` | Yes | — | Lazy |
| `/audit-logs` | `AuditLogsPage` | Yes | `VIEW_AUDIT_LOGS` | Lazy |
| `/admin` | `AdminDashboardPage` | Yes | `requiredRole="admin"` | Lazy; global admin only |
| `/subscription` | `SubscriptionPage` | Yes | `VIEW_SUBSCRIPTION` | Lazy |
| `/pricing` | `PricingPage` | Yes | — | Lazy |
| `/usage-stats` | `UsageStatsPage` | Yes | `VIEW_USAGE_STATS` | Lazy |
| `/billing` | `BillingDashboardPage` | Yes | `VIEW_BILLING` | Lazy |
| `/team-stats` | — | — | — | Redirect → `/statistics#team` |
| `/` | — | — | — | Redirect → `/dashboard` |
| `*` | — | — | — | Inline 404 message (does NOT redirect to `/dashboard`) |

> Note: The `*` catch-all renders an inline "404 - Page Not Found" paragraph rather than redirecting, which is a change from the previous doc.

---

## State Management

### Zustand Stores

| Store | File | Persisted | What it holds |
|-------|------|-----------|---------------|
| `useAuthStore` | `authStore.ts` | Yes (`auth-storage`) | `user` (id, email, firstName, organizationId only — role/orgRole excluded), `isAuthenticated`, `selectedOrganizationId`. Token and role fields intentionally NOT persisted. `isAuthenticated` is re-derived from `user !== null` on rehydration. `logout()` calls `forceDisconnect()` and clears the AI tab's `similarResultsCache`. |
| `useMessagesStore` | `messagesStore.ts` | Yes (`messages-filters`) | Inbox filters (source, status, threadStatus, priority, assignee, aiState, label, linked, linkedTicketStatus, slaFilter, search) + paginated cache with 5-minute TTL. |
| `useTicketsStore` | `ticketsStore.ts` | Yes | Ticket filters (status, priority, categoryId, messageSourceId, assignee, label, linked/jira sync, search, sortBy, sortOrder) + paginated cache with 5-minute TTL. |
| `useUsersStore` | `usersStore.ts` | No | Users list + search query; 5-minute cache TTL. |
| `useOrganizationsStore` | `organizationsStore.ts` | No | Current org, all orgs list (admin); 5-minute TTL for both. |
| `useAuditLogsStore` | `auditLogsStore.ts` | No | Audit log entries + filter state (action, entity, userId, date range, page, limit). |
| `useDepartmentContextStore` | `departmentContextStore.ts` | Yes (`dept-context`) | Selected dept IDs for the view-narrowing filter. Keyed by `{userId}:{orgId}` so org/user switches auto-reset. `getSelectedDeptIds()`, `setSelected(ids)`, `clear()`. Interceptor in `api-client.ts` attaches `X-Department-Context: <csv>` on every request when non-empty. Added Wave 5 workstream A (2026-06-04). |

### React Context

- **`ThemeContext`** (`contexts/ThemeContext.tsx`) — The only React context in the app. Holds `theme` (`light`|`dark`) + `toggleTheme`/`setTheme`. Reads `localStorage.theme` on init, falls back to `prefers-color-scheme`. Writes class to `document.documentElement`.

### Key Hooks

| Hook | Purpose |
|------|---------|
| `usePermissions` | Derives `hasPermission()`, `hasAnyPermission()`, `isAdmin`, `isOrgAdmin`, etc. from `authStore` |
| `useModules` | Fetches active AI/billing modules for the org; used by Layout to conditionally show nav items |
| `useMessagesData` | Fetches message threads respecting `messagesStore` filter/sort/cache state |
| `useMessagesUrlSync` | Two-way sync between URL query params and `messagesStore` filters |
| `useTicketsUrlSync` | Same pattern for tickets |
| `useEmailProcessingSocket` | Manages `email:processing`, `kb:progress`, `kb:completed` WS events; drives `MessageProcessingProgress` widget |
| `useTelegramProcessing` | Manages `telegram:processing` WS events for Telegram ingestion progress |
| `useSLANotifications` | Fetches breach notifications from `/api/notifications`; subscribes to `sla_breach` WS event; applies user preference filters |
| `useTicketsRealtime` | Subscribes to `ticket:updated` / `ticket:created` WS events; clears cache and re-fetches |
| `useStatisticsFetch` | Statistics data fetching for the stats page |
| `useSystemHealth` | Polls system health endpoint |
| `useTranslation` | Per-message translation via AI service |
| `useFilterPanel` | Shared filter panel open/close state |
| `useResolveMessageToKB` | Handles resolving a message thread to a KB entry |

---

## API Layer

### Axios Instance (`FE-app/src/lib/api-client.ts`)

- **Base URL:** `VITE_API_URL` → `http://localhost:3000`
- **`withCredentials: true`** — sends httpOnly cookie on every request
- **Request interceptor:**
  - Removes `Content-Type` for `FormData` uploads (lets browser set multipart boundary)
  - Reads `selectedOrganizationId` directly from `useAuthStore.getState()` (not via `localStorage.parse`) and attaches `X-Organization-Context` header
  - Logs a warning when no org context is set
- **Response interceptor:**
  - On 401 (when not already on an auth page): calls `logout()`, clears `sessionStorage`, redirects to `/login`
  - On 5xx: replaces the error message with a generic "A server error occurred" string to avoid leaking internal details
  - On 4xx: passes the `error` or `message` field from the response body through to the caller
  - Attaches `.status` and `.data` fields to the thrown `Error` object

**`authFetch.ts` was deleted (RA18-P7-H-02)** — it was dead code that always returned a null token. All requests go through `apiClient`.

### Service Modules (`FE-app/src/services/`)

One file per domain entity; all return typed `ApiResponse<T>` objects.

| Service | Domain |
|---------|--------|
| `auth.service.ts` | Login, register, verify-email, forgot/reset password, change-password |
| `twoFactor.service.ts` | 2FA status, setup, enable, disable, TOTP challenge, forced setup |
| `message.service.ts` | Thread listing (filters/pagination), thread detail, reply, status/assignment, linked ticket |
| `ticket.service.ts` | Ticket CRUD, status/priority/assignment, Jira push/sync |
| `comments.service.ts` | Ticket and message comment CRUD |
| `kb.service.ts` | Knowledge base entries (Q&A), document upload, search |
| `ai.service.ts` | AI classify, response suggestions, similar KB search |
| `settings.service.ts` | Org-level settings (email config, spam rules, AI prompts, labels, categories) |
| `integrations.service.ts` | Integration CRUD (Gmail, IMAP, Telegram, Slack, Jira, Zapier) |
| `ingestion.service.ts` | Trigger manual email/Telegram polling |
| `organization.service.ts` | Org profile CRUD |
| `user.service.ts` | User profile, notification preferences |
| `invitation.service.ts` | Invite user, accept invitation |
| `department.service.ts` | Department listing and management |
| `sla.service.ts` | SLA policy CRUD, breach history |
| `statistics.service.ts` | Agent/category/channel/team statistics |
| `billing.service.ts` | Billing intelligence data |
| `subscription.service.ts` | Plan / subscription data |
| `auditLog.service.ts` | Audit log queries |
| `system.service.ts` | System health |
| `health.service.ts` | BE health check |
| `spamLog.service.ts` | Spam filter log |
| `contact.service.ts` | Customer contact records |
| `category.service.ts` | Category CRUD |
| `detectionRule.service.ts` | Spam/classification detection rules |
| `documentation.service.ts` | Knowledge base document management |
| `gmail-oauth.service.ts` | Gmail OAuth flow: `connectWithPopup(config)` (opens about:blank synchronously to preserve user-gesture, then navigates), `redirectToOAuth(config)` (full-page fallback when popup hard-blocked; stashes config in sessionStorage), `consumePendingRedirectResult()` (mount-effect helper that finishes the redirect-flow OAuth after the page returns) |
| `ticketingSystems.service.ts` | External ticketing system integrations (Jira) |
| `chatWidget.service.ts` | Chat widget configuration |
| `assignment.service.ts` | Bulk assignment operations |

---

## WebSocket / Real-Time

### Connection Model (`FE-app/src/lib/socketManager.ts`)

The manager is a **reference-counted module-level singleton**:

- **`getSocket()`** — Returns or creates the `socket.io-client` Socket. Increments `connectionCount`. Cancels any pending disconnect timeout. Passes `withCredentials: true`; reconnection is enabled with infinite attempts.
- **`releaseSocket()`** — Decrements `connectionCount`. When it reaches zero, schedules a 1-second delayed disconnect (absorbs React StrictMode double-mounts).
- **`forceDisconnect()`** — Immediate disconnect; called by `useAuthStore.logout()`.
- **`subscribeToEvent(event, callback)`** — Registers a single socket listener per event name that fans out to all callbacks via `Map<string, Set<EventCallback>>`. Prevents duplicate `socket.on` registrations.
- **`unsubscribeFromEvent(event, callback)`** — Removes the callback; tears down the socket listener when the set is empty.
- **`joinOrganizationRoom(orgId)`** — Emits `join-organization` to the server; tracks the room in `activeOrgRooms` and re-joins automatically on reconnect.
- **`leaveOrganizationRoom(orgId)`** — Emits `leave-organization`; removes from `activeOrgRooms`.

On `connect_error` with messages containing "Session has been invalidated", "Invalid or expired token", or "Authentication required": clears `localStorage['auth-storage']` and redirects to `/login`.

### Subscribed Events

| Event | Subscribed in | Action |
|-------|--------------|--------|
| `email:processing` | `useEmailProcessingSocket` | Updates per-integration session state (started → found → processing → processed → complete / error). Drives `MessageProcessingProgress` widget. Filters events by `organizationId` when `filterByOrganization` is set. |
| `kb:progress` | `useEmailProcessingSocket` (via `makeKBHandlers`) | Updates KB progress counters (Q&A pairs, documents, standalone knowledge entries) within the active processing session |
| `kb:completed` | `useEmailProcessingSocket` (via `makeKBHandlers`) | Marks KB processing stage as complete |
| `telegram:processing` | `useTelegramProcessing` | Tracks Telegram bot message ingestion events (`bot_started`, `message_received`, `processing`, `processed`, `reply_sent`, `error`) |
| `ticket:updated` | `useTicketsRealtime` | Clears ticket cache, re-fetches ticket list; if the updated ticket is currently selected, re-fetches its detail |
| `ticket:created` | `useTicketsRealtime` | Clears cache and re-fetches ticket list |
| `comment:created` | `TicketComments` | Appends new comment to the displayed thread |
| `comment:updated` | `TicketComments` | Updates existing comment in place |
| `comment:deleted` | `TicketComments` | Removes comment from thread |
| `ticket:comments:updated` | `TicketComments` | Full comment list refresh |
| `message:replied` | `MessageDetail` | Refreshes the current thread; payload includes `threadId` so the handler can filter to the currently-displayed thread |
| `send-failed` | `MessageDetail` | Shows a red error banner with the channel name; payload includes `threadId` for filtering |
| `provider_disabled` | `AIProvidersSettings` | Refreshes the AI provider list and shows a warning AlertDialog with the provider name and failure reason |
| `sla_breach` | `useSLANotifications` | Prepends new breach notification to the bell dropdown; increments unread count; filtered against user preferences (minSeverity, type, onlyAssignedToMe) |
| `stats:update` | `DashboardPage` | Triggers the next `fetchStats()` poll cycle |

---

## Auth Flow

### Login Steps

1. **Email step** — User enters email; FE calls `POST /api/auth/check-email` (with optional Turnstile token). Response is always success on a syntactically valid email; no user/org disclosure. Replaced legacy `/verify-user`.
2. **Password step** — FE calls `POST /api/auth/login` with `{email, password, captchaToken}`. No `organizationSlug` — the BE resolves orgs from the user record after password verification.
3. **Org selection** (multi-org users only) — Login returns `{requiresOrgSelection: true, tempToken, organizations}`. FE calls `POST /api/auth/select-organization` with `{tempToken, organizationId, captchaToken}`. Single-use via Redis jti; captcha required in production.
4. **TOTP step** (if 2FA enabled) — Login or select-organization returns `{twoFactorRequired: true, tempToken}`. FE calls `POST /api/auth/2fa/authenticate` with `{tempToken, code}`. On success receives `{token, user}`.
5. **Forced 2FA setup** — If org policy requires 2FA but user hasn't set it up, login returns `{twoFactorRequired, twoFactorSetupRequired, tempToken}`. FE shows QR code (from `POST /api/auth/2fa/forced-setup`) then calls `POST /api/auth/2fa/forced-enable`.
6. **Session established** — `useAuthStore.login(token, user)` sets Zustand state. `selectedOrganizationId` is set. Persist middleware writes `user` (id, email, firstName, organizationId) and `selectedOrganizationId` to `localStorage['auth-storage']`. Token, role, and organizationRole are NOT written to localStorage.

### Token Storage

- **Token is NOT persisted to localStorage.** `authStore.partialize` explicitly excludes `token`. Authentication relies solely on the httpOnly cookie set by the backend.
- `apiClient` sends the cookie automatically via `withCredentials: true`.
- `config.ts` no longer exports `getAuthToken()` — it only exports `API_BASE_URL`. The interceptor reads org context directly from the Zustand store.

### Token Refresh / Expiry

No explicit token-refresh flow. On 401, `apiClient`'s response interceptor calls `logout()` and redirects to `/login`. The socket manager also redirects on auth-related `connect_error` events.

### Gmail OAuth Flow

Separate from the standard email/password login. Two paths depending on browser popup state:

1. **Popup path (default):**
   - `connectWithPopup` opens `window.open('about:blank', ...)` **synchronously on click** (preserves user gesture; deferred `window.open` after `await` is blocked by Chrome/Safari/Firefox)
   - Fetches config + initiates OAuth (now async-safe — popup already open)
   - Navigates popup via `popup.location.href = authUrl`
   - Popup completes OAuth at Google → returns to `/oauth/gmail/callback`
   - `OAuthCallbackPage` detects `window.opener` and posts `{type:'GMAIL_OAUTH_SUCCESS', code, state}` to the opener
   - Opener's message handler calls `handleCallback(code, state, ...)` and the popup closes itself

2. **Redirect fallback (popup hard-blocked):**
   - `connectWithPopup` returns `{ success: false, error: 'POPUP_BLOCKED' }`
   - `GmailIntegrationCard` shows an amber banner with browser-specific instructions (via `getPopupUnblockInstructions`) + "Try the popup again" / "continue without popup" / manual `<a href={authUrl}>` anchor
   - `redirectToOAuth(config)` stashes `{ config, redirectUri }` in `sessionStorage` under `gmail_oauth_pending_config`, then `window.location.href = authUrl` (full-page navigation)
   - Google returns to `/oauth/gmail/callback`. `OAuthCallbackPage` detects no `window.opener` AND a pending config → stores `{code, state}` in sessionStorage under `gmail_oauth_payload`, then redirects to `/settings#integrations`
   - `GmailIntegrationCard`'s mount effect calls `consumePendingRedirectResult()` which reads both sessionStorage keys and dispatches `handleCallback` to finish the flow

### Protected Routes

Two layers:
- **`PrivateRoute`** (inline in `App.tsx`) — checks `isAuthenticated && user`; redirects to `/login`.
- **`ProtectedRoute`** (`components/auth/ProtectedRoute.tsx`) — checks a specific `Permission` via `hasPermission()` or a `requiredRole`. Redirects to `fallbackPath` (default `/dashboard`).

### RBAC

Defined in `FE-app/src/types/roles.ts`:
- **Global roles:** `admin`, `user`
- **Org roles:** `org_admin`, `moderator`, `support`, `associate`
- **Permissions:** 30+ granular permissions mapped in `rolePermissions`
- **Helpers:** `hasPermission()`, `hasAnyPermission()`, `hasAllPermissions()`, `isOrgAdminOrHigher()` — pure functions used by `usePermissions` hook and `ProtectedRoute`

---

## Key Component Groups

### Layout Shell
- **`Layout`** — Primary app shell. Renders sidebar nav (filtered by permissions + active modules), mobile header, `OrganizationSwitcher`, `ThemeToggle`, `SLANotificationBell`, `MessageProcessingProgress`, `WebSocketStatus`. Hosts the single `useSLANotifications()` instance and passes results as props to avoid duplicate API calls between the desktop and mobile bell instances.
- **`OrganizationSwitcher`** — Multi-org dropdown; sets `selectedOrganizationId` in `authStore`, which propagates to `X-Organization-Context` on all subsequent requests.
- **`DepartmentSwitcher`** — Sidebar checkbox popover for multi-dept users (hidden for single-dept). Reads/writes `departmentContextStore`; reconciles selection against accessible depts on org/user change. The interceptor in `api-client.ts` picks up the store state and attaches `X-Department-Context` automatically. Added Wave 5 workstream A (2026-06-04).

### Messages / Inbox
- **`MessageDetail`** — Full thread view; subscribes to `message:replied` and `send-failed` socket events.
- **`MessageProcessingProgress`** — Sidebar widget showing live ingestion progress; driven by `useEmailProcessing` hook (which composes `useEmailProcessingSocket`, `useEmailProcessingSessions`, and `useEmailProcessingKBHandlers`).
- **`AiTabPanel`** — AI classification, response suggestions, similar KB results. Contains a module-level `similarResultsCache` (`Map`) cleared on logout. RED FLAGS / GREEN FLAGS blocks use `humanizeSignalFlag` to convert internal signal strings to readable labels.
- **`MessageActionStrip`** — Bottom action strip in message detail. Filtered and suspicious states are taxonomy-aware: phishing/scam show a red "Quarantined · [threat]" label with "Not a Threat — Approve" (amber styling) and no "Move to Spam" option; transactional shows "Auto-archived · System email"; spam/promotional show the default filtered label with approve only. Uses `getFilteredCategoryMeta()` from `messageHelpers`.
- **`MessageSignalBadges`** — Inline badges for spam category, SLA, attachments, etc. Badge tooltips use `humanizeSignalFlag` for readable signal lists.
- **Rules settings (all 4 active rule tables)** — All four rule tables with admin UIs (Spam, Detection, KB Detection, Routing) now use the shared `RuleEditor<TRule, TFormData>` component + `useRuleManagement` hook. The `prettifyRulePattern` utility (`FE-app/src/lib/prettifyRulePattern.ts`) formats raw regex/pipe patterns into human-readable labels in all four tables. Per-type fields (Severity/Confidence/Weight) are injected via `prefixColumns`/`suffixColumns` props. This unification was delivered as Wave 5 workstream D commits 1-3 (2026-06-04); commit 4 (column-level dept filter) is pending the dept-switcher store.
- **`SpamRulesSettings`** — Spam rule management table in Settings. Filter tabs (All / Manual / Auto-learned) split manually-created rules from feedback_ rules written by the feedback loop. Auto-learned rules show a `Brain` icon badge, have edit disabled (delete allowed so agents can remove incorrect learned rules), and are not counted in the manual total.
- **`MessagesKanbanView`** — dnd-kit Kanban board for status transitions.

### Tickets
- **`TicketDetail`** — Full ticket view with linked message, Jira sync status, and comments.
- **`TicketComments`** — Real-time comment thread (4 socket events).
- **`TicketsKanbanView`** — dnd-kit Kanban for ticket status transitions.
- **`TicketsJiraDialogs`** — Push-to-Jira and sync-from-Jira dialogs.

### Shared
- **`RichTextEditor`** — Tiptap-based editor; used in replies, KB entries, email templates.
- **`WebSocketStatus`** / **`WebSocketDebug`** — Connection indicator (sidebar); debug panel shown only in `import.meta.env.DEV`.
- **`RuleEditor<TRule, TFormData>`** (`components/shared/RuleEditor.tsx`) — Generic rule management table used by all 4 active rule-type settings pages (Spam, Detection, KB Detection, Routing). Accepts `prefixColumns`/`suffixColumns` for per-type scoring fields, `renderBanners` for custom headers (Routing uses this for the source/dept picker), `renderFormFields` for per-type form layout, and a `placeholder` prop for empty states. Works with `useRuleManagement` hook for ref-stable CRUD callbacks.
- **`DepartmentMultiPicker`** (`components/shared/DepartmentMultiPicker.tsx`) — Multi-select dept picker used in source forms and KB source settings.
- **UI primitives** (`components/ui/`) — Button, IconButton, Card, Dialog, Drawer, AlertDialog, ConfirmDialog, Input, Badge, Pagination, Progress, ReactSelect, SearchInput, ListCard, ExternalLink, LoadingSpinner.

---

## Known Issues / Deferred Items

| ID | Severity | Location | Description |
|----|---------|---------|-------------|
| CHAT-CTL-LOW-01 | Low | Chat widget controller | Chat widget uses `req.user?.organizationId` instead of `requireOrganizationContext`. Cosmetic inconsistency — deferred. |
| WS-CONN | Cosmetic | `socketManager.ts` | Connection count reaches 8-9 on dashboard load — expected (multiple components each call `getSocket()`). The 1-second disconnect buffer handles React StrictMode double-mounts correctly. |
| FE-Q-H-01 | Medium | `DashboardPage.tsx` | ~17 parallel API requests on every mount with no React Query cache. Deferred — needs React Query migration for the stats fetch. |

---

## 2026-06-02 Session v2 — KanbanCard parity with list view

`FE-app/src/components/messages/KanbanCard.tsx` was rewritten to close a regression where outgoing-latest threads showed the agent's email as "from" and were missing every signal badge.

### Sender resolution
Uses `thread.sender` (= `conversations.requesterEmail`, always the customer) instead of `msg.sender` (= the latest event's `authorEmail`, which is the agent for `agent_reply` latest). Customer name/email now shows consistently regardless of which event is latest.

### Direction arrow
Small arrow next to sender driven by `thread.lastReplyFromClient`:
- `true` → ← amber "Customer replied — awaiting our response"
- `false` → → muted "We replied — awaiting customer"
- `null` → no arrow

Lets standalone cards (e.g. in all-threads views) read correctly without depending on the kanban column.

### Signal evaluation
Computes `signalMessage = thread.latestIncomingMessage ?? msg` so spam/contradiction/needs-info/SLA signals stay focused on the customer-side message even after the agent replies (those signals are meaningless on `agent_reply` metadata).

### Badges shown
All from `MessageSignalBadges` (shared with list view) plus card-local additions:
- SLA breached / at risk
- Spam / suspicious / contradiction / unusual-attachment / needs-info / needs-review
- Attachment paperclip with count (from MessageSignalBadges)
- **Fallback paperclip** when `msg.attachmentCount > 0` but the chosen `signalMessage` lacks them — covers agent-side attachments on the latest event
- Priority pill
- Category (from `analysis.suggestedCategory` via `getCategoryDisplay`)
- Lead pill with stage colour from `STAGE_COLORS`
- Bot Replied (from `metadata.autoReply.sent`)
- Assignee with name/icon
- Ticket pill (with "In progress" suffix when `linkedTicketStatus === 'in_progress'`)
- Thread length (`messageCount` when > 1)
- `#id` monospace

### Removed
The `!weRepliedLast &&` wrap around `MessageSignalBadges` that I'd accidentally added — it was meant to suppress only the SLA pill in the Awaiting column but was also hiding attachment/spam/contradiction badges. `MessageSignalBadges`' internal SLA logic already gates correctly via `lastReplyFromClient`, so the prop became a no-op (kept in the type signature for call-site compatibility).

### Layout
`flex flex-wrap gap-1 items-center` so badges wrap cleanly in narrow kanban columns. Card stays compact at `h-4 px-1 text-[10px]`.

## 2026-06-02 Session — additional changes

### Per-event attachment chip fix

`FE-app/src/components/messages/MessageAttachments.tsx` — `Attachment.messageId` renamed to `messageEventId` (line 12). BE has always returned `messageEventId` (the actual column); FE was mismatched.

`FE-app/src/components/messages/MessageDetail.tsx:234-238` — grouping loop reads `att.messageEventId` instead of `att.messageId`. Before the fix, the `att.messageId === null` check returned `undefined`, never `null`, so every attachment landed under `Map<undefined>`. `flatAttachments` worked (Files tab) because `Map.values().flat()` ignores keys, but per-event `attachmentsByMessageId.get(msg.id)` returned undefined — paperclip chips silently missing next to each thread message.

### Gmail OAuth popup overhaul (full details in "Auth Flow → Gmail OAuth Flow" section above)

- `FE-app/src/services/gmail-oauth.service.ts` — synchronous `window.open('about:blank', ...)` to preserve user-gesture; new `redirectToOAuth()` and `consumePendingRedirectResult()` for the hard-blocked fallback path; `POPUP_BLOCKED` error marker for caller to switch into the banner UI
- `FE-app/src/pages/OAuthCallbackPage.tsx` — when no `window.opener` AND `gmail_oauth_pending_config` in sessionStorage, redirects to `/settings#integrations` instead of attempting `window.close()` (which is blocked for windows not opened by script)
- `FE-app/src/components/settings/integrations/GmailIntegrationCard.tsx` — detects `POPUP_BLOCKED`, shows amber banner with browser-specific copy + retry + redirect + manual-anchor escape hatch; mount effect calls `consumePendingRedirectResult()` to finish OAuth that came back via full-page redirect
- `FE-app/src/lib/browserDetect.ts` (new) — `detectBrowser()` + `getPopupUnblockInstructions(browser)` for the banner copy
