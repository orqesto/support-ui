# Code Review Report

**Reviewed:** 2026-04-24  
**Depth:** Deep (cross-file analysis)  
**Scope:** FE (7 files) + BE (9 files)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 4     |
| HIGH     | 8     |
| MEDIUM   | 9     |
| LOW      | 6     |
| **Total**| **27**|

---

## Critical

---

### CR-01 — [messageActionController.ts:162-193] `markAsUnprocessed` DB update missing org scope

**File:** `BE-service/src/modules/inbox/controllers/messageActionController.ts:177`

The final `db.update(messages).set({ processed: false }).where(eq(messages.id, id))` call does **not** include the `organizationId` condition in its `WHERE` clause. Every other write in this same file (e.g. `markAsProcessed` at line 113, `classifyMessage` at line 46/89) correctly adds `eq(messages.organizationId, message.organizationId)` to prevent cross-tenant writes. This one does not.

**Impact:** An authenticated agent from Org A who has guessed or obtained a message ID from Org B can reopen that message (set `processed=false`), silently corrupting the processing state of another tenant's record. This violates the multi-tenant isolation guarantee.

**Fix:**
```typescript
const [finalMessage] = await db
  .update(messages)
  .set({ processed: false })
  .where(
    and(
      eq(messages.id, id),
      eq(messages.organizationId, existingMessage.organizationId)
    )
  )
  .returning();
```

---

### CR-02 — [sentFolderService.ts:86-120] `backfillThreadParent` inserts messages without `organizationId` guard

**File:** `BE-service/src/modules/inbox/ingestion/email/sentFolderService.ts:88-110`

`backfillThreadParent` performs a `db.insert(messages).values({ organizationId, ... })` that receives `organizationId` as a plain function argument — there is **no validation** that the `organizationId` argument matches the `gmail` auth client or that the `integrationId` belongs to that organization. The function is called from `checkSentFolderForReplies` (line 369) and `backfillOrphanedOutgoingMessages` (line 544), both of which thread through the caller-supplied `organizationId`. If a caller passes a mismatched pair, messages are inserted under the wrong org without any DB-level or application-level constraint check here.

Additionally, the deduplication check at line 73 calls `checkMessageDuplicate(extId, organizationId, 'email')` **without** a `departmentRole` filter, unlike the equivalent calls in `gmailMessageProcessor.ts` lines 113 and 130 which include the department. This means the same Gmail message can be detected as a duplicate across departments (preventing legitimate multi-department imports) or mis-filed to `departmentRole: 'general'` (line 399) when `parentMessage` is null.

**Impact:** Potential cross-org data insertion if caller passes wrong IDs; inconsistent department attribution for backfilled messages.

**Fix:** Validate that the integration belongs to the supplied org before inserting. Pass `departmentRole` to `checkMessageDuplicate` in line 73 to match the behavior of the main processor.

---

### CR-03 — [sentFolderService.ts:394-415] Sent-reply import skips spam check — any content is inserted as a processed record

**File:** `BE-service/src/modules/inbox/ingestion/email/sentFolderService.ts:394`

When `checkSentFolderForReplies` imports a sent email as an outgoing record, it inserts with `processed: true` and `resolved: true` directly, **never running spam detection**. This is intentional for genuine agent replies, but the function processes **all** messages from the Gmail SENT label — including emails the support account sent to *other* external parties (e.g., vendor emails, personal correspondence of a shared account). There is no guard ensuring the `toEmail` recipient is a known customer. A malicious actor who gains access to the Gmail account's sent folder could pollute the DB.

More critically, `ensureThreadComplete` (line 668) also inserts incoming messages from threads with `processed: true` (line 794) and runs only the lightweight `checkSpamRules` (pattern-only, no embedding/AI). Critical spam messages already rejected by `gmailMessageProcessor` can be re-inserted by `ensureThreadComplete` if the thread backfill catches them — the `status: 'filtered'` stub guard in the main processor is not checked here.

**Impact:** Spam messages silently re-enter the inbox via `ensureThreadComplete`; non-customer emails pollute the message store.

