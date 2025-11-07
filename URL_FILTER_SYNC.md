# URL Filter Synchronization

## What It Does

**Bidirectional synchronization** between URL query parameters and filter state, enabling:
- ✅ **Refresh persistence** - Filters preserved after page reload
- ✅ **Shareable links** - Copy URL to share filtered view with team
- ✅ **Browser history** - Back/forward buttons work with filter changes
- ✅ **Bookmarkable** - Save specific filter combinations

## Implementation

### How It Works

**Two-way sync:**
```
URL params ←→ Filter state
     ↓              ↓
On mount:      On change:
Read URL   →   Update URL
Set filters    (real-time)
```

### Messages Page

**URL Parameters:**
```
/messages?processed=all&channel=email&attachments=true&search=login
```

**Supported filters:**
- `processed` - 'all' | 'true' | 'false'
- `channel` - 'all' | 'email' | 'telegram' | 'slack'
- `spam` - 'true' (boolean flag)
- `worthy` - 'true' (boolean flag)
- `needsInfo` - 'true' (boolean flag)
- `attachments` - 'true' (boolean flag)
- `replies` - 'true' (boolean flag)
- `ticket` - 'true' | 'false'
- `failed` - 'true' (boolean flag)
- `search` - string (search query)
- `id` - number (selected message ID)

**Examples:**
```
# Unprocessed emails with attachments
/messages?processed=false&attachments=true

# All spam messages
/messages?processed=all&spam=true

# Search in Telegram messages
/messages?channel=telegram&search=help

# Failed emails only
/messages?failed=true

# Open specific message
/messages?id=123
```

### Tickets Page

**URL Parameters:**
```
/tickets?status=pending&priority=high&category=5&jira=false
```

**Supported filters:**
- `status` - 'all' | 'pending' | 'open' | 'in_progress' | 'resolved' | 'closed'
- `priority` - 'all' | 'low' | 'medium' | 'high' | 'critical'
- `category` - string (category ID)
- `jira` - 'true' | 'false' (synced to Jira)
- `search` - string (search query)
- `id` - number (selected ticket ID)

**Examples:**
```
# Pending high priority tickets
/tickets?status=pending&priority=high

# Not synced to Jira
/tickets?jira=false

# Search in specific category
/tickets?category=5&search=login

# Open specific ticket
/tickets?id=456
```

## Code Implementation

### MessagesPage.tsx

**1. Read URL on mount:**
```typescript
useEffect(() => {
  const urlProcessed = searchParams.get('processed');
  const urlChannel = searchParams.get('channel');
  // ... read all params
  
  if (hasUrlFilters) {
    setFilters(urlFilters);
  }
}, []); // Only run on mount
```

**2. Update URL on filter change:**
```typescript
useEffect(() => {
  const params = new URLSearchParams();
  
  // Preserve message ID
  if (messageIdParam) {
    params.set('id', messageIdParam);
  }
  
  // Add filters (only non-default)
  if (filters.processed !== 'false') {
    params.set('processed', filters.processed);
  }
  // ... add all filters
  
  setSearchParams(params, { replace: true });
}, [filters]);
```

### TicketsPage.tsx

Same pattern as MessagesPage.

## User Experience

### Scenario 1: Refresh Page

**Before:**
```
1. Filter to "Unprocessed"
2. Refresh page → Filters reset ❌
```

**After:**
```
1. Filter to "Unprocessed"
2. URL: /messages?processed=false
3. Refresh page → Filters preserved ✅
```

### Scenario 2: Share Link

**Team collaboration:**
```
Support Agent 1:
1. Filters: status=pending, priority=high
2. Copies URL: /tickets?status=pending&priority=high
3. Sends to colleague

Support Agent 2:
1. Clicks link
2. Sees same filtered view ✅
```

### Scenario 3: Browser History

**Navigation:**
```
1. View "All messages"
   URL: /messages?processed=all
2. Filter to "Unprocessed"
   URL: /messages?processed=false
3. Click browser Back button
   → Returns to "All messages" ✅
```

### Scenario 4: Bookmarks

**Save common filters:**
```
# Bookmark: "Pending High Priority Tickets"
/tickets?status=pending&priority=high

# Bookmark: "Unprocessed Emails with Attachments"
/messages?processed=false&attachments=true

# Bookmark: "Telegram Support Messages"
/messages?channel=telegram&processed=false
```

## Technical Details

### URL Update Strategy

**Uses `replace: true`:**
```typescript
setSearchParams(params, { replace: true });
```

**Why?**
- Doesn't create new history entries on every filter change
- Prevents "back button hell" (clicking back 50 times through filter changes)
- Updates current URL in place

