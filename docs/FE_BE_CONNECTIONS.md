> ⚠️ **MAY BE STALE — RE-VERIFY (moved into FE-app/docs 2026-07).** This is a
> structural FE↔BE reference; the BE has shipped through v1.1.106 and the FE through
> v1.1.39 since it was last fully walked. Trust the shape (auth flow, WS events, route
> groups), but verify specific endpoints against `BE-service/src/routes/` before relying on them.
>
> Generated: 2026-05-28. Last verified: 2026-05-31. **STALE WARNING (2026-06-19)**: this doc has not been re-walked through the full BE since 2026-05-31. Endpoints added since: `GET /api/learning/suggestions/:id/evidence`, `POST /api/learning/suggestions/:id/edit-rule`, `POST /api/learning/suggestions/:id/merge-rules`. Many smaller surface changes across inbox routing, learning engine, and seed versioning. Treat this doc as a structural reference, not an exhaustive endpoint catalog — verify against `BE-service/src/routes/` for the current truth.
>
> Original 2026-05-31 changelog preserved below for context. Living reference: FE-to-BE endpoint mapping, WebSocket subscriptions, and auth flow.
>
> _2026-05-31_: added provider_disabled WS event to §3; noted threadId payload on message:replied/send-failed; logic audit MED+LOW pass complete. Previous: added logout, check-emails, contact profiles/by-email; fixed validate-invitation method; corrected SLA config caller; noted orphaned AdminPlansPage; updated WS auth to cookie-only; removed stale Bearer token claim from §2; added §7 BE Route Groups with mount-level middleware; verified users/organizations now have requireActiveSubscription; noted aiSuggestionLimiter on enhance-ticket; noted HTML sanitization on PUT /api/email-templates/:type; noted ReDoS guard on detection-rules create/update.

# FE-BE Connections Reference

**Project:** Odly — multi-tenant customer-support SaaS  
**FE root:** `FE-app/src/` · **BE root:** `BE-service/src/`  
**Central API client:** `FE-app/src/lib/api-client.ts` (axios, see §2)

---

## Table of Contents