**Fix:** In `ensureThreadComplete`, after the spam stub is saved, verify the message is not already in the DB with `status='filtered'` before re-inserting. Add a recipient-validation step in `checkSentFolderForReplies` to skip messages whose recipient is not a previously-known sender in the org.

---

### CR-04 — [TicketAttachments.tsx:88-97] Auth token leaked into URL — stored in browser history and server logs

**File:** `FE-app/src/components/tickets/TicketAttachments.tsx:88-97`

`getAttachmentUrl()` appends the auth token as a query parameter (`?token=${token}`). This URL is then used for `<img src=...>` (line 259), `window.open(...)` (line 294), and `<a href=...>` download links (line 301-304).

**Impact:**
1. The token appears in the browser's address bar history and HTTP `Referer` headers when a linked page is opened.
2. Server-side access logs record the full URL including the token.
3. The `<img>` tag makes a GET request with the token visible in network logs and DevTools to any other extension or script on the page.
4. In multi-tenant SaaS, a leaked session token can be used to access any resource owned by that organization.

**Fix:** Use short-lived signed download URLs generated server-side (no credential in URL), or use `Authorization: Bearer` headers via a `fetch()` call with `createObjectURL()`. At minimum, move the token to a query param that is signed and expires within 60 seconds.

---

## High

---

### HR-01 — [spamDetectionService.ts:213] Unvalidated `JSON.parse` on LLM response

**File:** `BE-service/src/modules/ai/spam/spamDetectionService.ts:213`

```typescript
const analysis = JSON.parse(result) as SpamAnalysisResponse;
```

The `response_format: { type: 'json_object' }` parameter reduces (but does not eliminate) malformed JSON. The cast `as SpamAnalysisResponse` does **no runtime validation** — required fields like `isSpam` (boolean), `confidence` (number), `category` (enum) are not checked. If the LLM returns `{ "isSpam": "yes" }`, the downstream code reading `analysis.isSpam` will compare a string against boolean logic silently.

**Impact:** Garbage classification data written to `messages.metadata.spamCheck`. A carefully crafted email subject could induce the LLM to produce a partial JSON response, causing all field reads to return `undefined` — the message is then classified as `legitimate` by type coercion, bypassing spam detection.

**Fix:** Use Zod or a manual shape-check before accepting the response:
```typescript
const raw = JSON.parse(result);
if (typeof raw.isSpam !== 'boolean' || typeof raw.confidence !== 'number') {
  throw new Error('Invalid LLM spam response shape');
}
const analysis = raw as SpamAnalysisResponse;
```

---

### HR-02 — [messageActionController.ts:224-249] Debug endpoint `testEmailProcessing` leaks org data and has no access-control check

**File:** `BE-service/src/modules/inbox/controllers/messageActionController.ts:224`

`testEmailProcessing` runs a live `analyzeMessage` call and returns the full analysis result to any authenticated user. It also resolves the org via `userOrganizations` using the user's ID (line 234-237) but **does not check** if `req.user` is defined before dereferencing `req.user?.userId || 0` — if the middleware doesn't set `req.user`, `userId` is `0`, and the query returns the first org found with that user-ID (likely nothing), but the function still calls `generateEmbedding` with no `organizationId`. More importantly, there is no role check; any authenticated user (not just admins) can trigger an AI analysis call that costs money and logs usage.

**Impact:** Any authenticated user can exhaust the org's AI quota; potential data exposure via analysis result.

**Fix:** Add `if (!req.user) throw new ApiError('Authentication required', 401);` at the top, add a role guard (`req.user.role === 'admin'`), and either remove the endpoint in production or gate it behind an env flag.

---

### HR-03 — [ticketService.ts:37] `getMetadata` passes raw `filters` object to `URLSearchParams` without sanitization

**File:** `FE-app/src/services/ticket.service.ts:37`

```typescript
const params = new URLSearchParams({
  ...filters,        // ← no null/undefined filtering
  limit: limit.toString(),
});
```

