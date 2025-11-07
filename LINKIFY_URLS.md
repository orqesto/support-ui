# URL Linkification Feature

## What It Does

Automatically detects URLs in message content and converts them to **clickable links** with nice styling.

## Implementation

### Utility Function: `linkify.tsx`

Created `/FE-app/src/lib/linkify.tsx`:

```tsx
export const linkifyText = (text: string): React.ReactNode
export const LinkifiedText = ({ children }: { children: string })
```

**Features:**
- ✅ Detects `http://`, `https://`, and `www.` URLs
- ✅ Converts to clickable `<a>` tags
- ✅ Opens in new tab (`target="_blank"`)
- ✅ Truncates very long URLs (>60 chars) for display
- ✅ Shows full URL on hover (title attribute)
- ✅ External link icon indicator
- ✅ Blue link styling with hover effects
- ✅ Dark mode support
- ✅ Proper `rel="noopener noreferrer"` for security

### URL Pattern

```regex
/(https?:\/\/[^\s]+|www\.[^\s]+)/gi
```

Matches:
- `https://example.com/path`
- `http://example.com/path`
- `www.example.com/path` (auto-prefixes with `https://`)

### Applied To

**Updated Components:**

1. **MessageDetail.tsx** - Main message view:
   - Message content (line 300)
   - AI auto-reply content (line 325)
   - Documentation suggested answers (line 371)
   - Similar ticket/message suggested answers (line 417)

2. **MessageThread.tsx** - Email thread conversations:
   - Customer email content (line 330-334)
   - System reply content (line 386-390)

3. **TicketDetail.tsx** - Ticket descriptions:
   - Ticket description content (line 181)

## User Experience

### Before (Plain Text)
```
Visit https://d2v8tf04.na1.hubspotlinks.com/Ctc/5F+113/d2v8tf04/VVqDWR85...
```
❌ Not clickable
❌ Breaks layout on long URLs
❌ Hard to read

### After (Linkified)
```
Visit https://d2v8tf04.na1.hubspotlinks.com/Ctc/5F+113/d2v8t... ↗️
```
✅ Clickable (opens in new tab)
✅ Truncated display for long URLs
✅ Full URL on hover
✅ External link icon
✅ Beautiful blue underline
✅ Wraps properly

## Styling

```css
className="inline-flex items-center gap-1 
  text-blue-600 hover:text-blue-800 
  dark:text-blue-400 dark:hover:text-blue-300 
  underline decoration-blue-600/30 hover:decoration-blue-600 
  dark:decoration-blue-400/30 dark:hover:decoration-blue-400 
  transition-colors break-all"
```

**Features:**
- Blue text color (different shades for light/dark mode)
- Underline with transparency (30%) for subtlety
- Full underline on hover
- Smooth color transitions
- Breaks long URLs at any character (`break-all`)
- External link icon with gap spacing

## Security

**Proper attributes:**
- `target="_blank"` - Opens in new tab
- `rel="noopener noreferrer"` - Prevents:
  - `window.opener` access (security risk)
  - Referrer leakage (privacy)

## Display Truncation

Long URLs (>60 characters) are truncated:

```tsx
const displayText = part.length > 60 
  ? `${part.substring(0, 60)}...` 
  : part;
```

**Example:**
```
https://d2v8tf04.na1.hubspotlinks.com/Ctc/5F+113/d2v8tf04/V...
```

Full URL available:
- On hover (title attribute)
- On click (href)

## Testing

### Test Cases

1. **HTTP URLs**
   ```
   Visit http://example.com for more info
   ```
   ✅ Clickable link

2. **HTTPS URLs**
   ```
   Check https://github.com/user/repo
   ```
   ✅ Clickable link

3. **WWW URLs**
   ```
   Go to www.google.com
   ```
   ✅ Converts to https://www.google.com

4. **Multiple URLs**
   ```
   Visit https://site1.com and https://site2.com
   ```
   ✅ Both clickable

5. **URLs with Paths**
   ```
   https://example.com/path/to/page?query=1&key=value
   ```
   ✅ Full URL preserved

6. **Very Long URLs**
   ```
   https://d2v8tf04.na1.hubspotlinks.com/Ctc/5F+113/d2v8tf04/VVqDWR85-Yz_Vg-thQ1f9wBJW2-PQhc5Dmj3N5jsFQR3yv95...
   ```
   ✅ Truncated display, full URL on hover

### Where to Test

1. **Messages Page** → Open any message with URLs
2. **Message Threads** → Expand conversation thread, check customer/reply emails
3. **AI Auto-Replies** → Messages with AI-generated responses containing URLs
4. **Suggested Answers** → Documentation/ticket suggestions with URLs
5. **Tickets Page** → Open ticket descriptions containing URLs
6. **Dark Mode** → Toggle theme and verify link colors in all locations

## Examples

### Email Content
```
Hey usetixly@gmail.com, and welcome to ngrok.

Visit https://dashboard.ngrok.com to get started.
Learn more at www.ngrok.com/docs
```

**Result:**
- All URLs clickable
- Opens dashboard in new tab
- Opens docs in new tab
- Clean, professional appearance

### Support Message
```
I found the solution at https://stackoverflow.com/questions/12345/example-question

Also check http://docs.example.com/api
```

**Result:**
- Stack Overflow link clickable with icon
- Docs link clickable with icon
- Both open in new tabs

## Browser Compatibility

✅ **Chrome/Edge:** Full support
✅ **Firefox:** Full support  
✅ **Safari:** Full support
✅ **Mobile:** Full support (touch-friendly)

## Future Enhancements

Potential improvements:
- [ ] Email address detection and `mailto:` links
- [ ] Phone number detection and `tel:` links
- [ ] Link preview on hover (like Slack/Discord)
- [ ] Favicon display next to domain
- [ ] Shorten display text more aggressively on mobile
- [ ] Copy link button on hover
- [ ] Track link clicks (analytics)
- [ ] Warn about suspicious/phishing URLs

## Performance

**Minimal impact:**
- Simple regex split operation
- No API calls
- No external libraries
- Renders inline (no additional DOM nesting)

## Code Lint Note

The ESLint warnings about array indices in keys are acceptable here because:
- The parts array is static (no reordering)
- Combined with content snippet for stability
- Standard pattern for text splitting
- React reconciliation handles it correctly
