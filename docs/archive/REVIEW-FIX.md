---
phase: deep-review
fixed_at: 2026-04-27T00:00:00Z
review_path: /Users/dmytroskumin/frameworks/email-ticket-system/FE-app/REVIEW.md
iteration: 2
findings_in_scope: 16
fixed: 16
skipped: 0
status: all_fixed
---

# Phase deep-review: Code Review Fix Report

**Fixed at:** 2026-04-27
**Source review:** /Users/dmytroskumin/frameworks/email-ticket-system/FE-app/REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 16 (CR-01 through CR-03, WR-01 through WR-08, IN-01 through IN-05)
- Fixed: 16
- Skipped: 0

Note: IN-01 (`??` vs `||` for `canEditRoles`) was fixed in the same commit as CR-03/WR-02 (iteration 1) since all three reside in `EditUserModal.tsx`. IN-02 through IN-05 were fixed in iteration 2.

## Fixed Issues

### CR-01: OAuth client secret transmitted in GET query parameters

**Files modified:** `src/services/gmail-oauth.service.ts`
**Commit:** 9796241
**Applied fix:** Changed `initiateOAuth` from `apiClient.get(url?clientSecret=...)` to `apiClient.post('/api/oauth/gmail/authorize', { clientId, clientSecret, redirectUri })` so the secret travels only in the request body, not in the URL query string.

---

### CR-02: Auth token appended as a query parameter to download/view URLs

**Files modified:** `src/components/tickets/TicketAttachments.tsx`
**Commit:** 650a28b
**Applied fix:** Removed `getAttachmentUrl` from download/view actions. Added `handleDownload(attachment, inline?)` that calls `apiClient.get(path, { responseType: 'blob' })` and creates a temporary `URL.createObjectURL` blob URL. Download uses `<a>.click()` with immediate revoke; inline view uses `window.open` with a 10-second deferred revoke to give the new tab time to load. The download `<a href>` anchor was replaced with a `Button` that calls `handleDownload`.

---

### CR-03: `handleOrgChangeConfirm` leaves spinner frozen on `performUpdate` failure

**Files modified:** `src/components/modals/EditUserModal.tsx`
**Commit:** b36e061
**Applied fix:** Refactored `handleOrgChangeConfirm` to accept `newOrgId: number` as an explicit parameter and inline the profile update call (previously delegated to `performUpdate` which had its own `setIsSubmitting` lifecycle). A single `finally` block now guarantees `setIsSubmitting(false)` fires exactly once regardless of which step throws. Also fixed IN-01 (`canEditRoles` now uses `||` instead of `??`) and WR-02 in the same commit since all are in this file.

---

### WR-01: Race condition — unstable `skillFilter` object reference triggers infinite fetches

**Files modified:** `src/components/filters/AssigneeFilter.tsx`
**Commit:** db93a2a
**Applied fix:** Added `const skillFilterKey = useMemo(() => JSON.stringify(skillFilter ?? null), [skillFilter])` and used `skillFilterKey` as the effect dependency instead of `skillFilter`. This prevents re-firing on every render when the parent passes a new object literal with the same content.

---

### WR-02: `ConfirmDialog.onConfirm` resets `newOrgId` to 0 before async handler reads it

**Files modified:** `src/components/modals/EditUserModal.tsx`
**Commit:** b36e061
**Applied fix:** Captured `const newOrgId = orgChangeDialog.newOrgId` before calling `setOrgChangeDialog({ open: false, newOrgId: 0 })`, then passed it explicitly to `handleOrgChangeConfirm(newOrgId)`. The handler signature was updated to accept `newOrgId: number`.

---

### WR-03: `setOnlyMine` rollback uses inverted argument rather than previous committed state

**Files modified:** `src/hooks/useSLANotifications.ts`
**Commit:** 636ab1a
**Applied fix:** Captured `const previousValue = prefsRef.current.onlyAssignedToMe` before the optimistic update. The `.catch` block now restores `previousValue` instead of `!value`, which is correct under rapid double-click or concurrent calls.

---

### WR-04: `SLANotificationBell` marks all notifications read before panel is visible

**Files modified:** `src/components/layout/SLANotificationBell.tsx`
**Commit:** 07d7c8f
**Applied fix:** Removed `if (!open && unreadCount > 0) markAllRead()` from `handleOpen`. Added a `useEffect(() => { if (open && unreadCount > 0) markAllRead(); }, [open])` so `markAllRead` runs after React commits the `open = true` state and the panel is rendered.

---

### WR-05: `convertTextToHtml` does not escape HTML entities