Unlike `messageService.ts` which has the `cleanFilters()` helper (line 6-8) applied to every call, `ticketService.ts:getMetadata` and `ticketService.ts:getAll` (line 54) spread `filters` directly. If any filter value is `undefined`, `URLSearchParams` serializes it as the string `"undefined"`, sending `?status=undefined` to the server. The server may interpret this as a literal status string or produce a query error.

**Impact:** Silent filter bypass — `status=undefined` could be mishandled server-side, causing filtered results to appear or queries to fail without a user-visible error.

**Fix:**
```typescript
const params = new URLSearchParams({
  ...Object.fromEntries(Object.entries(filters ?? {}).filter(([, v]) => v != null)),
  limit: limit.toString(),
});
```

---

### HR-04 — [embeddingSpamCheck.ts:539] Typo in green-flag string produces malformed output

**File:** `BE-service/src/modules/ai/spam/embeddingSpamCheck.ts:539`

```typescript
greenFlags.push(`${match.rule.description} (${Math.round(match.similarity * 100)}%)}`);
//                                                                                    ^^^
```
An extra `}` is appended to every green-flag string in the "no strong signals" branch (also on line 553). The `}` is a literal character in the string and will be stored in `messages.metadata.spamCheck.greenFlags`, surfacing in the UI wherever green flags are rendered.

The same bug appears at line 539 and line 553 in the `else` branch and at line 553.

**Impact:** Cosmetic corruption of displayed green-flag text; JSON stored in DB has malformed flag strings which could break downstream consumers that parse flag content.

**Fix:** Remove the trailing `}` from the template literal:
```typescript
greenFlags.push(`${match.rule.description} (${Math.round(match.similarity * 100)}%)`);
```

---

### HR-05 — [sentFolderService.ts:248-259] Fallback subject matching uses `baseSubject` normalized from the **sent** email, compared against stored subjects not normalized the same way

**File:** `BE-service/src/modules/inbox/ingestion/email/sentFolderService.ts:259`

The DB query at line 288-290 applies `regexp_replace(lower(coalesce(...subject...)), '^(re|fwd|fw):\\s*', '', 'gi')` server-side, while `baseSubject` (line 259) strips only with the client-side `.replace(/^(re|fwd|fw):\s*/gi, '').trim().toLowerCase()`. These are equivalent — but both miss multi-level prefixes like `"Re: Re: ticket"`. After one `re:` is stripped, the remaining `"re: ticket"` still starts with `"re:"`, so the stored subject `"ticket"` never matches the computed `baseSubject = "re: ticket"`.

**Impact:** Fallback parent matching (Fallback 1) fails for email chains with multiple Re: prefixes, causing sent replies to be stored with `parentMessageId=null` and appearing orphaned in the thread view.

**Fix:** Use a loop or `replace(/(re|fwd|fw):\s*/gi, '')` (global, not anchored to `^`) to strip all prefixes:
```typescript
const baseSubject = subjectHeader.replace(/(re|fwd|fw):\s*/gi, '').trim().toLowerCase();
```
Apply the same non-anchored regex in the Drizzle SQL condition.

---

### HR-06 — [MessageThread.tsx:206-209] Zero-length time window epsilon is applied only when timestamps are exactly equal — floating-point drift causes silent reply loss

**File:** `FE-app/src/components/messages/MessageThread.tsx:206`

```typescript
const windowEnd = nextCustomerTime === msgTime(customerMsg)
  ? nextCustomerTime + 1
  : nextCustomerTime;
```

The `+ 1` (1 millisecond) epsilon is only applied when `nextCustomerTime === msgTime(customerMsg)` (batch import edge case). However, the comment on line 205 says "batch-imported messages with identical timestamps" — if the timestamps differ by only a few milliseconds (network jitter on `createdAt` vs `repliedAt`), the window is correctly set to a narrow positive range but `msgTime(sysMsg) < windowEnd` may still exclude a reply whose `repliedAt` timestamp is just 1–2ms after `nextCustomerTime`. This is a latent race condition on high-throughput imports.

