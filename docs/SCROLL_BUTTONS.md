# ScrollButtons Component

## Overview
A generic, reusable floating scroll button component that provides smooth navigation for long content. Works in both drawer/modal contexts and full-page views.

## Features
- ✅ Auto-detects drawer vs full-page mode
- ✅ Configurable thresholds
- ✅ Optional custom scroll targets
- ✅ Shows/hides based on scroll position
- ✅ Smooth scroll animations
- ✅ Works with any container

## Usage

### Basic (Default behavior)
```tsx
import { ScrollButtons } from '@/components/ScrollButtons';

<ScrollButtons />
```

Scrolls to:
- **Top:** Page/container top
- **Bottom:** Page/container bottom

### With Custom Bottom Target
```tsx
<ScrollButtons bottomTarget="[data-message-actions]" />
```

Scrolls to:
- **Top:** Page/container top
- **Bottom:** Custom selector element

### With Custom Thresholds
```tsx
<ScrollButtons 
  topThreshold={300}      // Show "up" after scrolling 300px
  scrollThreshold={150}   // Only show if content is 150px+ taller
/>
```

### Full Configuration
```tsx
<ScrollButtons 
  bottomTarget="[data-actions]"
  topThreshold={250}
  scrollThreshold={100}
/>
```

## Props

### `bottomTarget?: string`
- **Type:** CSS selector string
- **Default:** `undefined`
- **Description:** Target element for "scroll to bottom" button
- **Behavior:**
  - If provided: Scrolls to this element
  - If not provided: Scrolls to bottom of page/container

**Examples:**
```tsx
bottomTarget="[data-message-actions]"  // Scroll to actions section
bottomTarget="#footer"                 // Scroll to footer
bottomTarget=".comment-form"           // Scroll to comment form
```

### `topThreshold?: number`
- **Type:** number (pixels)
- **Default:** `200`
- **Description:** Minimum scroll distance before showing "scroll to top" button
- **Behavior:** Button appears only when scrolled past this threshold

**Examples:**
```tsx
topThreshold={100}   // Show after scrolling 100px
topThreshold={500}   // Show after scrolling 500px (for very long content)
```

### `scrollThreshold?: number`
- **Type:** number (pixels)
- **Default:** `100`
- **Description:** Minimum extra height needed to show buttons
- **Behavior:** Buttons only appear if content height exceeds viewport by this amount

**Examples:**
```tsx
scrollThreshold={50}    // Show buttons if content is 50px+ taller
scrollThreshold={200}   // Show buttons if content is 200px+ taller (avoid small pages)
```

## Behavior

### Drawer/Modal Mode
Detected when component is inside `.overflow-auto` or `.overflow-y-auto` container:
- Monitors container scroll
- Buttons scroll within the container
- Position: Fixed to bottom-right of viewport

### Full-Page Mode
Detected when path includes `/messages/` or `/tickets/`:
- Monitors window scroll
- Buttons scroll the page
- Position: Fixed to bottom-right of viewport

### Auto-Detection
- Checks for scrollable parent container
- Falls back to window scroll if none found
- Re-checks after 1 second (for async content loading)

## Button Visibility

### Top Button (⬆️)
Shows when:
- Content is scrollable (`scrollHeight > clientHeight + scrollThreshold`)
- AND scrolled down past `topThreshold`

### Bottom Button (⬇️)
Shows when:
- Content is scrollable
- AND not near bottom (more than `topThreshold` pixels remaining)

## Examples

### Message Detail
```tsx
// MessageDetail.tsx
<ScrollButtons bottomTarget="[data-message-actions]" />
```

Scrolls to actions section at the bottom.

### Ticket Detail
```tsx
// TicketDetail.tsx
<ScrollButtons bottomTarget="[data-ticket-actions]" />
```

Scrolls to ticket actions.

### Long Form
```tsx
// LongForm.tsx
<ScrollButtons 
  bottomTarget="#submit-button"
  topThreshold={300}
  scrollThreshold={150}
/>
```

Scrolls to submit button, with custom thresholds.

### Documentation Page
```tsx
// DocsPage.tsx
<ScrollButtons />
```

Simple top/bottom scrolling with defaults.

### FAQ Page
```tsx
// FAQPage.tsx
<ScrollButtons 
  topThreshold={400}
  scrollThreshold={200}
/>
```

Higher thresholds for very long content.

## Styling

Buttons use:
- `fixed` positioning
- `right-6 bottom-24` (24px from bottom to avoid footer)
- `z-40` (high z-index to stay on top)
- Semi-transparent background (`bg-background/80`)
- Backdrop blur effect
- Hover scale animation

## Technical Details

### Scroll Detection
1. Checks on mount
2. Re-checks after 1 second (async content)
3. Listens to scroll events
4. Listens to window resize

### Container Detection
```typescript
const container = containerRef.current?.closest(
  '.overflow-auto, .overflow-y-auto'
) as HTMLElement;
```

### Full-Page Detection
```typescript
const isFullPage = location.pathname.includes('/messages/') 
                || location.pathname.includes('/tickets/');
```

## Performance

- ✅ Debounced scroll listeners (native browser behavior)
- ✅ Minimal re-renders (useState only on threshold changes)
- ✅ Automatic cleanup of event listeners
- ✅ Single 1-second delayed check for async content

## Accessibility

- Clear button titles ("Scroll to top", "Scroll to bottom")
- Smooth scroll behavior (respects prefers-reduced-motion)
- Visible focus states
- High contrast borders

## Browser Support

- ✅ All modern browsers
- ✅ Smooth scroll animation
- ✅ Backdrop blur effect
- ✅ Window/Element scroll APIs

## Files

- Component: `/FE-app/src/components/ScrollButtons.tsx`
- Used in: `MessageDetail.tsx`, `TicketDetail.tsx` (can be used anywhere)
