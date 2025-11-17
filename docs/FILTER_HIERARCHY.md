# Filter Hierarchy System

## Overview
Implemented a two-tier filter system for the Messages page to provide better UX when switching between different views.

## Filter Tiers

### Tier 1: Primary Filters (Define the main view)
These filters define the **main context** of what you're viewing:

- **Status** (`processed`) - all / unprocessed / processed / resolved
- **Channel** (`channel`) - all / email / telegram / slack  
- **Source** (`messageSourceId`) - all / specific integration ID

**Behavior:** When you change any primary filter, it:
- ✅ **Keeps** other primary filters
- ❌ **Clears** all secondary filters
- 💡 **Rationale:** You're switching to a different main view, so contextual refinements no longer make sense

**Example:**
```
Current: Status=unprocessed, Channel=email, Search="login", HasAttachments=true
User changes: Status → "resolved"
Result: Status=resolved, Channel=email, Search=cleared, HasAttachments=cleared
```

### Tier 2: Secondary Filters (Refine within the view)
These filters **refine** the current view:

- `search` - Text search
- `showSpam`, `excludeSpam` - Spam filtering
- `showNeedsInfo`, `showWorthy` - AI analysis flags
- `hasAttachments`, `hasReplies`, `hasTicket` - Content filters
- `showFailed` - Failed messages

**Behavior:** When you change any secondary filter, it:
- ✅ **Keeps** ALL filters (both primary and secondary)
- 💡 **Rationale:** You're refining within the same view, so all context remains relevant

**Example:**
```
Current: Status=unprocessed, Channel=email, Search=""
User changes: HasAttachments → true
Result: Status=unprocessed, Channel=email, HasAttachments=true (all kept)
```

## Implementation

### Store Methods

**`updatePrimaryFilter(key, value)`**
```typescript
// Changes: Status, Channel, or Source
// Keeps: Other primary filters
// Clears: All secondary filters
updatePrimaryFilter('processed', 'resolved');
```

**`updateSecondaryFilter(key, value)`**
```typescript
// Changes: Any secondary filter
// Keeps: ALL filters
updateSecondaryFilter('hasAttachments', true);
```

### Usage in Components

```typescript
const handleFilterChange = (key: string, value: string | boolean) => {
  const primaryFilters = ['processed', 'channel', 'messageSourceId'];
  
  if (primaryFilters.includes(key)) {
    updatePrimaryFilter(key, value);
  } else {
    updateSecondaryFilter(key, value);
  }
};
```

## Console Logs

The system logs filter changes for debugging:

```
🔵 Primary filter changed: processed = resolved
   Keeping: processed, channel, messageSourceId
   Clearing: all secondary filters

🟢 Secondary filter changed: hasAttachments = true
   Keeping: all filters
```

## Benefits

1. **Better UX** - Switching between main views (Status/Channel/Source) gives you a clean slate for refinements
2. **Intuitive** - Primary filters are like "tabs", secondary filters are like "search/filters within a tab"
3. **Consistent** - Predictable behavior every time
4. **Flexible** - You can still refine extensively within any view

## Example Workflows

### Workflow 1: Finding resolved tickets with attachments
1. Change Status → "resolved" (clears search, attachments)
2. Change HasAttachments → true (keeps status)
3. Result: All resolved messages with attachments

### Workflow 2: Switching between channels
1. Viewing: Channel=email, Search="password"
2. Change Channel → "telegram" 
3. Result: Channel=telegram, Search cleared (fresh start in telegram)

### Workflow 3: Refining within status
1. Viewing: Status=unprocessed
2. Add Search → "login"
3. Add HasAttachments → true
4. Add Channel → "email"  
5. Result: All filters combine (unprocessed + login + attachments + email)

## Files Modified

- `/FE-app/src/stores/messagesStore.ts` - Added `updatePrimaryFilter` and `updateSecondaryFilter` methods
- `/FE-app/src/pages/MessagesPage.tsx` - Updated `handleFilterChange` to use tier-based methods