More importantly: `msgTime` is called **three times** for `customerMsg` on each iteration of the outer `forEach` (lines 193, 206, 209) and O(n) times for `sysMsg` inside the inner `filter`. Because `msgTime` calls `new Date(...)` which may parse strings, this is a performance and consistency issue if the time value is non-deterministic (e.g., `repliedAt` is a nullable string that changes between renders).

**Impact:** Replies may be incorrectly orphaned in edge cases; memoization bug if `repliedAt` is mutable.

**Fix:** Memoize `msgTime` results into a `Map<number, number>` keyed by message ID before the pairing loop.

---

### HR-07 — [commentsService.ts:67-70] `update` and `delete` for comments have no ticket scope — IDOR risk

**File:** `FE-app/src/services/comments.service.ts:67-76`

`commentsService.update(commentId, content)` calls `PUT /api/comments/:commentId` and `commentsService.delete(commentId)` calls `DELETE /api/comments/:commentId`. Both use only the `commentId` in the URL — there is no `ticketId` in the request path or body. If the server-side route does not enforce that the comment belongs to a ticket owned by the requester's organization, any agent with a comment ID from another tenant can modify or delete it.

This is a FE service contract issue: the FE provides no contextual scope for the BE to enforce. The `create` and `getAll` routes correctly scope by `ticketId` (e.g. `/api/tickets/:ticketId/comments`), but update and delete break the pattern.

**Impact:** Potential IDOR if BE validation is absent or inconsistent. The FE service contract encourages scopeless calls.

**Fix:** Change the route contract:
```typescript
update: async (ticketId: number, commentId: number, content: string) =>
  apiClient.put(`/api/tickets/${ticketId}/comments/${commentId}`, { content }),

delete: async (ticketId: number, commentId: number) =>
  apiClient.delete(`/api/tickets/${ticketId}/comments/${commentId}`),
```

---

### HR-08 — [messageFilters.ts:44] `organizationId: null` branch allows global admin to bypass all org filtering — not safe by default

**File:** `BE-service/src/modules/inbox/controllers/helpers/messageFilters.ts:54`

```typescript
if (organizationId !== null) {
  conditions.push(eq(messages.organizationId, organizationId));
}
```

When `organizationId` is explicitly `null` (line 46 of the function signature allows `number | null`), the org condition is **skipped entirely**, returning messages from all organizations. The comment says "Only filter by organization if not global admin", but the caller must ensure `null` is only passed for trusted global-admin contexts. If any upstream controller passes `null` through mistake or a crafted request, all tenants' messages are exposed.

**Impact:** Any accidental `null` from a caller produces a cross-tenant data leak. There is no type-system enforcement preventing non-admin callers from passing `null`.

**Fix:** Make the param type `number` only, with a separate overload or guard for global admins. Alternatively, default to throwing if `null` is passed without an explicit `isGlobalAdmin: true` flag.

---

## Medium

---

### MD-01 — [MessageThread.tsx:412-415] HTML detection regex is too broad — plain-text emails with angle brackets render as HTML

**File:** `FE-app/src/components/messages/MessageThread.tsx:414`

```typescript
const isHtml = /<[a-z][\s\S]*>/i.test(html);
```

This regex matches any string containing an angle bracket followed by a letter, including `<3` (heart emoji shorthand), math expressions like `x < 5 value>`, or email addresses embedded in plain text as `<user@domain.com>`. Any plain-text message containing these patterns is incorrectly rendered via `dangerouslySetInnerHTML` instead of `<LinkifiedText>`, stripping whitespace and potentially rendering partial HTML.

**Fix:** Use a stricter detection, e.g. require a closing tag or a set of known block-level tags:
```typescript
const isHtml = /<(p|div|br|ul|ol|li|b|i|strong|em|blockquote|pre|a)[\s>]/i.test(html);
```

---

### MD-02 — [MessageThread.tsx:196-212] System replies without `parentMessageId` can attach to the wrong customer message when multiple customers send simultaneously

**File:** `FE-app/src/components/messages/MessageThread.tsx:195-212`