1. [Auth Flow (end-to-end)](#1-auth-flow-end-to-end)
2. [Central API Client & Token Handling](#2-central-api-client--token-handling)
3. [WebSocket Subscriptions](#3-websocket-subscriptions)
4. [Per-Page API Call Map](#4-per-page-api-call-map)
   - [Dashboard](#dashboard--dashboardpagetsx)
   - [Messages / Inbox](#messages--inbox-messagespagetsx--messagedetailpagetsx)
   - [Tickets](#tickets-ticketspagetstx--ticketdetailpagetsx--createticketpagetsx--editticketpagetsx)
   - [Knowledge Base](#knowledge-base-knowledgebasepagetstx)
   - [Statistics](#statistics-statisticspagetsx)
   - [SLA Dashboard](#sla-dashboard-sladashboardpagetsx)
   - [Billing Dashboard](#billing-dashboard-billingdashboardpagetsx)
   - [Audit Logs](#audit-logs-auditlogspagetstx)
   - [Users](#users-userspagetstx)
   - [Organization / Settings](#organization--settings-organizationpagetsx--settingspagetsx)
   - [Integrations (within Settings)](#integrations-within-settings)
   - [Documentation (within Settings)](#documentation-within-settings)
   - [AI Modules](#ai-modules-aimodulespagetstx)
   - [Pricing / Subscription](#pricing--subscription-pricingpagetsx--subscriptionpagetsx)
   - [Usage Stats](#usage-stats-usagestatspagetstx)
   - [Email Templates](#email-templates-emailtemplatespagetstx)
   - [Admin Pages (global-admin only)](#admin-pages-global-admin-only)
   - [Auth Pages](#auth-pages)
5. [Key Shared Services Summary](#5-key-shared-services-summary)
6. [Gaps](#6-gaps)
7. [BE Route Groups — Mount-level Middleware](#7-be-route-groups--mount-level-middleware)

---

## 1. Auth Flow (end-to-end)

### Login sequence

```
LoginPage.tsx
  │
  ├─ 1. POST /api/auth/check-email  { email, captchaToken }
  │        → { success: true }  (constant-time, NO disclosure of user existence or orgs)
  │        Captcha-gated entry step. Replaced legacy /verify-user which leaked
  │        org membership pre-auth (removed in commit 8deb52e).
  │
  ├─ 2. POST /api/auth/login  { email, password, captchaToken }
  │        organizationSlug is optional — legacy single-step API consumers can
  │        still pass it. The FE multi-step flow omits it and resolves orgs via
  │        the picker below.
  │        Returns one of four shapes:
  │          a) Full login: { user }                                        ← single-org, no 2FA
  │          b) Multi-org picker: { requiresOrgSelection, tempToken, organizations }
  │          c) 2FA required: { twoFactorRequired: true, tempToken }
  │          d) 2FA setup required: { twoFactorRequired, twoFactorSetupRequired, tempToken }
  │
  ├─ 2a. POST /api/auth/select-organization  { tempToken, organizationId, captchaToken }
  │        → either a Full login (a), 2FA required (c), or 2FA setup (d).
  │        Single-use via Redis jti (audit K2). Captcha mirrors /login in prod.
  │
  ├─ 2b. POST /api/auth/2fa/authenticate  { tempToken, code }
  │        → { token, user }  (exchanges TOTP code for full JWT)
  │
  └─ 2c. POST /api/auth/2fa/forced-setup  { tempToken }
         POST /api/auth/2fa/forced-enable  { tempToken, code }
              → { token, user }  (forced TOTP setup during login)
```

### Token storage and propagation

| Aspect            | Detail                                                                                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookie            | BE sets `jwt` as `httpOnly; Secure; SameSite=Strict` — present on every cross-origin request automatically                                                                                                                                                        |
| localStorage      | `auth-storage` (Zustand `persist`) stores `{ user, isAuthenticated, selectedOrganizationId }`. Token intentionally **not** persisted to localStorage (see BE_OVERVIEW known-deferred M-02)                                                                        |
| Request header    | `apiClient` request interceptor reads `selectedOrganizationId` from the Zustand store and sets `X-Organization-Context: <id>` on every outgoing request. **No `Authorization: Bearer` header is added** — authentication relies entirely on the `httpOnly` cookie |
| 401 response      | Response interceptor calls `useAuthStore.getState().logout()`, clears `sessionStorage`, redirects to `/login`                                                                                                                                                     |
| WS auth           | Socket.IO connection uses `withCredentials: true` — the `httpOnly` cookie is forwarded to the BE WS handshake                                                                                                                                                     |
| WS auth rejection | `socketManager.ts` `connect_error` handler: if BE rejects with "Session has been invalidated" / "Invalid or expired token" / "Authentication required" → clears `auth-storage` from localStorage and redirects to `/login`                                        |

### Auth store (`FE-app/src/stores/authStore.ts`)

`useAuthStore` (Zustand + `persist`):

- `login(token, user)` — sets `isAuthenticated: true`, stores user
- `logout()` — calls `forceDisconnect()` on WS, clears `similarResultsCache`, resets state
- `setSelectedOrganization(id)` — persists selected org ID (used in `X-Organization-Context` header)

### Protected route guard

Routes in `App.tsx` are wrapped in an `<AuthGuard>` / `<ProtectedRoute>` component that reads `isAuthenticated` from `useAuthStore`. Unauthenticated access redirects to `/login`.

### Token invalidation (jwtVersion)

BE `authenticate` middleware and WS handshake check `jwtVersion` in the JWT against `users.jwt_version` in DB (Redis-cached 60 s TTL). Mismatch on any request → 401 → FE interceptor triggers logout flow.

### Other auth endpoints (FE callers)

| FE Service            | Method | Endpoint                        | Purpose                                                              |
| --------------------- | ------ | ------------------------------- | -------------------------------------------------------------------- |
| `authService`         | POST   | `/api/auth/register`            | Register via invitation token                                        |
| `authService`         | GET    | `/api/auth/verify-email`        | Email verification link handler                                      |
| `authService`         | POST   | `/api/auth/resend-verification` | Resend verification email                                            |
| `authService`         | POST   | `/api/auth/forgot-password`     | Send password reset email                                            |
| `authService`         | POST   | `/api/auth/reset-password`      | Apply new password via token                                         |
| `authService`         | POST   | `/api/auth/change-password`     | Change password (authenticated)                                      |
| `twoFactorService`    | GET    | `/api/auth/2fa/status`          | Check if 2FA enabled for user                                        |
| `twoFactorService`    | GET    | `/api/auth/2fa/setup`           | Get TOTP QR code + secret                                            |
| `twoFactorService`    | POST   | `/api/auth/2fa/enable`          | Enable TOTP with verification code                                   |
| `twoFactorService`    | POST   | `/api/auth/2fa/disable`         | Disable TOTP                                                         |
| `invitationService`   | POST   | `/api/auth/validate-invitation` | Validate invitation token — body `{ token }` (SignupPage)            |
| `Layout.tsx` (direct) | POST   | `/api/auth/logout`              | Clears httpOnly cookie; called on logout before `authStore.logout()` |

---

## 2. Central API Client & Token Handling

**File:** `FE-app/src/lib/api-client.ts`

- Built on `axios`, `baseURL` from `API_BASE_URL` env var
- `withCredentials: true` — sends httpOnly `jwt` cookie on every request
- **Request interceptor** (runs on every outgoing call):
  1. Strips `Content-Type` for `FormData` (lets browser set correct multipart boundary)
  2. Reads `selectedOrganizationId` from the Zustand `useAuthStore` state directly (no `localStorage` parse) → adds `X-Organization-Context` header if present
  3. Logs a warning if no org context is set
- **No `Authorization: Bearer` header** — the interceptor does not read or forward a token string. All API authentication relies on the `httpOnly` cookie sent automatically by the browser.
- **Response interceptor**:
  - On HTTP 401 (and not already on an auth page) → `useAuthStore.logout()` + `sessionStorage.clear()` + redirect `/login`
  - On 5xx errors: replaces internal details with a generic "A server error occurred" message
  - On 4xx errors: extracts `error`/`message` from response body into an `Error` with `.status` and `.data`

All 30 `FE-app/src/services/*.ts` files import `apiClient` from this module.

---

## 3. WebSocket Subscriptions

**Socket manager:** `FE-app/src/lib/socketManager.ts`  
**Transport:** Socket.IO with `websocket` → `polling` fallback  
**Auth:** `withCredentials: true` — the `httpOnly` cookie is forwarded on the WS handshake. No separate `auth: { token }` option is used.  
**Org rooms:** FE emits `join-organization` with `organizationId` after connect; BE scopes events to `org-{id}` room

| Event                 | Subscriber                                        | FE File                                              | Action on Receipt                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email:processing`    | `useEmailProcessingSocket`                        | `FE-app/src/hooks/useEmailProcessingSocket.ts`           | Updates per-integration session state (started / found / processing / processed / complete / error / linked). Drives the email ingestion progress widget on Dashboard. Filtered by `organizationId` when `filterByOrganization` is set.                                                        |
| `kb:progress`         | `useEmailProcessingSocket` (via `makeKBHandlers`) | `FE-app/src/hooks/useEmailProcessingKBHandlers.ts`       | Updates KB-processing sub-state within the same session (kbEntriesTotal, kbQAPairs, kbDocuments)                                                                                                                                                                                               |
| `kb:completed`        | `useEmailProcessingSocket` (via `makeKBHandlers`) | `FE-app/src/hooks/useEmailProcessingKBHandlers.ts`       | Marks KB processing as complete for the integration session                                                                                                                                                                                                                                    |
| `telegram:processing` | `useTelegramProcessing`                           | `FE-app/src/hooks/useTelegramProcessing.ts`              | Tracks live Telegram bot activity: bot_started / message_received / processing / processed / reply_sent / error. Drives Telegram status widget on Dashboard.                                                                                                                                   |
| `sla_breach`          | `useSLANotifications`                             | `FE-app/src/hooks/useSLANotifications.ts`                | Appends a new `SLABreachNotification` to state; increments `unreadCount`. Deduplicated via `seenIds` Set. Filtered by `UserPrefs` (severity, type, assignedToMe). Drives the `SLANotificationBell` in Layout.                                                                                  |
| `ticket:updated`      | `useTicketsRealtime`                              | `FE-app/src/hooks/useTicketsRealtime.ts`                 | Clears ticket cache, re-fetches current page; if the updated ticket is currently selected, re-fetches it individually. Payload: `{ ticketId, jiraKey, changedFields? }`.                                                                                                                       |
| `ticket:created`      | `useTicketsRealtime`                              | `FE-app/src/hooks/useTicketsRealtime.ts`                 | Clears ticket cache and re-fetches current page.                                                                                                                                                                                                                                               |
| `stats:update`        | `DashboardPage`                                   | `FE-app/src/pages/DashboardPage.tsx`                     | Re-runs `fetchStats()` to refresh all dashboard counters                                                                                                                                                                                                                                       |
| `provider_disabled`   | `AIProvidersSettings`                             | `FE-app/src/components/settings/AIProvidersSettings.tsx` | Emitted when an AI provider is auto-disabled after a health check failure (`aiProviderHealthService.ts`). Payload: `{ organizationId, providerId, provider, name, reason }`. Handler refreshes the integration list and shows a warning AlertDialog with the provider name and failure reason. |
| `message:replied`     | `MessageDetail`                                   | `FE-app/src/components/messages/MessageDetail.tsx`       | Inbound notification that a reply was sent. Payload now includes `threadId` so the handler can filter to the currently-viewed thread.                                                                                                                                                          |
| `send-failed`         | `MessageDetail`                                   | `FE-app/src/components/messages/MessageDetail.tsx`       | Inbound notification that a reply failed. Payload now includes `threadId`.                                                                                                                                                                                                                     |

### Socket lifecycle

- `getSocket()` — creates singleton Socket.IO connection (or returns existing); increments `connectionCount`
- `releaseSocket()` — decrements `connectionCount`; schedules disconnect (1 s delay) when reaches 0 — avoids React StrictMode double-mount disconnect
- `forceDisconnect()` — called on logout; immediately disconnects and clears all state
- `joinOrganizationRoom(orgId)` / `leaveOrganizationRoom(orgId)` — tracks active rooms and auto-rejoins on reconnect
- `subscribeToEvent` / `unsubscribeFromEvent` — multiplexed listeners (single underlying socket listener per event, N callbacks)

---

## 4. Per-Page API Call Map

### Dashboard (`DashboardPage.tsx`)

On mount, fires `Promise.all` of ~17 parallel calls:

| FE Component           | Method | Endpoint                                                           | Purpose                                    |
| ---------------------- | ------ | ------------------------------------------------------------------ | ------------------------------------------ |
| `DashboardPage`        | GET    | `/api/messages/threads?view=work_queue&slaBreached=true&limit=1`   | Count SLA-breached messages                |
| `DashboardPage`        | GET    | `/api/messages/threads?view=work_queue&slaAtRisk=true&limit=1`     | Count at-risk messages                     |
| `DashboardPage`        | GET    | `/api/sla/summary`                                                 | Avg first-response time, breach counts     |
| `DashboardPage`        | GET    | `/api/messages/threads?view=resolved&excludeKB=true&limit=1`       | Resolved message count                     |
| `DashboardPage`        | GET    | `/api/messages/threads?view=active&processed=closed&limit=1`       | Closed message count                       |
| `DashboardPage`        | GET    | `/api/messages/threads?view=inbox&excludeNotAnalysed=true&limit=1` | Active inbox count                         |
| `DashboardPage`        | GET    | `/api/messages/threads?view=client_replied&...&limit=1`            | Client-replied count                       |
| `DashboardPage`        | GET    | `/api/messages/threads?view=awaiting_response&...&limit=1`         | Awaiting response count                    |
| `DashboardPage`        | GET    | `/api/messages/threads?view=suspicious&limit=1`                    | Suspicious message count                   |
| `DashboardPage`        | GET    | `/api/messages/threads?view=not_analysed&limit=1`                  | Not-analysed count                         |
| `DashboardPage`        | GET    | `/api/messages/threads?view=resolved&limit=1`                      | Total resolved count                       |
| `DashboardPage`        | GET    | `/api/tickets?status=open&limit=1`                                 | Open ticket count                          |
| `DashboardPage`        | GET    | `/api/tickets?status=in_progress&limit=1`                          | In-progress ticket count                   |
| `DashboardPage`        | GET    | `/api/tickets?status=pending&limit=1`                              | Pending ticket count                       |
| `DashboardPage`        | GET    | `/api/knowledge-base/entries?type=qa_pair&limit=1`                 | KB Q&A pair count                          |
| `DashboardPage`        | GET    | `/api/knowledge-base/entries?type=document&limit=1`                | KB document count                          |
| `DashboardPage`        | GET    | `/api/documentation/stats`                                         | Documentation chunk stats                  |
| `DashboardPage`        | GET    | `/api/integrations`                                                | Detect email/Telegram integration presence |
| `DashboardPage`        | POST   | `/api/ingestion/start-all`                                         | Manual trigger: start all ingestion        |
| `DashboardPage`        | POST   | `/api/ingestion/email/check`                                       | Manual trigger: check email now            |
| `DashboardPage`        | POST   | `/api/ingestion/telegram/start`                                    | Manual trigger: start Telegram bots        |
| `useSystemHealth` hook | GET    | `/api/health/status`                                               | System service health (DB, email, WS, AI)  |

Also subscribes to: `stats:update` (socket), `email:processing` (via `useEmailProcessing`), `telegram:processing` (via `useTelegramProcessing`)

---

### Messages / Inbox (`MessagesPage.tsx` + `MessageDetailPage.tsx`)

| FE Component              | Method | Endpoint                                    | Purpose                                                                                                                       |
| ------------------------- | ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `MessagesPage`            | GET    | `/api/messages/metadata`                    | Total/page counts, unprocessed/resolved/spam counts                                                                           |
| `MessagesPage`            | GET    | `/api/messages/threads`                     | Paginated thread list (all filter combinations)                                                                               |
| `MessagesPage`            | GET    | `/api/messages`                             | Flat message list (alternative view)                                                                                          |
| `MessagesPage`            | GET    | `/api/messages/:id`                         | Load single message for detail pane                                                                                           |
| `MessagesPage`            | POST   | `/api/messages/:id/process`                 | Mark message as processed (optionally attach ticketId)                                                                        |
| `MessagesPage`            | POST   | `/api/messages/:id/unprocess`               | Mark message as unprocessed                                                                                                   |
| `MessagesPage`            | POST   | `/api/messages/:id/reopen`                  | Reopen resolved message                                                                                                       |
| `MessagesPage`            | DELETE | `/api/messages/:id`                         | Soft-delete message                                                                                                           |
| `MessagesPage`            | PATCH  | `/api/messages/:id/classify`                | Classify: approve / mark_suspicious / move_to_spam                                                                            |
| `MessageDetailPage`       | GET    | `/api/messages/:id`                         | Full message detail                                                                                                           |
| `MessageDetailPage`       | GET    | `/api/messages/:id/thread`                  | Full thread message list                                                                                                      |
| `MessageDetail` component | GET    | `/api/messages/:id/suggested-answer`        | AI-suggested reply draft                                                                                                      |
| `MessageDetail` component | POST   | `/api/messages/:id/suggested-answer/save`   | Save a chosen suggested answer                                                                                                |
| `MessageDetail` component | GET    | `/api/messages/:id/similar-resolved`        | Similar resolved messages (RAG search)                                                                                        |
| `MessageDetail` component | GET    | `/api/messages/:id/kb-references`           | KB entries referenced by this message                                                                                         |
| `MessageDetail` component | GET    | `/api/messages/:id/attachments`             | List all attachments across the conversation's events. Response: `{ success, data: Attachment[] }` where each attachment carries `messageEventId` (NOT `messageId`) tying it to a specific `message_events` row. FE groups by `messageEventId` for per-event paperclip chips; flat list also feeds the Files tab |
| `MessageDetail` component | GET    | `/api/messages/:id/activity`                | Activity/audit log for message                                                                                                |
| `MessageDetail` component | POST   | `/api/messages/:id/reply`                   | Send reply (text only)                                                                                                        |
| `MessageDetail` component | POST   | `/api/messages/:id/reply`                   | Send reply with attachments (multipart)                                                                                       |
| `MessageDetail` component | POST   | `/api/messages/:id/resolve`                 | Resolve message                                                                                                               |
| `MessageDetail` component | POST   | `/api/messages/:id/close`                   | Close message                                                                                                                 |
| `MessageDetail` component | POST   | `/api/messages/:id/analyze`                 | Re-analyze message via AI                                                                                                     |
| `MessageDetail` component | POST   | `/api/messages/:id/check-contradiction`     | Check for contradictions in thread                                                                                            |
| `MessageDetail` component | PATCH  | `/api/messages/:id/status`                  | Change status                                                                                                                 |
| `MessageDetail` component | PATCH  | `/api/messages/:id/priority`                | Change priority                                                                                                               |
| `MessageDetail` component | PATCH  | `/api/messages/:id/category`                | Assign category                                                                                                               |
| `MessageDetail` component | PATCH  | `/api/messages/:id/lead`                    | Toggle lead flag                                                                                                              |
| `MessageDetail` component | PATCH  | `/api/messages/:id/lead-state`              | Update lead contact info / qualification fields                                                                               |
| `MessageDetail` component | GET    | `/api/messages/:id/linked-ticket`           | Get ticket linked to message                                                                                                  |
| `MessageNotes` component  | GET    | `/api/messages/:id/notes`                   | Fetch internal notes                                                                                                          |
| `MessageNotes` component  | POST   | `/api/messages/:id/notes`                   | Add internal note                                                                                                             |
| `MessageNotes` component  | PATCH  | `/api/messages/:id/notes/:noteId`           | Edit note                                                                                                                     |
| `MessageNotes` component  | DELETE | `/api/messages/:id/notes/:noteId`           | Delete note                                                                                                                   |
| `ContactsView` component  | GET    | `/api/messages/contacts`                    | Paginated sender/contact list                                                                                                 |
| `ContactsView` component  | GET    | `/api/messages/contacts/subjects`           | Per-sender subject groupings                                                                                                  |
| `contactService`          | GET    | `/api/contacts?search=&page=&limit=`        | Paginated contact list                                                                                                        |
| `contactService`          | GET    | `/api/contacts/by-email?email=`             | Lookup contact by email address                                                                                               |
| `contactService`          | PATCH  | `/api/contacts/:id`                         | Update displayName or assignedUserId                                                                                          |
| `contactService`          | POST   | `/api/contacts/:id/notes`                   | Add note to contact                                                                                                           |
| `contactService`          | DELETE | `/api/contacts/:id/notes/:noteId`           | Delete contact note                                                                                                           |
| `contactService`          | POST   | `/api/contacts/:id/labels`                  | Attach label to contact                                                                                                       |
| `contactService`          | DELETE | `/api/contacts/:id/labels/:labelId`         | Remove label from contact                                                                                                     |
| `contactService`          | POST   | `/api/contacts/:id/links`                   | Link two contacts together                                                                                                    |
| `contactService`          | DELETE | `/api/contacts/:id/links/:linkedId`         | Unlink contacts                                                                                                               |
| `contactService`          | POST   | `/api/contacts/:id/profiles`                | Add profile entry (email/telegram/slack) to contact                                                                           |
| `contactService`          | DELETE | `/api/contacts/:id/profiles/:profileId`     | Delete profile entry                                                                                                          |
| `assignmentService`       | GET    | `/api/assignments/assignable-users`         | List users eligible for assignment                                                                                            |
| `assignmentService`       | PATCH  | `/api/assignments/messages/:id/assign`      | Assign message to user                                                                                                        |
| `assignmentService`       | PATCH  | `/api/assignments/threads/:threadId/assign` | Assign thread to user                                                                                                         |
| `labelService`            | GET    | `/api/labels/messages/:id`                  | Labels on a message                                                                                                           |
| `labelService`            | POST   | `/api/labels/messages/:id/:labelId`         | Assign label to message                                                                                                       |
| `labelService`            | DELETE | `/api/labels/messages/:id/:labelId`         | Remove label from message                                                                                                     |
| `useTranslation` hook     | POST   | `/api/translation/messages/:id/translate`   | Translate message content                                                                                                     |
| `useTranslation` hook     | GET    | `/api/translation/messages/:id/stream`      | Stream translated message                                                                                                     |
| `useTranslation` hook     | GET    | `/api/translation/languages`                | Available languages                                                                                                           |
| `MessagesPage` (direct)   | POST   | `/api/messages/check-emails`                | Manual "check now" button in inbox header — triggers per-integration email fetch (separate from `/api/ingestion/email/check`) |

---

### Tickets (`TicketsPage.tsx` + `TicketDetailPage.tsx` + `CreateTicketPage.tsx` + `EditTicketPage.tsx`)

| FE Component               | Method | Endpoint                                 | Purpose                                             |
| -------------------------- | ------ | ---------------------------------------- | --------------------------------------------------- |
| `TicketsPage`              | GET    | `/api/tickets/metadata`                  | Total/page counts, open/resolved/in-progress counts |
| `TicketsPage`              | GET    | `/api/tickets`                           | Paginated ticket list with filters                  |
| `TicketsPage`              | GET    | `/api/tickets/:id`                       | Load ticket for detail pane                         |
| `TicketsPage`              | DELETE | `/api/tickets/:id`                       | Delete ticket                                       |
| `TicketsPage`              | POST   | `/api/tickets/:id/jira`                  | Push single ticket to Jira                          |
| `TicketsPage`              | POST   | `/api/tickets/sync/jira`                 | Sync all tickets to Jira                            |
| `TicketsKanbanView`        | GET    | `/api/tickets`                           | Kanban column data                                  |
| `TicketDetailPage`         | GET    | `/api/tickets/:id`                       | Full ticket                                         |
| `TicketDetailPage`         | DELETE | `/api/tickets/:id`                       | Delete                                              |
| `EditTicketPage`           | GET    | `/api/tickets/:id`                       | Load ticket for editing                             |
| `EditTicketPage`           | PUT    | `/api/tickets/:id`                       | Update ticket                                       |
| `CreateTicketPage`         | GET    | `/api/messages/:id`                      | Pre-fill ticket from message                        |
| `CreateTicketPage`         | GET    | `/api/messages/:id/thread`               | Thread context for ticket creation                  |
| `CreateTicketPage`         | POST   | `/api/tickets`                           | Create ticket (with optional attachments)           |
| `TicketDetail` component   | GET    | `/api/messages`                          | Messages linked to ticket (`?ticketId=`)            |
| `TicketDetail` component   | GET    | `/api/tickets/:ticketId/comments`        | Ticket comments                                     |
| `TicketDetail` component   | POST   | `/api/tickets/:ticketId/comments`        | Add comment                                         |
| `TicketDetail` component   | POST   | `/api/tickets/:ticketId/comments/sync`   | Sync comments from Jira                             |
| `commentsService`          | PUT    | `/api/comments/:id`                      | Update comment                                      |
| `commentsService`          | DELETE | `/api/comments/:id`                      | Delete comment                                      |
| `commentsService`          | POST   | `/api/comments/:commentId/attachments`   | Upload attachments to comment                       |
| `commentsService`          | DELETE | `/api/attachments/:id`                   | Delete attachment                                   |
| `commentsService`          | GET    | `/api/tickets/:ticketId/attachments`     | List ticket attachments                             |
| `SimilarTickets` component | GET    | `/api/tickets/:id/similar`               | Similar tickets by embedding                        |
| `SimilarTickets` component | GET    | `/api/messages/:id/similar-resolved`     | Similar resolved messages                           |
| `assignmentService`        | PATCH  | `/api/assignments/tickets/:id/assign`    | Assign ticket to user                               |
| `labelService`             | GET    | `/api/labels/tickets/:id`                | Labels on a ticket                                  |
| `labelService`             | POST   | `/api/labels/tickets/:id/:labelId`       | Assign label to ticket                              |
| `labelService`             | DELETE | `/api/labels/tickets/:id/:labelId`       | Remove label from ticket                            |
| `useTranslation` hook      | POST   | `/api/translation/tickets/:id/translate` | Translate ticket                                    |
| `SimilarMessagesDialog`    | POST   | `/api/translation/text/translate`        | Translate arbitrary text snippet                    |

Also subscribes to: `ticket:updated` and `ticket:created` (via `useTicketsRealtime`)

---

### Knowledge Base (`KnowledgeBasePage.tsx`)

| FE Component        | Method | Endpoint                                  | Purpose                                            |
| ------------------- | ------ | ----------------------------------------- | -------------------------------------------------- |
| `KnowledgeBasePage` | GET    | `/api/knowledge-base/entries`             | Paginated KB list (type / search / status filters) |
| `KnowledgeBasePage` | PATCH  | `/api/knowledge-base/entries/:id/approve` | Approve pending entry                              |
| `KnowledgeBasePage` | PATCH  | `/api/knowledge-base/entries/:id/hide`    | Hide entry from agents                             |
| `KnowledgeBasePage` | PATCH  | `/api/knowledge-base/entries/:id`         | Update entry (title/content/category)              |
| `KnowledgeBasePage` | DELETE | `/api/knowledge-base/entries/:id`         | Delete entry                                       |

Note: `kbService` uses `/api/knowledge-base/entries` sub-path. The BE mounts the entries router at `/api/knowledge-base` with a `/entries` prefix internally.

---

### Statistics (`StatisticsPage.tsx`)

| FE Component     | Method | Endpoint                      | Purpose                                                   |
| ---------------- | ------ | ----------------------------- | --------------------------------------------------------- |
| `StatisticsPage` | GET    | `/api/statistics`             | Overview + channel breakdown + category trends + AI stats |
| `StatisticsPage` | GET    | `/api/statistics/team`        | Per-agent performance (days param)                        |
| `StatisticsPage` | GET    | `/api/statistics/users/:id`   | Single-user stats (days param)                            |
| `StatisticsPage` | GET    | `/api/statistics/messages`    | Resolution time, thread distribution, language breakdown  |
| `StatisticsPage` | GET    | `/api/statistics/ai`          | AI vs human reply ratio, model usage                      |
| `StatisticsPage` | GET    | `/api/statistics/labels`      | Label application frequency                               |
| `StatisticsPage` | GET    | `/api/knowledge-base/entries` | KB entry count (used on stats overview)                   |

---

### SLA Dashboard (`SLADashboardPage.tsx`)

| FE Component                   | Method | Endpoint                                 | Purpose                                                      |
| ------------------------------ | ------ | ---------------------------------------- | ------------------------------------------------------------ |
| `SLADashboardPage`             | GET    | `/api/sla/summary`                       | High-level SLA health summary                                |
| `SLADashboardPage`             | GET    | `/api/sla/statistics`                    | Detailed per-channel / per-priority stats (days param)       |
| `SLADashboardPage`             | GET    | `/api/sla/breaches`                      | List of recent breaches                                      |
| `SLADashboardPage`             | GET    | `/api/sla/trends`                        | Trend data (days / interval params)                          |
| `SLANotificationBell` (Layout) | GET    | `/api/notifications`                     | Load persisted SLA breach notifications                      |
| `useSLANotifications`          | PATCH  | `/api/notifications/:id/dismiss`         | Dismiss one notification                                     |
| `useSLANotifications`          | PATCH  | `/api/notifications/dismiss-all`         | Dismiss all notifications                                    |
| `useSLANotifications`          | GET    | `/api/users/me/notification-preferences` | Load user notification prefs (severity filter, assignedToMe) |
| `useSLANotifications`          | PUT    | `/api/users/me/notification-preferences` | Save notification pref changes                               |

---

### Billing Dashboard (`BillingDashboardPage.tsx`)

| FE Component           | Method | Endpoint                | Purpose                                            |
| ---------------------- | ------ | ----------------------- | -------------------------------------------------- |
| `BillingDashboardPage` | GET    | `/api/billing/summary`  | Active subscriptions, monthly spend, anomaly count |
| `BillingDashboardPage` | GET    | `/api/billing/records`  | Paginated charge records (anomalyOnly filter)      |
| `BillingDashboardPage` | GET    | `/api/billing/registry` | Vendor payment registry                            |
| `BillingDashboardPage` | GET    | `/api/billing/aging`    | Aging bucket report                                |

All four endpoints require the `billing-intelligence` AI module to be active on the org.

---

### Audit Logs (`AuditLogsPage.tsx`)

| FE Component    | Method | Endpoint                | Purpose                                                 |
| --------------- | ------ | ----------------------- | ------------------------------------------------------- |
| `AuditLogsPage` | GET    | `/api/audit-logs`       | Paginated audit log (action/entity/userId/date filters) |
| `AuditLogsPage` | GET    | `/api/audit-logs/stats` | Action/entity/user activity counts (last 30 days)       |

---

### Users (`UsersPage.tsx`)

| FE Component        | Method | Endpoint                           | Purpose                                       |
| ------------------- | ------ | ---------------------------------- | --------------------------------------------- |
| `UsersPage`         | GET    | `/api/users`                       | Paginated org user list                       |
| `UsersPage`         | GET    | `/api/users/:id`                   | Single user detail                            |
| `UsersPage`         | PUT    | `/api/users/:id`                   | Update user (role, department, etc.)          |
| `UsersPage`         | DELETE | `/api/users/:id`                   | Delete user                                   |
| `UsersPage`         | POST   | `/api/users`                       | Create user (admin direct-create)             |
| `UsersPage`         | GET    | `/api/users/me`                    | Current user profile                          |
| `UsersPage`         | PUT    | `/api/users/me`                    | Update own profile (signature, name, contact) |
| `UsersPage`         | GET    | `/api/users/:id/skill-values`      | User's routing-key skill values               |
| `UsersPage`         | PUT    | `/api/users/:id/skill-values/:key` | Set skill value                               |
| `UsersPage`         | DELETE | `/api/users/:id/skill-values/:key` | Delete skill key                              |
| `UsersPage`         | GET    | `/api/users/:id/can-edit-skills`   | Can user self-edit skills?                    |
| `UsersPage`         | PATCH  | `/api/users/:id/can-edit-skills`   | Toggle can-edit-skills flag                   |
| `UsersPage`         | GET    | `/api/users/me/skill-values`       | Own skill values                              |
| `UsersPage`         | PUT    | `/api/users/me/skill-values/:key`  | Set own skill value                           |
| `UsersPage`         | DELETE | `/api/users/me/skill-values/:key`  | Delete own skill key                          |
| `UsersPage`         | GET    | `/api/users/me/can-edit-skills`    | Check own edit-skills permission              |
| `invitationService` | POST   | `/api/invitations`                 | Send invitation                               |
| `invitationService` | GET    | `/api/invitations`                 | List pending invitations                      |
| `invitationService` | DELETE | `/api/invitations/:id`             | Cancel invitation                             |

---

### Organization / Settings (`OrganizationPage.tsx` + `SettingsPage.tsx`)

#### Organization settings

| FE Component                           | Method | Endpoint                                 | Purpose                        |
| -------------------------------------- | ------ | ---------------------------------------- | ------------------------------ |
| `OrganizationPage`                     | GET    | `/api/organizations/current`             | Current org details            |
| `OrganizationPage`                     | PATCH  | `/api/organizations/current`             | Update org name / description  |
| `OrganizationPage`                     | GET    | `/api/organizations/members`             | Org member list                |
| `OrganizationPage`                     | POST   | `/api/organizations/:id/members`         | Add member                     |
| `OrganizationPage`                     | DELETE | `/api/organizations/:id/members/:userId` | Remove member                  |
| `OrganizationPage`                     | GET    | `/api/organizations/auto-reply`          | Auto-reply config              |
| `OrganizationPage`                     | PATCH  | `/api/organizations/auto-reply`          | Update auto-reply config       |
| `OrganizationPage`                     | GET    | `/api/organizations/lead-config`         | Lead qualification config      |
| `OrganizationPage`                     | PATCH  | `/api/organizations/lead-config`         | Update lead config             |
| `OrganizationPage`                     | GET    | `/api/organizations/routing-keys`        | Routing key list               |
| `OrganizationPage`                     | POST   | `/api/organizations/routing-keys`        | Add routing key                |
| `OrganizationPage`                     | DELETE | `/api/organizations/routing-keys/:key`   | Delete routing key             |
| `OrganizationPage`                     | GET    | `/api/organizations/auto-assign`         | Auto-assign mode               |
| `OrganizationPage`                     | PATCH  | `/api/organizations/auto-assign`         | Update auto-assign mode        |
| `OrganizationPage`                     | GET    | `/api/organizations/self-edit-skills`    | Agent skill self-edit config   |
| `OrganizationPage`                     | PATCH  | `/api/organizations/self-edit-skills`    | Update skill self-edit config  |
| `OrganizationPage`                     | GET    | `/api/organizations/security-settings`   | Security settings (require2FA) |
| `OrganizationPage`                     | PATCH  | `/api/organizations/security-settings`   | Update security settings       |
| `SLAConfigSettings` (SettingsPage tab) | GET    | `/api/organizations/sla-config`          | SLA threshold configuration    |
| `SLAConfigSettings` (SettingsPage tab) | PUT    | `/api/organizations/sla-config`          | Update SLA thresholds          |

#### Settings — categories, prompts, rules

| FE Component                      | Method | Endpoint                                      | Purpose                                                                                                                        |
| --------------------------------- | ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `CategoriesSettings`              | GET    | `/api/settings/categories`                    | List categories                                                                                                                |
| `CategoriesSettings`              | POST   | `/api/settings/categories`                    | Create category                                                                                                                |
| `CategoriesSettings`              | PUT    | `/api/settings/categories/:id`                | Update category                                                                                                                |
| `CategoriesSettings`              | DELETE | `/api/settings/categories/:id`                | Delete category                                                                                                                |
| `PromptsSettings`                 | GET    | `/api/settings/prompts`                       | List AI prompt templates                                                                                                       |
| `PromptsSettings`                 | GET    | `/api/settings/prompts/:id`                   | Get single prompt                                                                                                              |
| `PromptsSettings`                 | GET    | `/api/settings/prompts/name/:name`            | Get prompt by name                                                                                                             |
| `PromptsSettings`                 | POST   | `/api/settings/prompts`                       | Create prompt                                                                                                                  |
| `PromptsSettings`                 | PUT    | `/api/settings/prompts/:id`                   | Update prompt                                                                                                                  |
| `PromptsSettings`                 | DELETE | `/api/settings/prompts/:id`                   | Delete prompt                                                                                                                  |
| `SpamRulesSettings`               | GET    | `/api/settings/spam-rules`                    | List spam rules                                                                                                                |
| `SpamRulesSettings`               | POST   | `/api/settings/spam-rules`                    | Create spam rule                                                                                                               |
| `SpamRulesSettings`               | PUT    | `/api/settings/spam-rules/:id`                | Update spam rule                                                                                                               |
| `SpamRulesSettings`               | DELETE | `/api/settings/spam-rules/:id`                | Delete spam rule                                                                                                               |
| `DetectionRuleSettings`           | GET    | `/api/settings/detection-rules`               | List detection rules                                                                                                           |
| `DetectionRuleSettings`           | POST   | `/api/settings/detection-rules`               | Create detection rule — regex `pattern` validated for syntax and nested-quantifier ReDoS guard (`detectionRulesController.ts`) |
| `DetectionRuleSettings`           | PUT    | `/api/settings/detection-rules/:id`           | Update detection rule — same ReDoS guard applied                                                                               |
| `DetectionRuleSettings`           | DELETE | `/api/settings/detection-rules/:id`           | Delete detection rule                                                                                                          |
| `KnowledgeDetectionRulesSettings` | GET    | `/api/settings/knowledge-detection-rules`     | List KB detection rules                                                                                                        |
| `KnowledgeDetectionRulesSettings` | POST   | `/api/settings/knowledge-detection-rules`     | Create KB detection rule                                                                                                       |
| `KnowledgeDetectionRulesSettings` | PUT    | `/api/settings/knowledge-detection-rules/:id` | Update KB detection rule                                                                                                       |
| `KnowledgeDetectionRulesSettings` | DELETE | `/api/settings/knowledge-detection-rules/:id` | Delete KB detection rule                                                                                                       |
| `labelService`                    | GET    | `/api/labels`                                 | List labels                                                                                                                    |
| `labelService`                    | POST   | `/api/labels`                                 | Create label                                                                                                                   |
| `labelService`                    | PUT    | `/api/labels/:id`                             | Update label                                                                                                                   |
| `labelService`                    | DELETE | `/api/labels/:id`                             | Delete label                                                                                                                   |

#### Settings — spam logs

| FE Component                       | Method | Endpoint                 | Purpose                          |
| ---------------------------------- | ------ | ------------------------ | -------------------------------- |
| `spamLogService`                   | GET    | `/api/spam-logs`         | Paginated spam log list          |
| `spamLogService`                   | GET    | `/api/spam-logs/:id`     | Single spam log entry            |
| `spamLogService`                   | GET    | `/api/spam-logs/stats`   | Spam statistics                  |
| `spamLogService` / `systemService` | DELETE | `/api/spam-logs/cleanup` | Delete entries older than N days |

---

### Integrations (within Settings)

| FE Component              | Method | Endpoint                                       | Purpose                                                         |
| ------------------------- | ------ | ---------------------------------------------- | --------------------------------------------------------------- |
| `integrationsService`     | GET    | `/api/integrations`                            | List all integrations (email/gmail/telegram/slack/AI providers) |
| `integrationsService`     | GET    | `/api/integrations/:id?type=`                  | Get single integration                                          |
| `integrationsService`     | POST   | `/api/integrations`                            | Create / upsert integration                                     |
| `integrationsService`     | PATCH  | `/api/integrations/:id`                        | Update integration                                              |
| `integrationsService`     | DELETE | `/api/integrations/:id?type=`                  | Delete integration                                              |
| `integrationsService`     | POST   | `/api/integrations/:id/test`                   | Test live connection                                            |
| `integrationsService`     | POST   | `/api/integrations/test-imap`                  | Test IMAP config (no existing integration)                      |
| `integrationsService`     | GET    | `/api/integrations/:id/departments`            | Get department mapping for source                               |
| `integrationsService`     | PUT    | `/api/integrations/:id/departments`            | Set department for source                                       |
| `ticketingSystemsService` | GET    | `/api/ticketing-systems`                       | List ticketing integrations (Jira, etc.)                        |
| `ticketingSystemsService` | GET    | `/api/ticketing-systems/:id?type=`             | Get ticketing integration                                       |
| `ticketingSystemsService` | POST   | `/api/ticketing-systems/:id/set-default?type=` | Set default ticketing integration                               |
| `gmailOAuthService`       | GET    | `/api/oauth/gmail/config`                      | Get Gmail OAuth redirect URI                                    |
| `gmailOAuthService`       | POST   | `/api/oauth/gmail/authorize`                   | Get Google OAuth URL                                            |
| `gmailOAuthService`       | POST   | `/api/oauth/gmail/callback`                    | Exchange OAuth code for tokens                                  |
| `aiService`               | GET    | `/api/ai/providers`                            | List configured AI providers                                    |
| `aiService`               | GET    | `/api/ai/models?provider=`                     | List AI models for a provider                                   |
| `departmentService`       | GET    | `/api/departments`                             | Static department enum list                                     |

#### Chat Widget settings

| FE Component        | Method | Endpoint                | Purpose           |
| ------------------- | ------ | ----------------------- | ----------------- |
| `chatWidgetService` | GET    | `/api/chat-widgets`     | List chat widgets |
| `chatWidgetService` | POST   | `/api/chat-widgets`     | Create widget     |
| `chatWidgetService` | PUT    | `/api/chat-widgets/:id` | Update widget     |
| `chatWidgetService` | DELETE | `/api/chat-widgets/:id` | Delete widget     |

---

### Documentation (within Settings)

| FE Component           | Method | Endpoint                          | Purpose                             |
| ---------------------- | ------ | --------------------------------- | ----------------------------------- |
| `documentationService` | GET    | `/api/documentation`              | List uploaded documents             |
| `documentationService` | POST   | `/api/documentation`              | Upload document (multipart)         |
| `documentationService` | GET    | `/api/documentation/:id`          | Get document metadata               |
| `documentationService` | GET    | `/api/documentation/:id/content`  | Get document chunks                 |
| `documentationService` | GET    | `/api/documentation/:id/progress` | Processing progress                 |
| `documentationService` | PATCH  | `/api/documentation/:id/enabled`  | Toggle enabled                      |
| `documentationService` | DELETE | `/api/documentation/:id`          | Delete document                     |
| `documentationService` | POST   | `/api/documentation/search`       | Vector search through documentation |
| `documentationService` | GET    | `/api/documentation/stats`        | Documentation statistics            |

---

### AI Modules (`AIModulesPage.tsx`)

| FE Component    | Method | Endpoint                                 | Purpose                         |
| --------------- | ------ | ---------------------------------------- | ------------------------------- |
| `AIModulesPage` | GET    | `/api/subscriptions/modules`             | List all AI modules (available) |
| `AIModulesPage` | GET    | `/api/subscriptions/my-modules`          | Modules active for current org  |
| `AIModulesPage` | POST   | `/api/subscriptions/modules/:id/enable`  | Enable a module                 |
| `AIModulesPage` | POST   | `/api/subscriptions/modules/:id/disable` | Disable a module                |

---

### Pricing / Subscription (`PricingPage.tsx` + `SubscriptionPage.tsx`)

| FE Component                | Method | Endpoint                                         | Purpose                                |
| --------------------------- | ------ | ------------------------------------------------ | -------------------------------------- |
| `PricingPage`               | GET    | `/api/subscriptions/plans`                       | All available plans                    |
| `PricingPage`               | GET    | `/api/subscriptions/modules`                     | All AI modules (with pricing)          |
| `PricingPage`               | GET    | `/api/subscriptions/current`                     | Current plan                           |
| `PricingPage`               | GET    | `/api/subscriptions/modules/active`              | Active modules for org                 |
| `PricingPage`               | POST   | `/api/subscriptions/upgrade`                     | Upgrade subscription plan              |
| `PricingPage`               | POST   | `/api/subscriptions/modules/:id/add`             | Add AI module                          |
| `PricingPage`               | POST   | `/api/subscriptions/modules/:id/disable`         | Remove AI module                       |
| `SubscriptionPage`          | GET    | `/api/subscriptions/dashboard`                   | Subscription dashboard data            |
| `SubscriptionPage`          | GET    | `/api/subscriptions/current`                     | Current subscription                   |
| `AdminPlansTab` (org admin) | GET    | `/api/organizations/subscription`                | Current org subscription               |
| `AdminPlansTab` (org admin) | GET    | `/api/organizations/available-plans`             | Plans available to org                 |
| `AdminPlansTab` (org admin) | GET    | `/api/organizations/ai-modules`                  | AI modules for org                     |
| `AdminPlansTab` (org admin) | PATCH  | `/api/organizations/subscription/plan`           | Switch plan                            |
| `AdminPlansTab` (org admin) | PATCH  | `/api/organizations/ai-modules/:moduleId/toggle` | Toggle AI module                       |
| `subscriptionService`       | GET    | `/api/subscriptions/modules/active`              | Active modules (used in feature gates) |

---

### Usage Stats (`UsageStatsPage.tsx`)

| FE Component     | Method | Endpoint                                 | Purpose                     |
| ---------------- | ------ | ---------------------------------------- | --------------------------- |
| `UsageStatsPage` | GET    | `/api/subscriptions/usage`               | Current period usage counts |
| `UsageStatsPage` | GET    | `/api/subscriptions/usage/history?days=` | Monthly usage history       |

---

### Email Templates (`EmailTemplatesPage.tsx`)

| FE Component         | Method | Endpoint                            | Purpose                          |
| -------------------- | ------ | ----------------------------------- | -------------------------------- |
| `EmailTemplatesPage` | GET    | `/api/email-templates/:type/render` | Render template HTML for preview |

The BE also exposes `GET /` (list), `GET /:type` (get), `GET /:type/preview`, and `PUT /:type` (update). Only `render` is called by the FE as of this audit. All email template routes require `authenticate + requireGlobalAdmin` (enforced inside `emailTemplatesRoutes.ts` — the mount in `routes/index.ts` does not add these at mount level).

`PUT /api/email-templates/:type` — the `updateTemplate` handler sanitizes the submitted HTML via `sanitize-html` before saving, allowing standard HTML/CSS email constructs while stripping dangerous tags.

---

### Admin Pages (global-admin only)

| FE Component         | Method | Endpoint                               | Purpose                                              |
| -------------------- | ------ | -------------------------------------- | ---------------------------------------------------- |
| `AdminDashboardPage` | GET    | `/api/organizations`                   | List all organizations                               |
| `AdminDashboardPage` | POST   | `/api/organizations`                   | Create organization                                  |
| `AdminDashboardPage` | PATCH  | `/api/organizations/:id`               | Update organization                                  |
| `AdminDashboardPage` | DELETE | `/api/organizations/:id`               | Delete organization                                  |
| `AdminUsageTab`      | GET    | `/api/admin/organizations/usage`       | All orgs usage stats                                 |
| `AdminUsageTab`      | GET    | `/api/subscriptions/plans`             | Available plans                                      |
| `AdminUsageTab`      | POST   | `/api/admin/organizations/:id/upgrade` | Upgrade org plan                                     |
| `systemService`      | POST   | `/api/system/stop-queues`              | Stop all BullMQ workers                              |
| `systemService`      | DELETE | `/api/system/queues`                   | Clear all Redis queues                               |
| `systemService`      | DELETE | `/api/system/messages`                 | Delete all messages for org                          |
| `systemService`      | DELETE | `/api/system/tickets`                  | Delete all tickets for org                           |
| `systemService`      | DELETE | `/api/system/knowledge-base`           | Delete all KB entries for org                        |
| `systemService`      | DELETE | `/api/system/attachments`              | Delete all attachments for org                       |
| `systemService`      | DELETE | `/api/system/nuclear`                  | Wipe all data for org (requires confirmation string) |
| `healthService`      | GET    | `/api/health/status`                   | System health (full detail for global admin)         |

---

### Auth Pages

| FE Page              | Method | Endpoint                                                                        | Purpose                             |
| -------------------- | ------ | ------------------------------------------------------------------------------- | ----------------------------------- |
| `LoginPage`          | POST   | `/api/auth/check-email`                                                         | Step 1: captcha-gated, no disclosure |
| `LoginPage`          | POST   | `/api/auth/login`                                                               | Step 2: authenticate                |
| `LoginPage`          | POST   | `/api/auth/select-organization`                                                 | Step 3: multi-org picker (single-use, captcha in prod) |
| `LoginPage`          | POST   | `/api/auth/2fa/authenticate`                                                    | TOTP code exchange                  |
| `LoginPage`          | POST   | `/api/auth/2fa/forced-setup`                                                    | Get QR during forced 2FA enrollment |
| `LoginPage`          | POST   | `/api/auth/2fa/forced-enable`                                                   | Complete forced 2FA setup           |
| `SignupPage`         | GET    | `/api/auth/validate-invitation/:token`                                          | Validate invite token               |
| `SignupPage`         | POST   | `/api/auth/register`                                                            | Register new account                |
| `ForgotPasswordPage` | POST   | `/api/auth/forgot-password`                                                     | Send reset email                    |
| `ResetPasswordPage`  | POST   | `/api/auth/reset-password`                                                      | Apply new password                  |
| `VerifyEmailPage`    | GET    | `/api/auth/verify-email?token=`                                                 | Complete email verification         |
| `OAuthCallbackPage`  | —      | (handles `sessionStorage` from popup; calls `gmailOAuthService.handleCallback`) | Gmail OAuth popup callback          |

---

## 5. Key Shared Services Summary

| Service File                  | Endpoints Covered                                                        | Used By                                                            |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `auth.service.ts`             | `/api/auth/*` (8 endpoints)                                              | Login, Signup, Forgot/Reset pages                                  |
| `twoFactor.service.ts`        | `/api/auth/2fa/*` (7 endpoints)                                          | LoginPage, Settings/2FA panel                                      |
| `message.service.ts`          | `/api/messages/*` (30+ endpoints)                                        | MessagesPage, MessageDetail, Dashboard, CreateTicket, TicketDetail |
| `ticket.service.ts`           | `/api/tickets/*` (12 endpoints)                                          | TicketsPage, TicketDetail, EditTicket, CreateTicket                |
| `organization.service.ts`     | `/api/organizations/*` (18 endpoints)                                    | OrganizationPage, Settings                                         |
| `settings.service.ts`         | `/api/settings/*` categories/prompts/spam/detection rules (20 endpoints) | SettingsPage sub-components                                        |
| `integrations.service.ts`     | `/api/integrations/*`, `/api/ticketing-systems/*` (12 endpoints)         | Settings integrations tab                                          |
| `user.service.ts`             | `/api/users/*` (15 endpoints)                                            | UsersPage                                                          |
| `contact.service.ts`          | `/api/contacts/*` (11 endpoints)                                         | MessageDetail contact panel and ContactsView                       |
| `kb.service.ts`               | `/api/knowledge-base/entries/*` (6 endpoints)                            | KnowledgeBasePage, Dashboard, Statistics                           |
| `documentation.service.ts`    | `/api/documentation/*` (9 endpoints)                                     | Settings documentation tab                                         |
| `sla.service.ts`              | `/api/sla/*` (4 endpoints)                                               | SLADashboardPage, DashboardPage                                    |
| `statistics.service.ts`       | `/api/statistics/*` (6 endpoints)                                        | StatisticsPage                                                     |
| `billing.service.ts`          | `/api/billing/*` (4 endpoints)                                           | BillingDashboardPage                                               |
| `auditLog.service.ts`         | `/api/audit-logs/*` (2 endpoints)                                        | AuditLogsPage                                                      |
| `invitation.service.ts`       | `/api/invitations/*` (3 endpoints)                                       | UsersPage                                                          |
| `subscription.service.ts`     | `/api/subscriptions/modules/active` (1 endpoint)                         | Global feature gate checks                                         |
| `chatWidget.service.ts`       | `/api/chat-widgets/*` (4 endpoints)                                      | Settings chat widget tab                                           |
| `department.service.ts`       | `/api/departments` (1 endpoint)                                          | Integrations, various selectors                                    |
| `ai.service.ts`               | `/api/ai/providers`, `/api/ai/models` (2 endpoints)                      | Settings AI provider config                                        |
| `gmailOAuthService`           | `/api/oauth/gmail/*` (3 endpoints)                                       | Settings Gmail integration                                         |
| `ingestion.service.ts`        | `/api/ingestion/*` (4 endpoints)                                         | DashboardPage manual triggers                                      |
| `health.service.ts`           | `/api/health/status` (1 endpoint)                                        | `useSystemHealth` hook, AdminDashboard                             |
| `spamLog.service.ts`          | `/api/spam-logs/*` (4 endpoints)                                         | Settings spam log tab                                              |
| `ticketingSystems.service.ts` | `/api/ticketing-systems/*` (3 endpoints)                                 | Settings ticketing tab                                             |
| `commentsService`             | `/api/tickets/:id/comments`, `/api/comments/*`, `/api/attachments/*`     | TicketDetail                                                       |
| `assignmentService`           | `/api/assignments/*` (4 endpoints)                                       | Message/Ticket assignment UI                                       |
| `labelService`                | `/api/labels/*` (10 endpoints)                                           | Message/Ticket label UI                                            |
| `systemService`               | `/api/system/*`, `/api/spam-logs/cleanup` (9 endpoints)                  | Admin tools page                                                   |
| `detectionRuleService`        | `/api/settings/detection-rules/*` (5 endpoints)                          | Settings detection rules                                           |
| `category.service.ts`         | `/api/settings/categories` (read-only, 2 endpoints)                      | Category selectors in forms                                        |

---

## 6. Gaps

### BE endpoints with no FE caller found

| Endpoint                                            | Notes                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/email-templates`                          | List templates — FE only calls `render`                                                                                                                      |
| `GET /api/email-templates/:type`                    | Get single template — only `render` used                                                                                                                     |
| `GET /api/email-templates/:type/preview`            | Preview — only `render` used                                                                                                                                 |
| `PUT /api/email-templates/:type`                    | Update template — no FE caller found in current code                                                                                                         |
| `POST /api/ai/embedding`                            | Direct embedding call — used by BE queue processors only                                                                                                     |
| `POST /api/ai/analyze`                              | Direct analysis call — used by BE internally only                                                                                                            |
| `POST /api/ai/follow-up`                            | Follow-up generation — BE internal only                                                                                                                      |
| `POST /api/ai/categorize`                           | Categorization — BE internal only                                                                                                                            |
| `POST /api/ai/enhance-ticket`                       | Ticket enhancement — BE internal only                                                                                                                        |
| `GET /api/ai/providers/health`                      | AI provider health check — no FE caller found                                                                                                                |
| `GET /api/ai/local-embedding`                       | Local embedding status — no FE caller found                                                                                                                  |
| `GET /api/responses/:id/effectiveness`              | Response tracking — not called by FE                                                                                                                         |
| `POST /api/responses/:id/use`                       | Record response usage — not called by FE                                                                                                                     |
| `POST /api/responses/:id/feedback`                  | Response feedback — not called by FE                                                                                                                         |
| `POST /api/messages/test-process`                   | Manual processing trigger — no FE caller found                                                                                                               |
| `GET /api/messages/deleted`                         | Soft-deleted messages list — no FE caller found                                                                                                              |
| `POST /api/messages/:id/restore`                    | Restore soft-deleted — no FE caller found                                                                                                                    |
| `GET /api/health/circuit-breakers`                  | Circuit breaker status — no FE caller found                                                                                                                  |
| `POST /api/health/circuit-breakers/:service/reset`  | Circuit breaker reset — no FE caller found                                                                                                                   |
| `GET /api/health/version`                           | App version — no FE caller found                                                                                                                             |
| `GET /api/admin/sync-checkpoints`                   | Sync checkpoints — no FE caller in admin pages                                                                                                               |
| `DELETE /api/admin/sync-checkpoints`                | Clear sync checkpoints — no FE caller found                                                                                                                  |
| `GET /api/admin/queue-status`                       | Queue stats — no FE caller found                                                                                                                             |
| `GET /api/admin/plans`                              | Plan list (admin) — `AdminPlansPage.tsx` exists with these calls but is **orphaned** (not imported in App.tsx or AdminDashboardPage); effective no FE caller |
| `GET /api/admin/plans/stats`                        | Same — orphaned page                                                                                                                                         |
| `PATCH /api/admin/plans/:id/toggle`                 | Same — orphaned page                                                                                                                                         |
| `PATCH /api/admin/plans/:id`                        | Update plan limits — orphaned page                                                                                                                           |
| `GET /api/admin/plans/compare`                      | Compare plans — no FE caller found                                                                                                                           |
| `GET /api/admin/modules`                            | Module list (admin) — orphaned page                                                                                                                          |
| `PATCH /api/admin/modules/:id/toggle`               | Toggle module — orphaned page                                                                                                                                |
| `GET /api/subscriptions/limits`                     | Subscription limits — no FE caller found                                                                                                                     |
| `GET /api/usage/current`                            | Current period usage (usage route) — FE uses `/api/subscriptions/usage` instead                                                                              |
| `GET /api/usage/history`                            | Usage history (usage route) — FE uses `/api/subscriptions/usage/history`                                                                                     |
| `POST /api/public/chat/:widgetKey`                  | Public chat — called by the embedded widget JS, not the dashboard FE                                                                                         |
| `GET /api/public/chat/:widgetKey/config`            | Widget config — called by embedded widget JS                                                                                                                 |
| `POST /api/webhooks/jira`                           | Jira webhook — receives from Jira server, not FE                                                                                                             |
| `GET /api/debug/*`                                  | Debug endpoints — no FE caller                                                                                                                               |
| `DELETE /api/cleanup/*`                             | Cleanup endpoints — no FE caller                                                                                                                             |
| `GET /api/landing-page`                             | Landing page data — no FE caller in dashboard                                                                                                                |
| `POST /api/tickets/:id/respond`                     | Respond to ticket (separate from comments) — no dedicated FE caller found                                                                                    |
| `PATCH /api/organizations/:id/members/:userId/role` | Update member role — no FE caller found                                                                                                                      |

### BE WebSocket events with no FE subscriber

_(None — all known BE-emitted events now have FE handlers.)_

### FE calls referencing endpoints that warrant attention

| FE Call                                                                      | Observation                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/email-templates/:type/render`                                      | Only `render` is used; `list`, `get`, `preview`, and `update` have no FE callers — email template management is incomplete in the UI                                    |
| `integrationsService.hasAnyEmailIntegrations()`                              | Sends `X-Skip-Org-Context: true` header — BE must explicitly handle or ignore this non-standard header (no documented BE behavior for it)                               |
| `GET /api/messages/deleted`                                                  | Soft-delete list endpoint exists in BE but no FE page renders deleted messages                                                                                          |
| `POST /api/messages/:id/restore`                                             | Restore endpoint exists but the FE has no UI to trigger it                                                                                                              |
| `GET /api/organizations/ai-provider`, `PATCH /api/organizations/ai-provider` | Present in `organizationService` but no dedicated FE page found consuming them directly — likely embedded in an integrations or settings panel not traced in this audit |
| `GET /api/subscriptions/my-modules`                                          | Called by `AIModulesPage` but not by `subscriptionService` — a second module-fetch path                                                                                 |

---

## 7. BE Route Groups — Mount-level Middleware

This section documents exactly what middleware is applied at the `app.use(...)` level in `BE-service/src/routes/index.ts`. Individual route files may add further middleware (permissions, per-route rate limiters) on top of these.

| Route prefix             | Mount-level middleware                      | Notes                                                                                                                                      |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/landing-page`      | `landingPageLimiter` (30 req/60 s)          | Public — no auth                                                                                                                           |
| `/api/public/chat`       | `publicChatLimiter` (20 req/60 s)           | Public — no auth                                                                                                                           |
| `/api/auth`              | _(none)_                                    | Public — individual routes handle rate limiting internally                                                                                 |
| `/api/auth/2fa`          | _(none)_                                    | Public for pre-auth 2FA steps; individual routes require `tempToken`                                                                       |
| `/api/ai`                | `authenticate`, `requireActiveSubscription` | Also adds `router.use(authenticate)` inside `aiRoutes.ts` (redundant but harmless); all POST routes add `aiSuggestionLimiter` individually |
| `/api/tickets`           | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/labels`            | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/comments`          | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/attachments`       | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/assignments`       | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/messages`          | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/contacts`          | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/ingestion`         | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/users`             | `authenticate`, `requireActiveSubscription` | Added at mount level — all user endpoints now require an active subscription                                                               |
| `/api/invitations`       | _(none)_                                    | Invitation acceptance is public; auth enforced per-route inside the router                                                                 |
| `/api/organizations`     | `authenticate`, `requireActiveSubscription` | Added at mount level — all org endpoints now require an active subscription                                                                |
| `/api/departments`       | _(none)_                                    | Static enum data — public                                                                                                                  |
| `/api/settings`          | `authenticate`, `requireActiveSubscription` | Also adds `router.use(authenticate)` inside `settingsRoutes.ts`                                                                            |
| `/api/email-templates`   | _(none at mount)_                           | Auth and `requireGlobalAdmin` enforced inside `emailTemplatesRoutes.ts` via `router.use(authenticate)`                                     |
| `/api/admin`             | _(none at mount)_                           | Auth and global-admin check enforced inside `adminRoutes.ts`                                                                               |
| `/api/audit-logs`        | _(none at mount)_                           | Auth enforced inside `auditLogRoutes.ts`                                                                                                   |
| `/api/health`            | _(none)_                                    | Public health endpoint; detail level gated by role inside the router                                                                       |
| `/api/statistics`        | _(none at mount)_                           | Auth enforced inside `statisticsRoutes.ts`                                                                                                 |
| `/api/notifications`     | _(none at mount)_                           | Auth enforced inside `notificationsRoutes.ts`                                                                                              |
| `/api/sla`               | _(none at mount)_                           | Auth enforced inside `slaRoutes.ts`                                                                                                        |
| `/api/billing`           | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/spam-logs`         | _(none at mount)_                           | Auth enforced inside `spamLogRoutes.ts`                                                                                                    |
| `/api/subscriptions`     | _(none at mount)_                           | Auth enforced inside `subscriptionRoutes.ts`                                                                                               |
| `/api/usage`             | _(none at mount)_                           | Auth enforced inside `usageRoutes.ts`                                                                                                      |
| `/api/translation`       | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/documentation`     | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/knowledge-base`    | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/chat-widgets`      | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/responses`         | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/integrations`      | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/ticketing-systems` | `authenticate`, `requireActiveSubscription` |                                                                                                                                            |
| `/api/oauth`             | _(none at mount)_                           | Auth and org context enforced inside `gmailOAuthRoutes.ts`                                                                                 |
| `/api/webhooks`          | `ingestionLimiter`                          | Public — HMAC-SHA256 verification required inside each webhook route                                                                       |
| `/api/debug`             | _(none at mount)_                           | Development only (`config.server.isDevelopment`); not exposed in production                                                                |
| `/api/cleanup`           | _(none at mount)_                           | Auth and `org_admin` role enforced inside `cleanupRoutes.ts`                                                                               |
| `/api/system`            | _(none at mount)_                           | Auth and admin role enforced inside `systemRoutes.ts`                                                                                      |
| `/health` (root)         | _(none)_                                    | Simple liveness probe — always returns `{ status: 'ok' }`                                                                                  |

### Notable per-route middleware additions (beyond mount level)

| Route                                   | Middleware                                                      | Location                                               |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| `POST /api/ai/embedding`                | `aiSuggestionLimiter`                                           | `aiRoutes.ts` line 51                                  |
| `POST /api/ai/analyze`                  | `aiSuggestionLimiter`                                           | `aiRoutes.ts` line 84                                  |
| `POST /api/ai/follow-up`                | `aiSuggestionLimiter`                                           | `aiRoutes.ts` line 117                                 |
| `POST /api/ai/categorize`               | `aiSuggestionLimiter`                                           | `aiRoutes.ts` line 148                                 |
| `POST /api/ai/enhance-ticket`           | `aiSuggestionLimiter`                                           | `aiRoutes.ts` line 296                                 |
| `POST /api/webhooks/*`                  | HMAC-SHA256 body verification                                   | Inside each webhook route handler                      |
| `PUT /api/email-templates/:type`        | HTML sanitization via `sanitize-html`                           | `emailTemplatesController.ts` `updateTemplate` handler |
| `POST /api/settings/detection-rules`    | `validateRegexPattern` (syntax + nested-quantifier ReDoS guard) | `detectionRulesController.ts`                          |
| `PUT /api/settings/detection-rules/:id` | `validateRegexPattern`                                          | `detectionRulesController.ts`                          |

---

## 2026-06-02 Session v2 — Wire-protocol relevant changes

No new endpoints. The BE response shapes for `/api/messages/threads` (used by both list and kanban views) are unchanged, but their **semantics** are now correct in cases that were previously broken:

### Kanban column filters (FE → BE `?view=` parameter)

Filter logic lives in `BE-service/src/modules/inbox/controllers/helpers/messageFilters.ts`. The view→column mapping that the kanban relies on:

| FE column | `?view=` value | BE condition |
|---|---|---|
| Active | `inbox` | `last_reply_at IS NULL` AND status NOT IN (resolved, filtered, closed) |
| Awaiting | `awaiting_response` | `last_reply_from_client = false` AND status NOT IN (filtered, resolved, closed) |
| Replied | `client_replied` | `last_reply_from_client = true` AND status NOT IN (filtered, resolved, closed) |
| Suspicious | `suspicious` | spamCheck category = 'suspicious' |
| Not Analysed | `not_analysed` | status = 'filtered' AND isSpam=false AND not KB |
| Resolved | `resolved` | status = 'resolved' |
| Spam | (`showSpam=true`) | isSpam=true OR category='spam' |

Bug fixed this session: agent replies on first-contact threads were leaving `last_reply_from_client = NULL`, so threads never matched Awaiting (`= false`) and got mis-routed to Active (`IS NULL`). After the BE `stampThreadLastReply` and parent-match fixes, NULL→false transitions land correctly and convs route to the right column.

### `MessageThread.sender` semantics

`thread.sender` on the BE response is `conversations.requesterEmail` — **always the customer**, regardless of whether the latest message is inbound or outbound. The FE kanban now uses this consistently (was previously using `latestMessage.sender`, which is the agent's address when an agent_reply is latest).

### Status auto-reopen on inbound

`saveMessage` now flips `status='resolved'`/`'closed'` → `status='client_replied'` when a customer follow-up lands. FE doesn't need any change — the conv just reappears in active views naturally because its status is back to active and `last_reply_from_client=true`.

### Soft-delete auto-resurrect on inbound

`saveMessage` clears `deleted/deleted_at/deleted_by` on inbound events landing on a soft-deleted conv. FE list/kanban queries already filter `deleted=false`; resurrected convs reappear automatically.

### Attachment wiring on KB-driven replies

`responseSuggestionService.ts:356-375` fetches attachment metadata from `kbResult.typeData.attachmentIds` and includes them in the suggested reply payload. After the Q&A thread-wide fix this session, those IDs now include the customer's question-side attachments (e.g. screenshots) and the agent's answer-side files together. The FE response composer renders these as attachable files on the draft reply (no FE change needed; payload shape unchanged, only the populated values grew).

---

## 2026-06-02 Session — additional wire-protocol notes

### Department field migration (`departmentRole` → `departmentId`)

Phase C migration applied to local + staging + prod. JSON response bodies that previously contained `departmentRole: 'support' | 'sales' | ...` enum now contain `departmentId: number | null` instead.

**Query-param naming (updated 2026-07-06 — `departmentRole` → `departmentSlug`):** the URL
query parameter was renamed to `departmentSlug` (it always carried a dept *slug*, never a
role). Endpoints: `/api/system/messages|tickets|knowledge-base`, `/api/spam-logs`, SLA stats.
- Handlers (`systemController.ts`, `slaController.ts`, `spamLogController.ts`) read
  `req.query.departmentSlug ?? req.query.departmentRole` — **`departmentRole` kept only as a
  backward-compat fallback** (marked `TODO(remove after FE deploy)`); drop it once the FE
  change is live everywhere.
- FE callers (`system.service.ts`, `spamLog.service.ts`) now **send `departmentSlug`**.
- **New (2026-07-06):** a *provided-but-unknown* slug now returns **HTTP 400** (`Unknown
  department: <slug>`) instead of a silent 200 / empty result. Omitting the param is
  unchanged (system-delete = delete-all-in-org).

Response shapes everywhere are `departmentId`-native. New code should send `departmentSlug`
in query params and `departmentId` in JSON bodies; never `departmentRole`.

### Attachment type field rename (`messageId` → `messageEventId`)

`Attachment` type on the FE (`FE-app/src/components/messages/MessageAttachments.tsx:12`) renamed its `messageId` field to `messageEventId` to match the BE column.

**No BE wire change** — the `/api/messages/:id/attachments` response was always returning `messageEventId`. Bug was purely FE: `Attachment.messageId === null` returned `undefined` on every attachment, so the grouping Map `attachmentsByMessageId.get(msg.id)` returned undefined. Files tab worked because `Array.from(map.values()).flat()` ignores keys; per-event chips silently broken.

### Gmail OAuth client-side sessionStorage contracts (FE-only, no BE wire change)

New sessionStorage keys used by the popup-blocked fallback path:

| Key | Set by | Read by | Shape |
|---|---|---|---|
| `gmail_oauth_payload` | `OAuthCallbackPage` when `window.opener` is absent | popup-flow message handler (legacy path) OR `consumePendingRedirectResult()` (new redirect path) | `{ code: string, state: string }` |
| `gmail_oauth_pending_config` | `redirectToOAuth(config)` before `window.location.href = authUrl` | `consumePendingRedirectResult()` in `GmailIntegrationCard` mount effect; also read by `OAuthCallbackPage` to decide redirect target | `{ config: ConnectWithPopupConfig, redirectUri: string }` |

Flow when popup is hard-blocked:
1. User clicks "continue without popup" → `redirectToOAuth` stashes `pending_config` + does `window.location.href = authUrl`
2. Google redirects to `/oauth/gmail/callback?code=...&state=...`
3. `OAuthCallbackPage` detects no opener + `pending_config` exists → stashes `payload` + redirects to `/settings#integrations`
4. `GmailIntegrationCard` mount effect calls `consumePendingRedirectResult` → reads both keys → dispatches normal `handleCallback` → done

POST `/api/oauth/gmail/callback` payload unchanged across both paths.

### Q&A KB helper extraction (no wire change)

`BE-service/src/modules/knowledge-base/ingestion/kbQAHelpers.ts` extracted from `kbIngestionService.ts`. Both `saveQAPairToKB` and `processKBThread` now share `insertQAPairKB(params)` for the canonical KB insert shape. `processKBThread` gained `.onConflictDoNothing()` semantics it didn't previously have. Q&A response shapes and KB endpoint payloads are identical to before.

### bot_reply event stable external IDs (no wire change)

`BE-service/src/modules/inbox/processing/botReplyDedup.ts` provides `deriveBotReplyExternalId(convId, channel, providerMessageId?)`. Applied to `emailService.ts:117`, `messageProcessor.ts:145`, `telegramAutoReplyHelpers.ts:339` bot_reply inserts. All three now use `.onConflictDoNothing()` and gate the `aiReplyCount` increment / SLA recording / cache write on `!inserted`. Retries on the same trigger inbound no longer produce duplicate events. `bot_reply` event shape in the `/api/messages/:id/thread` response is unchanged; only the internal externalMessageId is now stable.
