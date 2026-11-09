import type { SyntheticEvent } from 'react';

/**
 * True when a React event reached this element from a portal: React bubbles portal events
 * through the component tree, but their DOM target is in the portal, outside the element. A card
 * or row that opens its thread on click / Enter ignores those, so a press inside a dialog or a
 * picker it renders (the thread-presence confirm, the assignee picker) never opens the thread —
 * without stopping the event, which document listeners (a dialog's Escape and focus trap, page
 * shortcuts, click-outside) still need.
 */
export const isFromPortal = (event: SyntheticEvent): boolean =>
  !(event.currentTarget as Node).contains(event.target as Node);