The timestamp-window fallback assigns a system reply to a customer message based purely on time ordering. In a high-volume scenario where two customers send messages within seconds of each other and an AI auto-reply fires for the first, the reply's timestamp may fall within the window of the second customer's pair (window = second_customer_time). The reply is then attached to the wrong customer's conversation.

**Impact:** Replies from one customer's thread appear in another customer's conversation view.

**Fix:** This is primarily a BE issue (replies should always have `parentMessageId` set), but the FE should treat unattached system replies (no `parentMessageId` match) as a separate "Unattributed Replies" section rather than silently assigning them by timestamp.

---

### MD-03 — [spamDetectionService.ts:19-23] `organizationId` is optional — spam detection silently degrades to heuristics for all org-less calls

**File:** `BE-service/src/modules/ai/spam/spamDetectionService.ts:19`

```typescript
export const detectSpam = async (
  input: SpamCheckRequest,
  organizationId?: number,    // ← optional
  ...
```

When `organizationId` is `undefined`, the function skips Steps 1 and 2 (DB pattern + embedding rules) entirely and falls through to the quick heuristic check. The comment at line 71-73 (`'No organization ID provided, message passed quick spam check'`) confirms this. The function is called from `gmailMessageProcessor.ts` (line 252) where `organizationId` is always defined, but the type contract does not prevent future callers from omitting it.

**Impact:** A future caller without an org ID gets effectively no spam detection — only the shallow heuristic check. This is a footgun in the public API.

**Fix:** Make `organizationId: number` required, or add a runtime guard that throws `ApiError` when called without an org ID.

---

### MD-04 — [embeddingSpamCheck.ts:263-293] Inverted logic: `else` branch on line 264 runs when `allSupportMatches` is empty, not when it has content

**File:** `BE-service/src/modules/ai/spam/embeddingSpamCheck.ts:252-293`

```typescript
if (allSupportMatches.length > 0) {
  allSupportMatches.forEach((match) => { greenFlags.push(...); });
}
// Allow green flags to override ONLY in very specific cases:
else {
  const veryStrongGreenFlags = allSupportMatches.filter(...);
  // ^ This is always empty because we're in the else branch (allSupportMatches.length === 0)
```

The `else` block at line 264 only executes when `allSupportMatches.length === 0`. Inside, `veryStrongGreenFlags` filters `allSupportMatches` which is always empty here — so `veryStrongGreenFlags.length >= 4` is **always false** and the override can **never trigger**. The logic appears inverted from its intent.

**Impact:** The "very strong green flags override weak spam pattern" path is dead code. Legitimate emails flagged by very weak spam rules (severity ≤ 20) are never rescued by this override.

**Fix:** Move the override logic **inside** the `if (allSupportMatches.length > 0)` block:
```typescript
if (allSupportMatches.length > 0) {
  allSupportMatches.forEach((match) => { greenFlags.push(...); });
  const veryStrongGreenFlags = allSupportMatches.filter(m => m.similarity >= 0.9);
  const veryWeakPatternMatch = (patternResult.severity || 0) <= 20;
  ...
}
```

---

### MD-05 — [sentFolderService.ts:195-226] TOCTOU stub deletion is race-condition-safe at the DB level but application logic has an unchecked gap

**File:** `BE-service/src/modules/inbox/ingestion/email/sentFolderService.ts:195-226`

The stub-deletion approach correctly uses an atomic `DELETE ... WHERE ... AND metadata->>'skippedReason' = 'sent_only_label'` with `.returning()` to detect whether the delete actually ran. However, if `deleted.length === 0` (the record is already a full outgoing message), the code `continue`s (line 219) — silently skipping the deduplication and **not** re-importing the message. If the "full" outgoing record has `parentMessageId = null` (an orphan), `checkSentFolderForReplies` will never fix it because it always skips duplicates. Only `backfillOrphanedOutgoingMessages` handles this case, but it is a separate periodic job.

**Impact:** A message that was imported as an outgoing stub and then re-processed before the stub was cleaned up will remain an orphan until the periodic backfill runs.

