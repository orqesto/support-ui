# Message Date Display Fix

## Problem

The UI was showing the **database creation date** (when the system fetched/imported the email) instead of the **actual email date** (when the email was sent).

**Example:**
- Actual email sent: October 28, 2025 at 2:18 PM
- System imported: October 31, 2025 at 14:01:13
- UI was displaying: **31/10/2025, 14:01:13** ❌

## Solution

All message components now display the actual email date from `metadata.receivedAt` with fallback to `createdAt` if not available.

### Components Fixed

#### 1. MessageThread.tsx
**Lines 306-312** (Customer email date):
```typescript
{formatDate(
  new Date(
    (pair.customerEmail.metadata as { receivedAt?: string })?.receivedAt ??
      pair.customerEmail.createdAt
  )
)}
```

**Lines 371-377** (System reply date):
```typescript
{formatDate(
  new Date(
    (pair.systemReply.metadata as { receivedAt?: string })?.receivedAt ??
      pair.systemReply.createdAt
  )
)}
```

#### 2. MessageDetail.tsx
**Lines 225-227** (Already correct ✅):
```typescript
{formatDate(
  (message.metadata as { receivedAt?: string })?.receivedAt ?? message.createdAt
)}
```

Shows "Imported: [date]" as secondary timestamp when dates differ.

#### 3. MessageListItem.tsx
**Line 156** (Already correct ✅):
```typescript
{formatDate((message.metadata as { receivedAt?: string })?.receivedAt ?? message.createdAt)}
```

Shows import date in tooltip: `title="Imported: ${formatDate(message.createdAt)}"`

## Data Source

The actual email date is stored in `metadata.receivedAt` by the email ingestion services:

### Gmail (gmailMessageProcessor.ts)
```typescript
metadata: {
  receivedAt: parsed.date,  // Actual email date from Gmail API
  gmailMessageId: messageId,
}
```

### IMAP (imapService.ts)
```typescript
metadata: {
  receivedAt: incomingMessage.timestamp,  // Actual email date from IMAP
}
```

## Fallback Behavior

All components use this pattern:
```typescript
metadata.receivedAt ?? createdAt
```

This ensures:
- ✅ Shows actual email date when available (preferred)
- ✅ Falls back to import date if `receivedAt` is missing (old messages)
- ✅ No breaking changes for existing data
- ✅ Graceful degradation

## Result

Now the UI displays:
- **Actual email date** in the main timestamp (when the email was sent)
- **Import date** as optional secondary info (when available and different)

**Example:**
- Primary display: **28/10/2025, 14:18** ✅ (actual email date)
- Tooltip/secondary: "Imported: 31/10/2025, 14:01:13"

## Testing

To verify:
1. Send an email to the support address
2. Wait a few minutes/hours before the system fetches it
3. Check the message detail view
4. The date shown should be when you **sent** the email, not when the system imported it

## Related Components

All message date displays are now consistent:
- ✅ MessageThread.tsx - Thread conversation view
- ✅ MessageDetail.tsx - Individual message detail panel
- ✅ MessageListItem.tsx - Message list cards
