import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * What the phone detail scrolls in: the document, so the browser's own pull-to-refresh and
 * address-bar collapse work as on any page. A phone never shows the slide-over — every selection
 * there opens the full page (usePhoneOpensMessageAsPage) — so there is no other box.
 */
type Scroller = {
  target: Window;
  top: () => number;
  scrollTo: (top: number) => void;
  /** An element's top in the document's coordinates. */
  offsetOf: (el: Element) => number;
};

const scrollerFor = (): Scroller => ({
  target: window,
  top: () => window.scrollY,
  scrollTo: (top) => window.scrollTo({ top }),
  offsetOf: (el) => el.getBoundingClientRect().top + window.scrollY,
});

/**
 * v4 mobile scrolling. On a phone the detail does not scroll inside itself — the document does —
 * so nothing resets its offset for it:
 *
 * - **A new message starts at the top.** The detail is keyed by message id, so a mount IS a
 *   message change (J/K, a merge, Related "Open"); the scroller otherwise kept the previous
 *   thread's offset and the new one opened somewhere in its middle.
 * - **A tab opens at its top.** Switching tab kept the (clamped) offset of the view before, so the
 *   new panel began hidden under the sticky header and tab rows. When the panel's top would be
 *   under the stuck strip, scroll back just far enough that the strip sits at its sticky place
 *   with the panel starting beneath it; when it is already in view, leave the page alone.
 * - **Back to Thread returns to where the agent was reading.**
 *
 * `view` is 'thread' while the thread shows, else the open tab. Desktop (`enabled` false) and the
 * wide two-column page are untouched: there the thread and the panels are their own scrollers.
 */
export const usePhoneDetailScroll = (
  rootRef: RefObject<HTMLElement>,
  enabled: boolean,
  view: string
): void => {
  const threadTop = useRef<number | null>(null);
  // Read by the scroll listener: a scroll that happens once another tab shows (the browser
  // clamping the offset as the thread is hidden) is not the agent's place in the thread.
  const viewRef = useRef(view);
  viewRef.current = view;
  const lastView = useRef(view);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    scrollerFor().scrollTo(0);
    // Mount only: a mount is a message change (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    const scroller = scrollerFor();
    const record = () => {
      if (viewRef.current === 'thread') threadTop.current = scroller.top();
    };
    record();
    scroller.target.addEventListener('scroll', record, { passive: true });
    return () => scroller.target.removeEventListener('scroll', record);
  }, [enabled, rootRef]);

  useLayoutEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    const root = rootRef.current;
    if (!enabled || !root) return;
    const scroller = scrollerFor();
    if (view === 'thread') {
      if (threadTop.current !== null) scroller.scrollTo(threadTop.current);
      return;
    }
    const strip = root.querySelector<HTMLElement>('[data-panel-strip]');
    const content = root.querySelector<HTMLElement>('[data-panel-content]');
    if (!strip || !content) return;
    // Where the strip sticks (its resolved `top`) plus its own height: the panel's top belongs
    // right under that.
    const stickyTop = Number.parseFloat(getComputedStyle(strip).top) || 0;
    const target = Math.max(0, scroller.offsetOf(content) - strip.offsetHeight - stickyTop);
    if (scroller.top() > target) scroller.scrollTo(target);
  }, [view, enabled, rootRef]);
};