**Fix:** When `deleted.length === 0`, check if the existing record has `parentMessageId = null` and call `backfillThreadParent` inline rather than skipping.

---

### MD-06 — [TicketAttachments.tsx:104-113] `getAttachmentSource` heuristic is fragile — misclassifies local email attachments whose filename doesn't contain "email-"

**File:** `FE-app/src/components/tickets/TicketAttachments.tsx:104-112`

```typescript
if (attachment.url.includes('email-')) {
  return 'Email';
}
```

The "Email" vs "Uploaded" distinction is based on whether the stored URL path contains the string `"email-"`. This is a path-naming convention, not a structured field. If the upload handler changes its naming scheme, or if an uploaded file is named `"email-receipt.pdf"`, it will be mis-labelled. Additionally, the condition `attachment.url.startsWith('http')` for Jira detection (line 104) conflicts with the delete-button guard at line 311 which uses the same check — a Jira attachment URL that changes from `https://` to a relative path would suddenly show a delete button.

**Impact:** Incorrect source labels shown to agents; incorrect delete-button visibility.

**Fix:** Add an explicit `source: 'email' | 'jira' | 'app'` field to the `Attachment` type and populate it server-side.

---

### MD-07 — [ticketService.ts:148-159] `getSimilar` silently omits `minSimilarity=0` because of falsy check

**File:** `FE-app/src/services/ticket.service.ts:151-155`

```typescript
if (params?.limit) {
  queryParams.append('limit', params.limit.toString());
}
if (params?.minSimilarity) {
  queryParams.append('minSimilarity', params.minSimilarity.toString());
}
```

Both checks use truthy coercion. `params.limit = 0` and `params.minSimilarity = 0` would be silently dropped, sending the server no parameter and allowing it to use its default (which may return all results regardless of similarity). While `limit=0` is likely an invalid input, `minSimilarity=0` is a valid request to include all results.

**Fix:** Use explicit `!= null` checks:
```typescript
if (params?.limit != null) queryParams.append('limit', params.limit.toString());
if (params?.minSimilarity != null) queryParams.append('minSimilarity', params.minSimilarity.toString());
```

---

### MD-08 — [messageFilters.ts:278-289] `customerResponded` filter compares `m_out.created_at < messages.created_at` — should compare against `repliedAt` or `receivedAt`

**File:** `BE-service/src/modules/inbox/controllers/helpers/messageFilters.ts:278-289`

```sql
AND m_out.created_at < messages.created_at
```

This filter finds threads "where customer replied after our outgoing message" by checking `outgoing.created_at < incoming.created_at`. But `created_at` is the DB insertion time, not the email send/receive time. For batch-imported historical threads, both messages may have the same `created_at` (inserted in the same job). The correct temporal comparison should use `COALESCE(m_out.replied_at, m_out.created_at) < COALESCE(messages.metadata->>'receivedAt', messages.created_at)`.

**Impact:** The "customer responded" filter may return incorrect results for backfilled/imported threads.

---

### MD-09 — [quickSpamCheck / spamDetectionHelpers.ts] `quickSpamCheck` is invoked on the main spam-detection path even when `organizationId` is present

**File:** `BE-service/src/modules/ai/spam/spamDetectionService.ts:63-66`

Step 3 (`quickSpamCheck`) in `detectSpam` runs **even when `organizationId` is defined** and Steps 1+2 returned null. The quick check may flag a legitimate message (e.g. one containing "click here" in a quoted reply) and return early before the more accurate embedding check runs. The intended flow based on the code comment is: patterns → embeddings → quick heuristics → AI. But the actual flow when embeddings return null is: patterns → **quick heuristics** (skipping the more accurate embedding fallback at Step 4 level).

**Impact:** False positives from quick heuristics block messages that embeddings would have correctly classified as legitimate.

**Fix:** Move the `quickSpamCheck` call to be a true last-resort fallback, only when no embedding-capable path is available.

---

## Low

---

### LW-01 — [MessageThread.tsx:234-236] Commented-out `return null` guard changes component behavior silently

