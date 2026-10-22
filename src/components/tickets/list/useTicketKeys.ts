import { useEffect, useRef } from 'react';

type Handlers = {
  /** A ticket is open (in the sheet or the split pane). */
  open: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  /** `/` with no ticket open — focus the search. */
  onSlash: () => void;
};

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
      null);

/**
 * The tickets list's keyboard: J / K step through the CURRENT (filtered, sorted) list while a
 * ticket is open, Escape closes it, `/` jumps to search. Never while typing — a J in a comment is
 * a letter — and never with a modifier held.
 */
export const useTicketKeys = (handlers: Handlers) => {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (isTyping(event.target)) return;
      const { open, onNext, onPrev, onClose, onSlash } = latest.current;
      if (event.key === '/' && !open) {
        event.preventDefault();
        onSlash();
      } else if (open && (event.key === 'j' || event.key === 'J')) {
        onNext();
      } else if (open && (event.key === 'k' || event.key === 'K')) {
        onPrev();
      } else if (open && event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
};
