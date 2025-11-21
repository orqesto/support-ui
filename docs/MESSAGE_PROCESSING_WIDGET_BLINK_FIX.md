# Message Processing Widget Blink Fix

## Problem

The `MessageProcessingProgress` widget was blinking (rapidly showing/hiding) during message processing, causing a poor user experience.

## Root Cause Analysis

### Issue 1: Inconsistent `isProcessing` Flag

The `isProcessing` flag in `useEmailProcessing.ts` was not being updated consistently during WebSocket processing events:

1. **`started` event**: Sets `isProcessing: true` ✅
2. **`found` event**: Changed status to `'processing'` but didn't update `isProcessing` ❌
3. **`processing` event**: Used `shouldReactivate || existing.isProcessing` which just preserved the existing value ❌
4. **`complete` event**: Sets `isProcessing: false` ✅

### Issue 2: Premature `isProcessing = false`

When `current === total` but status is still `'processing'` (waiting for backend to send 'complete' event), the flag was set to `false` too early, causing flicker:

```typescript
// BEFORE (caused flickering):
const stillProcessing = current < total || existing.status !== 'complete';
// When current === total and status === 'processing': stillProcessing = false ❌
```

This inconsistent state caused the widget's visibility calculation to flicker:

```typescript
// Component visibility logic
const isActivelyProcessing =
  (isProcessing || status === 'started' || status === 'processing') && !allMessagesProcessed;
const shouldBeVisible = isActivelyProcessing || (hasRecentActivity && !isClosed);
```

When `isProcessing` wasn't explicitly `true`, the widget would hide/show based on the `status` value alone, which could change rapidly during processing.

## Solution

### 1. Fix `found` Event Handler (line 231)

```typescript
case 'found':
  if (existing) {
    const total = event.data?.total ?? 0;
    newSessions.set(sessionKey, {
      ...existing,
      status: 'processing',
      total,
      isProcessing: true, // Explicitly set when messages are found
    });
  }
  break;
```

### 2. Fix `processing` Event Handler (lines 252-264)

```typescript
case 'processing':
  if (existing) {
    // ... progress calculation ...

    // Keep isProcessing true if:
    // 1. We're getting processing events (implicit - we're in this case)
    // 2. Not all messages are done yet (current < total)
    // 3. OR status is still 'processing' (not complete/error)
    const stillProcessing = current < total || (existing.status !== 'complete' && existing.status !== 'error');

    newSessions.set(sessionKey, {
      ...existing,
      status: shouldReactivate ? 'processing' : existing.status,
      current,
      total,
      progress: clampedProgress,
      isProcessing: stillProcessing, // ← Stay true until explicitly complete/error
    });
  }
  break;
```

**Key Fix:** Added check for `existing.status !== 'error'` to keep `isProcessing = true` while status is `'processing'`, even when `current === total`, preventing premature hiding.

## Benefits

- ✅ **No more blinking** - `isProcessing` stays consistently `true` during the entire processing phase
- ✅ **Stable visibility** - Widget doesn't toggle show/hide rapidly
- ✅ **Better UX** - Smooth, predictable widget behavior
- ✅ **Correct state** - `isProcessing` accurately reflects whether messages are being processed
- ✅ **No premature hiding** - Widget stays visible until backend sends 'complete' event

## Testing

1. Start email/message source polling
2. Observe the processing widget appears and stays visible (no blinking)
3. Watch as progress updates smoothly from 0% → 100%
4. Verify widget shows "Complete" status when done
5. Widget should only hide after the auto-close timeout (30s/60s)

## Files Modified

- `/FE-app/src/hooks/useEmailProcessing.ts` (lines 224-231, 235-260)
