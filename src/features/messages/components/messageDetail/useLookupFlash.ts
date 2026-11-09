import { useEffect, useRef, useCallback } from 'react';
import type { Message } from '@/types';
import type { PanelTab } from '../messageDetailConstants';
import { LOOKUP_FLASH_CLASSES, LOOKUP_FLASH_MS, LOOKUP_SEEK_FRAMES } from './detailConstants';
import type { Setter } from './types';

/** The composer's "Look up": open the Lookups tab and flash the Connected systems block. */

export function useLookupFlash({
  message,
  tab,
  setTab,
  lookupAvailable,
  twoColumn,
  setPanelOpen,
}: {
  message: Message;
  tab: PanelTab;
  setTab: Setter<PanelTab>;
  lookupAvailable: boolean;
  twoColumn: boolean;
  setPanelOpen: Setter<boolean>;
}) {
  // An admin can remove the last lookup while an agent sits on its tab; fall back, never blank.
  useEffect(() => {
    if (tab === 'lookups' && !lookupAvailable) setTab('ai');
  }, [tab, lookupAvailable, setTab]);
  const lookupFlash = useRef<{
    frame: number | null;
    timer: ReturnType<typeof setTimeout> | null;
    flashed: HTMLElement | null;
  }>({ frame: null, timer: null, flashed: null });
  /*
    ⛔ Cancelling must also take the ring OFF. The lookup panel stays mounted across a thread
    switch and a second press, so a cancelled removal timer would leave the ring on for good.
  */
  const cancelLookupFlash = useCallback(() => {
    const pending = lookupFlash.current;
    if (pending.frame !== null) cancelAnimationFrame(pending.frame);
    if (pending.timer !== null) clearTimeout(pending.timer);
    pending.flashed?.classList.remove(...LOOKUP_FLASH_CLASSES);
    pending.frame = null;
    pending.timer = null;
    pending.flashed = null;
  }, []);
  useEffect(() => cancelLookupFlash, [cancelLookupFlash, message.id]);
  const handleLookUp = useCallback(() => {
    setTab('lookups');
    // The sidebar always shows its content; the slide-over's rail has to be opened.
    if (!twoColumn) setPanelOpen(true);
    cancelLookupFlash();
    /*
      The panel renders after this state commits, and its body can arrive a frame or two later, so
      look for the root over a few frames. `data-lookup-root` sits on CustomApiLookupPanel's root;
      when it is missing (lookup hidden, tab not mounted yet) nothing happens — the tab is open.
    */
    let attempts = 0;
    const seek = () => {
      lookupFlash.current.frame = null;
      const root = document.querySelector<HTMLElement>('[data-lookup-root]');
      if (!root) {
        attempts += 1;
        if (attempts < LOOKUP_SEEK_FRAMES) lookupFlash.current.frame = requestAnimationFrame(seek);
        return;
      }
      root.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      /*
        …and focus goes there too (the block is focusable, tabIndex -1, named "Connected
        systems"): a screen reader lands on what the press opened, and on a phone — where the
        Lookups tab hides the composer the press came from — focus does not fall to <body>.
        preventScroll: the smooth scroll above already brings it into view.
      */
      root.focus({ preventScroll: true });
      root.classList.add(...LOOKUP_FLASH_CLASSES);
      lookupFlash.current.flashed = root;
      lookupFlash.current.timer = setTimeout(() => {
        root.classList.remove(...LOOKUP_FLASH_CLASSES);
        lookupFlash.current.timer = null;
        lookupFlash.current.flashed = null;
      }, LOOKUP_FLASH_MS);
    };
    lookupFlash.current.frame = requestAnimationFrame(seek);
  }, [twoColumn, cancelLookupFlash, setPanelOpen, setTab]);
  return {
    handleLookUp,
  };
}