### Default Value Handling

**Only non-default values in URL:**
```typescript
// Default: processed='false'
// Only add to URL if different
if (filters.processed !== 'false') {
  params.set('processed', filters.processed);
}
```

**Benefits:**
- Cleaner URLs
- `/messages` instead of `/messages?processed=false&channel=all&...`
- Only meaningful filters shown

### Message/Ticket ID Preservation

**Always preserve selected item:**
```typescript
const messageIdParam = searchParams.get('id');
if (messageIdParam) {
  params.set('id', messageIdParam);
}
```

**Why?**
- Opening a message + changing filters preserves the selected message
- `/messages?id=123&processed=all` works correctly

## Benefits

### For Users

1. **No lost work** - Refresh doesn't clear filters
2. **Easy sharing** - Copy URL to share filtered view
3. **Quick access** - Bookmark common filter combinations
4. **Natural navigation** - Back/forward buttons work as expected

### For Support Teams

1. **Collaboration** - "Check this filtered view" (share link)
2. **Workflows** - Bookmark "My pending high-priority tickets"
3. **Training** - Share specific filtered views with new team members
4. **Reporting** - Share filtered views with managers

### For Developers

1. **Stateless** - URL is source of truth
2. **Testable** - Can construct URLs programmatically
3. **Debuggable** - Current filter state visible in URL
4. **Analytics** - Track which filter combinations are used most

## Examples in Production

### Customer Support Workflow

**Morning routine:**
```
1. Open bookmark: /tickets?status=pending&priority=high
   → See all urgent pending tickets
2. Work through tickets
3. Switch to: /tickets?status=open&priority=medium
   → Continue with medium priority
4. End of day: /tickets?status=resolved
   → Review what was resolved today
```

### Team Collaboration

**Escalation:**
```
Support Agent:
"Hey, can you check this urgent ticket?"
Shares: /tickets?id=789&status=pending&priority=critical

Manager:
Opens link → Sees ticket + filtered context ✅
```

### Email Monitoring

**Different views:**
```
# Morning: Check new unprocessed
/messages?processed=false

# Spam review:
/messages?spam=true

# Telegram support:
/messages?channel=telegram

# Failed sends:
/messages?failed=true
```

## Testing

### Test Cases

**1. Refresh Persistence**
```
Steps:
1. Apply filter: Status = Pending
2. URL should show: ?status=pending
3. Refresh page (F5)
4. Expected: Filter still "Pending" ✅
```

**2. Shareable Link**
```
Steps:
1. Apply filters: status=pending, priority=high
2. Copy URL: /tickets?status=pending&priority=high
3. Open in new tab/incognito
4. Expected: Same filters active ✅
```

**3. Browser Back/Forward**
```
Steps:
1. View "All" → URL: ?processed=all
2. Change to "Unprocessed" → URL: ?processed=false
3. Click Back button
4. Expected: Returns to "All" ✅
```

**4. Message Selection + Filters**
```
Steps:
1. Open message #123 → URL: ?id=123
2. Change filter to "All" → URL: ?id=123&processed=all
3. Expected: Message still open + filter changed ✅
```

**5. Clear Filters**
```
Steps:
1. Apply multiple filters
2. Click "Clear Filters"
3. Expected: URL shows only /messages (no params) ✅
```

## Known Behaviors

### Filter Changes Don't Navigate

**Current behavior:**
- Changing filters updates URL with `replace: true`
- **Doesn't** create new history entry
- Back button goes to previous page, not previous filter

**Rationale:**
- Prevents "back button hell"
- Each filter change would create history entry
- Users expect back button to go to previous page

### Default Values Not Shown

**Current behavior:**
- Default filters omitted from URL
- `/messages` instead of `/messages?processed=false&channel=all&...`

**Rationale:**
- Cleaner URLs
- Only meaningful filters shown
- Easier to read and share

## Future Enhancements

Potential improvements:
- [ ] Persist sorting order in URL
- [ ] Persist pagination page number
- [ ] Filter presets/templates (save named filter combinations)
- [ ] Query string compression for complex filters
- [ ] Share button to copy current filtered URL
- [ ] "Reset to defaults" vs "Clear all" distinction
- [ ] Filter history dropdown (recent filter combinations)

## Browser Compatibility

✅ **All modern browsers support URLSearchParams:**
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile: Full support

## Performance

**Minimal impact:**
- URL updates are synchronous (no API calls)
- `replace: true` prevents history pollution
- Only updates when filters actually change
- No re-renders on URL update alone