**Files modified:** `src/components/messages/MessageDetail.tsx`
**Commit:** 8149e3c
**Applied fix:** Added `escapeHtml` helper that replaces `&`, `<`, `>` with their HTML entities. `convertTextToHtml` now calls `escapeHtml(para)` before the `replace(/\n/g, '<br>')` substitution, preventing angle-bracket constructs (e.g. email addresses like `<user@example.com>`) from being injected as literal HTML tags into the editor.

---

### WR-06: Gmail OAuth popup — intervals and message listener leak on component unmount

**Files modified:** `src/components/settings/integrations/GmailIntegrationCard.tsx`
**Commit:** 9d41cc0
**Applied fix:** Added `const abortRef = useRef(false)` and a `useEffect` that sets `abortRef.current = true` on cleanup. `handleGmailOAuth` now checks `abortRef.current` before each state-mutating operation (`onRefresh`, `resetForm`, `onShowAlert`, `setSaving`). This prevents React state updates on an unmounted component when the user navigates away while the OAuth popup is still open.

---

### WR-07: `MessageThread` timestamp-window loop recomputes `msgTime()` on every iteration

**Files modified:** `src/components/messages/MessageThread.tsx`
**Commit:** 3abc5a1
**Applied fix:** After sorting, built `const timeCache = new Map<number, number>(allMessages.map((m) => [m.id, msgTime(m)]))` and a `cachedTime` accessor. Replaced all `msgTime(...)` calls inside the `customerEmails.forEach` attribution loop with `cachedTime(...)`. This reduces `Date` construction from O(N×M) to O(N+M).

---

### WR-08: `TicketAttachments` socket lifecycle coupled to `fetchAttachments` identity

**Files modified:** `src/components/tickets/TicketAttachments.tsx`
**Commit:** cad3e17
**Applied fix:** Split the single combined effect into two effects: Effect 1 (`[ticketId]`) handles `getSocket()` / `releaseSocket()` only; Effect 2 (`[ticketId, fetchAttachments]`) handles `fetchAttachments()` and the `ticket:comments:updated` event subscription/cleanup. This prevents a spurious socket reconnect cycle if `fetchAttachments` identity changes without `ticketId` changing.

---

### IN-01: `EditUserModal` — `canEditRoles` uses `??` where `||` is likely intended

**Files modified:** `src/components/modals/EditUserModal.tsx`
**Commit:** b36e061
**Applied fix:** Changed `const canEditRoles = isAdmin ?? (canManageUsers && !isEditingSelf)` to `const canEditRoles = isAdmin || (canManageUsers && !isEditingSelf)`. Nullish coalescing would skip the right-hand side for `false`, leaving non-admin managers unable to edit roles.

---

### IN-02: `SLAByPriorityTable` and `SLATrendChart` hardcode `days: 30` independently

**Files modified:** `src/components/sla/SLAByPriorityTable.tsx`, `src/components/sla/SLATrendChart.tsx`
**Commit:** e637ba6
**Applied fix:** Exported `SLA_DEFAULT_DAYS = 30` constant from `SLAByPriorityTable.tsx`. Both components now accept an optional `days` prop (defaulting to `SLA_DEFAULT_DAYS`). `SLATrendChart` imports the constant from `SLAByPriorityTable` so the default is defined in one place. The chart title in `SLATrendChart` is also updated to render the dynamic `days` value.

---

### IN-03: `StatisticsPage.fetchStatistics` not stabilized with `useCallback`

**Files modified:** `src/pages/StatisticsPage.tsx`
**Commit:** 32fb079
**Applied fix:** Wrapped `fetchStatistics` in `useCallback` with an empty dependency array (it only calls stable service functions and state setters). Added `fetchStatistics` to the `useEffect` dependency array to satisfy `react-hooks/exhaustive-deps`. Also added `useCallback` to the React import.

---

### IN-04: `connectWithPopup` has 8 positional parameters — fragile call sites

**Files modified:** `src/services/gmail-oauth.service.ts`, `src/components/settings/integrations/GmailIntegrationCard.tsx`
**Commit:** 50d309b
**Applied fix:** Defined `export interface ConnectWithPopupConfig` at module level with all 8 fields. Updated `connectWithPopup` to accept a single `config: ConnectWithPopupConfig` argument and destructure locally. Updated the call site in `GmailIntegrationCard` to pass a named config object instead of 8 positional arguments.

---

### IN-05: `withSignature` inserts user signature without HTML-escaping

**Files modified:** `src/components/messages/MessageDetail.tsx`
**Commit:** bfe671b
**Applied fix:** Applied the `escapeHtml` helper (already present from WR-05) to each non-empty signature line in `withSignature`. Empty lines continue to render as `<br>` as before. This prevents angle brackets and `&` characters in email signatures from being treated as raw HTML in the composer.

---

_Fixed: 2026-04-27_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
