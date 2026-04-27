---
phase: deep-review
reviewed: 2026-04-27T00:00:00Z
depth: deep
files_reviewed: 19
files_reviewed_list:
  - src/components/filters/AssigneeFilter.tsx
  - src/components/layout/SLANotificationBell.tsx
  - src/components/messages/MessageDetail.tsx
  - src/components/messages/MessageFilters.tsx
  - src/components/messages/MessageThread.tsx
  - src/components/modals/EditUserModal.tsx
  - src/components/settings/integrations/GmailIntegrationCard.tsx
  - src/components/sla/SLAByPriorityTable.tsx
  - src/components/sla/SLATrendChart.tsx
  - src/components/tickets/TicketAttachments.tsx
  - src/hooks/useSLANotifications.ts
  - src/pages/StatisticsPage.tsx
  - src/services/comments.service.ts
  - src/services/documentation.service.ts
  - src/services/gmail-oauth.service.ts
  - src/services/message.service.ts
  - src/services/sla.service.ts
  - src/services/ticket.service.ts
  - src/types/index.ts
findings:
  critical: 3
  warning: 8
  info: 5
  total: 16
status: issues_found
---

# Deep Code Review Report

**Reviewed:** 2026-04-27
**Depth:** deep
**Files Reviewed:** 19
**Status:** issues_found

## Summary

This review covers the FE-app frontend: service layer, hooks, components, and shared types. The codebase is generally well-structured with DOMPurify applied to user-controlled HTML in the correct places. Three critical issues were found: a credential leak through URL query parameters in the Gmail OAuth flow, an auth token appended to download URLs that may be logged by proxies/CDNs, and a missing rollback gap on a multi-step org-change operation. Eight warnings cover async race conditions, logic errors, and missing error handling. Five informational items cover code quality and minor design gaps.

---

## Critical Issues

### CR-01: OAuth client secret transmitted in GET query parameters

**File:** `src/services/gmail-oauth.service.ts:53`
**Issue:** `initiateOAuth` builds a GET URL with `clientSecret` as a raw query parameter. Query strings are stored in browser history, server access logs, proxy logs, and may appear in referrer headers. The OAuth client secret must never be transmitted this way.

```typescript
// Current — insecure
const response = await apiClient.get(
  `/api/oauth/gmail/authorize?clientId=${encodeURIComponent(clientId)}&clientSecret=${encodeURIComponent(clientSecret)}&redirectUri=${encodeURIComponent(redirectUri)}`
);

// Fix — use POST with a JSON body so the secret travels in the request body only
const response = await apiClient.post('/api/oauth/gmail/authorize', {
  clientId,
  clientSecret,
  redirectUri,
});
```

The backend endpoint must be updated correspondingly to accept POST body parameters.

---

### CR-02: Auth token appended as a query parameter to download/view URLs

**File:** `src/components/tickets/TicketAttachments.tsx:88-97`
**Issue:** `getAttachmentUrl` builds download and inline-view URLs with `?token=${token}` in the query string. These URLs are assigned to `href` attributes and opened via `window.open(...)`. Tokens in URLs end up in browser history, server logs, referrer headers, and any analytics scripts that read `document.location`.

```typescript
// Current — leaks token in URL
return `${API_BASE_URL}/api/attachments/${attachment.id}/download?token=${token}`;

// Fix — use an authenticated fetch-then-blob-URL pattern instead
const handleDownload = async (attachment: Attachment) => {
  const response = await apiClient.get(
    `/api/attachments/${attachment.id}/download`,
    { responseType: 'blob' }
  );
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.originalFilename;
  a.click();
  URL.revokeObjectURL(url);
};
```

If changing the download mechanism is out of scope, at minimum use a short-lived, single-use download token rather than the primary session token.

---

### CR-03: `handleOrgChangeConfirm` leaves spinner frozen on `performUpdate` failure

