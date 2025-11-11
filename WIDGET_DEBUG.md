# MessageProcessingProgress Widget Not Showing - Debug Steps

## Quick Fix: Clear localStorage

Open browser DevTools (F12) → Console → Run:

```javascript
localStorage.removeItem('closedEmailSessions');
location.reload();
```

This clears any previously closed widget sessions.

---

## Check What's Happening

### 1. Open WebSocket Debug Panel
- Click the blue **Activity button** on the right side of screen
- Check if events are being received

### 2. Check Browser Console
Open DevTools → Console and look for:
- `📡 [WEBSOCKET]` logs
- `email:processing` events
- `sessions` Map updates

### 3. Check Hook State
In console, run:
```javascript
// This won't work directly, but check for React DevTools
// Look for Layout component → useEmailProcessing hook → sessions
```

---

## Potential Issues

### Issue 1: localStorage Blocking
**Symptom:** Processing is running but widget doesn't appear
**Cause:** Previously closed widgets are stored in localStorage
**Fix:** Clear localStorage (command above)

### Issue 2: WebSocket Not Receiving Events
**Symptom:** WebSocket connected but no events
**Cause:** Backend not emitting events
**Check:** Backend logs should show `📡 [WEBSOCKET] Emitting email:processing`

### Issue 3: Hook Not Creating Sessions
**Symptom:** Events received but sessions not created
**Cause:** Missing integrationId or integrationName in event
**Fix:** Check event payload in WebSocket debug

---

## Expected Flow

1. Backend starts processing → emits `email:processing` with type: 'started' or 'processing'
2. Frontend hook receives event → creates/updates session in Map
3. Layout filters sessions → creates visibleSessions array
4. Widget renders for each visible session

---

## Debug the Hook

Add console.log to useEmailProcessing:

```typescript
// In handleProcessing callback
console.log('Event received:', event);
console.log('Sessions after update:', Array.from(newSessions.entries()));
```