**File:** `FE-app/src/components/messages/MessageThread.tsx:234-236`

```typescript
// if (!loading && conversationPairs.length === 0 && !hasThread && !error) {
//   return null;
// }
```

This block was intentionally disabled per the comment "Always show the thread section". However, it leaves dead code that could confuse future developers, and the comment explaining the intent is informal. The component now always renders a border and heading even for messages with no thread context, which may be undesirable UX.

**Fix:** Remove the commented-out block entirely and document the decision in the component's JSDoc.

---

### LW-02 — [documentation.service.ts:32] `metadata: unknown` type on `Documentation` bypasses type safety

**File:** `FE-app/src/services/documentation.service.ts:32`

`metadata: unknown` means every consumer must cast this field before use. Compare `Attachment.metadata: Record<string, unknown> | null` which at least allows keyed access. `unknown` forces every access site to use a type assertion, often unsafely. The same field in `types/index.ts` uses `Record<string, unknown>`.

**Fix:** Change to `metadata: Record<string, unknown> | null` for consistency.

---

### LW-03 — [spamDetectionService.ts:116-147] Hardcoded LLM prompt is duplicated between the `instructions` default and the system message

**File:** `BE-service/src/modules/ai/spam/spamDetectionService.ts:116-196`

The default `instructions` string and the `system` role message (lines 196-198) both contain similar anti-false-positive guidance. Any update to the policy must be made in two places. The `instructions` string is also customizable via DB template, but the `system` prompt is always hardcoded — a customer-configured template that overrides `instructions` still gets the hardcoded system role appended.

**Fix:** Move the static policy into the system role only, and use the DB template exclusively for the user-facing context.

---

### LW-04 — [ticketService.ts:83-107] `createWithAttachments` uses `String(value)` for objects — nested objects become `"[object Object]"`

**File:** `FE-app/src/services/ticket.service.ts:96`

```typescript
formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
```

This works for simple values, but if a `CreateTicketRequest` field is an array (e.g. a future `labelIds: number[]`), it becomes `JSON.stringify([1,2,3])` — a JSON string inside a FormData field that the server must parse explicitly. There is no documentation that the server expects JSON-encoded values for object fields. If the server uses a standard multipart parser, it will receive the raw JSON string.

**Fix:** Document the server's expected encoding contract, or switch to sending objects as flat fields (e.g. `labelIds[0]=1&labelIds[1]=2`).

---

### LW-05 — [messageFilters.ts:361-413] `parseMessageFilters` passes `query.search` through without sanitization

**File:** `BE-service/src/modules/inbox/controllers/helpers/messageFilters.ts:411`

```typescript
search: query.search as string | undefined,
```

`query.search` is cast directly without trimming, length-limiting, or stripping control characters. The Drizzle `ilike` call on line 85 uses parameterized queries so SQL injection is not possible, but an extremely long search string (e.g. 100 KB) will produce a massive `LIKE` pattern that can cause excessive DB CPU usage.

**Fix:** Add a length cap: `search: typeof query.search === 'string' ? query.search.trim().slice(0, 200) : undefined`.

---

### LW-06 — [types/index.ts] `PaginatedResponse<T>` shape is inconsistent between FE types and service-layer re-declarations

**File:** `FE-app/src/types/index.ts:121-126`

`types/index.ts` defines:
```typescript
export type PaginatedResponse<T> = ApiResponse<{ items: T[]; total: number; page: number; limit: number }>;
```

But `message.service.ts` (line 29-33) and `ticket.service.ts` (line 13-17) each re-declare their own `PaginatedResponse<T>` with a different shape:
```typescript
export type PaginatedResponse<T> = { success: boolean; data: T; pagination: PaginationMeta; };
```

These are structurally incompatible. Components that import from `@/types` vs from a service module will receive different shapes for the same API responses.

**Fix:** Consolidate to a single `PaginatedResponse<T>` in `types/index.ts` that matches the actual API contract, and remove the re-declarations from service files.

---

*Reviewed by Claude (deep mode) — 2026-04-24*