**File:** `src/components/modals/EditUserModal.tsx:221-247`
**Issue:** `handleOrgChangeConfirm` calls `removeMember`, `addMember`, and `performUpdate` in sequence. `performUpdate` contains its own `setIsSubmitting(true/false)` lifecycle. If `performUpdate` throws, the outer `catch` block calls `setIsSubmitting(false)` — but `performUpdate`'s `finally` also fires and may set it back to `false` again in a different order. More importantly, if `removeMember` or `addMember` succeeds and `performUpdate` fails, the user is left in a partially migrated state with no rollback. The `isSubmitting` can also be double-set to `true` because `performUpdate` sets it at its start.

```typescript
// Fix: extract the org-change-specific steps and use a single finally
const handleOrgChangeConfirm = async () => {
  if (!user) return;
  setIsSubmitting(true);
  try {
    if (user.organizationId) {
      await organizationService.removeMember(user.organizationId, user.id);
    }
    await organizationService.addMember(orgChangeDialog.newOrgId, user.id, organizationRole);
    // Inline the profile update here without its own isSubmitting management
    await onUpdate(user.id, { firstName: firstName.trim(), ... });
    onClose();
  } catch (error) {
    logger.error('Failed to change organization:', error);
    setAlertDialog({ open: true, title: 'Organization Change Failed',
      description: 'Failed to change organization. Please try again.', variant: 'error' });
  } finally {
    setIsSubmitting(false);
  }
};
```

---

## Warnings

### WR-01: Race condition in AssigneeFilter — unstable `skillFilter` object reference triggers infinite fetches

**File:** `src/components/filters/AssigneeFilter.tsx:44`
**Issue:** The `useEffect` dependency array includes `skillFilter`, which is an object prop. If the parent component creates a new object literal on every render (e.g., `skillFilter={{ key: 'x', value: 'y' }}`), the effect re-fires on every render and triggers a new API call each time.

**Fix:** Memoize `skillFilter` in the parent, or stabilize the dependency inside `AssigneeFilter`:

```typescript
// Option A — parent memoizes
const skillFilter = useMemo(() => ({ key: 'lang', value: 'en' }), []);

// Option B — inside AssigneeFilter, use a serialized key
const skillFilterKey = JSON.stringify(skillFilter);
useEffect(() => { fetchUsers(); }, [selectedDepartmentRole, skillFilterKey]);
```

---

### WR-02: `ConfirmDialog.onConfirm` resets `newOrgId` to 0 before async handler reads it

**File:** `src/components/modals/EditUserModal.tsx:601-606`
**Issue:** The `onConfirm` callback resets `orgChangeDialog` to `{ open: false, newOrgId: 0 }` and then awaits `handleOrgChangeConfirm()`. The handler reads `orgChangeDialog.newOrgId` (line 234) from the React state snapshot captured in the closure. Because React state updates are batched, the handler is likely reading the old value — but this is an implicit reliance on stale-closure behavior and will silently break if the handler is refactored to re-read state asynchronously.

**Fix:** Capture the org ID before resetting:

```typescript
onConfirm={async () => {
  const newOrgId = orgChangeDialog.newOrgId;
  setOrgChangeDialog({ open: false, newOrgId: 0 });
  await handleOrgChangeConfirm(newOrgId); // pass explicitly
}}
```

---

### WR-03: `setOnlyMine` rollback uses inverted argument rather than previous committed state

**File:** `src/hooks/useSLANotifications.ts:109-119`
**Issue:** The optimistic-update rollback on API failure uses `!value` (the argument). If the user double-clicks the toggle before the first request settles, the rollback reverts to the negation of whichever call failed — not the last server-confirmed state.

