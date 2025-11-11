# AI Provider Enable/Disable Toggle

## Feature Added

Added enable/disable toggle switches to all AI provider cards in Settings → AI Providers.

## Problem Solved

**Before:** 
- AI providers had `enabled` hardcoded to `true` when saving
- Only way to stop using a provider was to **delete** it entirely
- No way to temporarily disable a provider for testing or cost management

**After:**
- Each provider card has an Enable/Disable toggle switch
- Providers can be disabled without losing configuration
- Visual indicator shows enabled (green dot) vs disabled (gray dot) status

## Implementation

### Backend
- Already had `enabled` field in integrations table
- Already had `update` API method: `PATCH /api/integrations/:id` accepting `{ enabled: boolean }`
- No backend changes needed ✅

### Frontend Changes

**Files Modified:**
1. `/FE-app/src/components/settings/AIProvidersSettings.tsx`
   - Added `toggling` state to track which provider is being toggled
   - Added `toggleEnabled()` function that calls `integrationsService.update()`
   - Passes `toggling` and `onToggleEnabled` to all provider cards

2. `/FE-app/src/components/settings/providers/OpenAIProviderCard.tsx`
   - Added `toggling` and `onToggleEnabled` to props
   - Added toggle switch UI with Enabled/Disabled label

3. `/FE-app/src/components/settings/providers/AnthropicProviderCard.tsx`
   - Same changes as OpenAI card

4. `/FE-app/src/components/settings/providers/DeepSeekProviderCard.tsx`
   - Same changes as OpenAI card

5. `/FE-app/src/components/settings/providers/PerplexityProviderCard.tsx`
   - Same changes as OpenAI card

## UI/UX

### Toggle Switch
- Modern toggle switch design (matches Auto-Reply toggle)
- Shows "Enabled" or "Disabled" text next to switch
- Disabled state while toggling (prevents double-clicks)
- Success notification on toggle
- Accessible with `aria-label`

### Visual Indicators
- **Green dot** = Provider enabled
- **Gray dot** = Provider disabled

### Position
- Toggle appears in provider card header, next to Edit/Test/Delete buttons
- Consistent across all provider types

## Usage

1. Go to **Settings → AI Providers**
2. Find the provider you want to disable
3. Click the toggle switch next to "Enabled"/"Disabled" label
4. Provider is immediately disabled/enabled
5. Success notification confirms the change

## Benefits

- **Cost Control:** Temporarily disable expensive providers (e.g., Claude during testing)
- **Testing:** Switch between providers easily without reconfiguring
- **Configuration Preserved:** All API keys and settings remain saved when disabled
- **No Accidental Deletion:** Can disable instead of delete
- **Quick Recovery:** Re-enable with one click

## Technical Details

### API Call
```typescript
await integrationsService.update(integrationId, { enabled: !currentEnabled });
```

### State Management
```typescript
const [toggling, setToggling] = useState<number | null>(null);

const toggleEnabled = async (id: number, currentEnabled: boolean, name: string) => {
  setToggling(id);
  try {
    await integrationsService.update(id, { enabled: !currentEnabled });
    await fetchIntegrations(); // Refresh list
    // Show success notification
  } finally {
    setToggling(null);
  }
};
```

### Toggle Switch Component
```tsx
<label className="relative inline-flex items-center cursor-pointer" aria-label={`Toggle ${integration.name}`}>
  <input
    type="checkbox"
    checked={integration.enabled}
    onChange={() => onToggleEnabled(integration.id, integration.enabled, integration.name)}
    disabled={toggling === integration.id}
    className="sr-only peer"
  />
  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
</label>
```

## How It Works

1. **User clicks toggle** → `onChange` fired
2. **Call API** → `PATCH /api/integrations/:id { enabled: !currentEnabled }`
3. **Database updated** → `integrations.enabled = false`
4. **Frontend refreshes** → Calls `fetchIntegrations()`
5. **UI updates** → Toggle switch and status dot update
6. **System respects setting** → `getEnabledAIProviders()` only returns enabled providers

## Impact on System

### When Provider is Disabled:
- ❌ Not used for translations
- ❌ Not used for message analysis
- ❌ Not used for AI auto-reply
- ❌ Not listed in "Preferred AI Provider" dropdown
- ❌ Not returned by `getEnabledAIProviders()`
- ✅ Configuration still saved in database
- ✅ Can be re-enabled anytime

### When Provider is Enabled:
- ✅ Available for all AI features
- ✅ Shows in "Preferred AI Provider" dropdown
- ✅ Used according to priority (if no preference set)
- ✅ Can be tested via "Test Connection"

## Example Use Cases

### Scenario 1: Cost Management
```
Problem: OpenAI costs too high
Solution: 
1. Add cheaper DeepSeek provider
2. Disable OpenAI toggle
3. System now uses DeepSeek
4. Re-enable OpenAI when budget allows
```

### Scenario 2: Testing
```
Problem: Want to compare Claude vs GPT quality
Solution:
1. Enable both providers
2. Set preferred to Claude, test
3. Disable Claude, enable GPT
4. Compare results
5. Keep best one enabled
```

### Scenario 3: Temporary Outage
```
Problem: Anthropic API down
Solution:
1. Disable Anthropic toggle
2. System falls back to OpenAI
3. Re-enable when service restored
```

## Status

✅ **COMPLETE** - Ready for use

All four AI provider cards (OpenAI, Anthropic, DeepSeek, Perplexity) now have working enable/disable toggles.
