import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * The ticket shown NOW, for work that finishes after a render (adapt, send): a run started on
 * ticket A checks `ref.current !== startedOn` and stops once it is not A any more. NaN once the
 * component is gone — a run in flight is then on no ticket shown. (It used to rely on one more
 * render with the next ticket's id, which a list drawn from its last read no longer gives.)
 */
export const useShownTicketRef = (ticketId: number): MutableRefObject<number> => {
  const ref = useRef(ticketId);
  ref.current = ticketId;
  useEffect(() => {
    ref.current = ticketId;
    return () => {
      ref.current = Number.NaN;
    };
  }, [ticketId]);
  return ref;
};