```typescript
// Fix — capture previous state before mutating
const setOnlyMine = useCallback((value: boolean) => {
  const previousValue = prefsRef.current.onlyAssignedToMe;
  setOnlyAssignedToMeState(value);
  prefsRef.current = { ...prefsRef.current, onlyAssignedToMe: value };
  apiClient.put('/api/users/me/notification-preferences', { onlyAssignedToMe: value })
    .then(() => fetchNotifications())
    .catch(() => {
      setOnlyAssignedToMeState(previousValue);
      prefsRef.current = { ...prefsRef.current, onlyAssignedToMe: previousValue };
    });
}, [fetchNotifications]);
```

---

### WR-04: `SLANotificationBell` marks all notifications read before panel is visible

**File:** `src/components/layout/SLANotificationBell.tsx:132`
**Issue:** `handleOpen` calls `markAllRead()` at the same time as `setOpen((prev) => !prev)`. Because `setOpen` is asynchronous (React state batch), `markAllRead` fires and updates `localStorage` before the panel is rendered. If a notification fetch is in flight, arriving notifications get immediately marked as read before the user sees them.

**Fix:** Trigger `markAllRead` in a `useEffect` that responds to `open` becoming `true`:

```typescript
useEffect(() => {
  if (open && unreadCount > 0) markAllRead();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open]);
```

---

### WR-05: `convertTextToHtml` does not escape HTML entities — corrupts reply editor content

**File:** `src/components/messages/MessageDetail.tsx:461-466`
**Issue:** `convertTextToHtml` wraps plain text in `<p>` tags without escaping `<`, `>`, or `&`. When AI-suggested answers contain email addresses like `<user@example.com>` or angle-bracket constructs, they are injected as literal HTML tags into the RichTextEditor content string.

```typescript
// Fix — escape before wrapping
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const convertTextToHtml = (text: string): string =>
  text
    .split('\n\n')
    .filter((para) => para.trim())
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
```

---

### WR-06: Gmail OAuth popup: intervals and message listener leak on component unmount

**File:** `src/services/gmail-oauth.service.ts:184-247`
**Issue:** `connectWithPopup` registers `setInterval` timers (`checkAuth`, `checkClosed`) and a `window` `message` event listener inside a Promise executor. These are cleared when the OAuth flow completes, but if the calling React component unmounts during the flow (e.g., user navigates away), the intervals continue running and will attempt to call `handleCallback` and resolve the dangling Promise, causing potential state updates on an unmounted component.

**Fix:** Add an `AbortController` or mount-guard pattern in the calling component:

```typescript
// In GmailIntegrationCard
const abortRef = useRef(false);
useEffect(() => { return () => { abortRef.current = true; }; }, []);

const handleGmailOAuth = async () => {
  setSaving(true);
  try {
    const response = await gmailOAuthService.connectWithPopup(...);
    if (abortRef.current) return;
    // ... handle response
  } finally {
    if (!abortRef.current) setSaving(false);
  }
};
```

---

### WR-07: `MessageThread` timestamp-window loop recomputes `msgTime()` on every iteration — O(n²) `new Date` calls

**File:** `src/components/messages/MessageThread.tsx:195-210`
**Issue:** The reply-attribution `filter` callback inside the `customerEmails.forEach` loop calls `msgTime(sysMsg)` and `msgTime(customerMsg)` on every iteration. `msgTime` constructs `new Date(...)` each time. For a thread with N customer messages and M system replies this is O(N×M) `Date` construction calls.

**Fix:** Pre-compute and cache message times before the attribution loop:

```typescript
const timeCache = new Map<number, number>(
  allMessages.map((m) => [m.id, msgTime(m)])
);
// Then use timeCache.get(msg.id)! inside the filter
```

---

### WR-08: `TicketAttachments` socket lifecycle coupled to `fetchAttachments` identity

**File:** `src/components/tickets/TicketAttachments.tsx:53-76`
**Issue:** The single `useEffect` mixes socket lifecycle (`getSocket` / `releaseSocket`) with event subscription and data fetching, all keyed to `[ticketId, fetchAttachments]`. If a future change causes `fetchAttachments` to change identity without `ticketId` changing, the effect re-runs: it calls `releaseSocket` (decrementing the ref count) and then `getSocket` (incrementing it), potentially causing a spurious socket reconnect cycle.

