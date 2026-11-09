import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { Message, MessageEvent } from '@/types';

/** Keeps a newly opened thread on its newest message until the reader takes over. */

export function useThreadScrollPin(
  message: Message,
  isPhone: boolean,
  sortedThread: MessageEvent[]
) {
  /*
    Opening a thread lands on its LAST message (owner, 2026-11-03): the thread is sorted oldest
    first, so it opened at the top and the newest message — the one to answer — sat below the fold.
    It stays pinned to the bottom while the thread settles (images and quoted blocks growing after
    the first paint), until the reader's own scroll, press or key takes over.
  */
  const threadScrollerRef = useRef<HTMLDivElement>(null);
  const threadContentRef = useRef<HTMLDivElement>(null);
  const pinToNewestRef = useRef(true);
  const markScrollIntent = useCallback(() => {
    pinToNewestRef.current = false;
  }, []);

  // A newly opened thread pins to its newest message again; the pin's clock starts when its
  // messages first arrive (a slow load must not use it up).
  const pinUntilRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    pinToNewestRef.current = true;
    pinUntilRef.current = null;
  }, [message.id]);
  const isPhoneRef = useRef(isPhone);
  isPhoneRef.current = isPhone;
  const scrollToNewestIfPinned = useCallback(() => {
    const scroller = threadScrollerRef.current;
    if (!scroller || !pinToNewestRef.current) return;
    if (pinUntilRef.current !== null && Date.now() > pinUntilRef.current) {
      // Released for good after a few settled seconds even without input, so a thread whose
      // content keeps growing never fights a reader who is just looking.
      pinToNewestRef.current = false;
      return;
    }
    // A phone scrolls the DOCUMENT, not the thread box (usePhoneDetailScroll), so the newest
    // message is the bottom of the page there (owner, 2026-11-03: phones open at the newest too).
    if (isPhoneRef.current) window.scrollTo({ top: document.documentElement.scrollHeight });
    else scroller.scrollTop = scroller.scrollHeight;
  }, []);
  // The thread's messages arrived or changed while pinned: land on the newest.
  useLayoutEffect(() => {
    if (sortedThread.length === 0) return;
    pinUntilRef.current ??= Date.now() + 4000;
    scrollToNewestIfPinned();
  }, [message.id, sortedThread, scrollToNewestIfPinned]);
  // Content growing after the first paint (images, quoted history) keeps the newest in view while
  // pinned.
  useEffect(() => {
    const content = threadContentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => scrollToNewestIfPinned());
    observer.observe(content);
    // The box itself shrinking (the reply box opening under it) hides the last lines too.
    if (threadScrollerRef.current) observer.observe(threadScrollerRef.current);
    return () => observer.disconnect();
  }, [message.id, scrollToNewestIfPinned]);
  return {
    threadScrollerRef,
    threadContentRef,
    markScrollIntent,
  };
}