**Fix:** Separate concerns into two effects:

```typescript
// Effect 1: socket lifecycle
useEffect(() => {
  getSocket();
  return () => releaseSocket();
}, [ticketId]);

// Effect 2: data fetch + event subscription
useEffect(() => {
  fetchAttachments().catch((e) => logger.error('Failed to fetch attachments:', e));
  const handleUpdate = (data: unknown) => {
    const eventData = data as { ticketId: number };
    if (eventData.ticketId === ticketId) {
      fetchAttachments().catch((e) => logger.error('Failed to refresh attachments:', e));
    }
  };
  subscribeToEvent('ticket:comments:updated', handleUpdate);
  return () => unsubscribeFromEvent('ticket:comments:updated', handleUpdate);
}, [ticketId, fetchAttachments]);
```

---

## Info

### IN-01: `EditUserModal` — `canEditRoles` uses `??` where `||` is likely intended

**File:** `src/components/modals/EditUserModal.tsx:95`
**Issue:** `const canEditRoles = isAdmin ?? (canManageUsers && !isEditingSelf)`. Nullish coalescing (`??`) only falls through when the left side is `null` or `undefined`. If `isAdmin` is `false` (which is the common case for non-admin users), the right-hand side is never evaluated. This means `canManageUsers && !isEditingSelf` is completely ignored for non-admins. If the intent is "admin OR (can-manage-users AND not-self)", use `||` instead:

```typescript
const canEditRoles = isAdmin || (canManageUsers && !isEditingSelf);
```

---

### IN-02: `SLAByPriorityTable` and `SLATrendChart` hardcode `days: 30` independently

**File:** `src/components/sla/SLAByPriorityTable.tsx:11`, `src/components/sla/SLATrendChart.tsx:11`
**Issue:** Both components hardcode a 30-day window and have separate React Query cache keys. Extracting to a shared constant or accepting a `days` prop from the parent (which already has a query client available) would allow consistent period control.

---

### IN-03: `StatisticsPage.fetchStatistics` not stabilized with `useCallback`

**File:** `src/pages/StatisticsPage.tsx:137, 157`
**Issue:** `fetchStatistics` is a plain `async function` declared inside the component body and used in a `useEffect` without being listed in the dependency array. This violates the `react-hooks/exhaustive-deps` rule. Wrap it in `useCallback` and add it to the deps array, or move it outside the component.

---

### IN-04: `connectWithPopup` has 8 positional parameters — fragile call sites

**File:** `src/services/gmail-oauth.service.ts:79-88`
**Issue:** Eight positional parameters make call sites difficult to read and error-prone (easy to swap adjacent optional params). A config object would be safer:

```typescript
interface ConnectWithPopupConfig {
  clientId: string;
  clientSecret: string;
  searchQuery?: string;
  maxResults?: number;
  pollingMaxPages?: number;
  bulkImportDays?: number;
  bulkImportMaxResults?: number;
  isKnowledgeBase?: boolean;
}
connectWithPopup(config: ConnectWithPopupConfig): Promise<ApiResponse<...>>
```

---

### IN-05: `withSignature` in `MessageDetail` inserts user signature without HTML-escaping

**File:** `src/components/messages/MessageDetail.tsx:468-474`
**Issue:** The user's email signature (fetched from the server and stored on the `user` object) is split by newlines and wrapped in `<p>` tags without escaping HTML entities. Since the signature content then enters the RichTextEditor (which sanitizes on render), the risk is limited to corrupted composer content rather than XSS — but email addresses with angle brackets or `&` characters in signatures will render incorrectly. Apply the same `escapeHtml` helper recommended in WR-05 to each signature line.

---

_Reviewed: 2026-04-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
