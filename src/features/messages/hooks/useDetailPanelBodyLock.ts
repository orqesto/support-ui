import { useEffect } from 'react';
import type { Message } from '@/types';

export const useDetailPanelBodyLock = (
  selectedMessage: Message | null,
  isPhone: boolean,
  split: boolean
) => {
  // Lock body scroll while the detail panel is open. Not in split: there the detail is a pane
  // beside the list and both scroll on their own. Keyed on WHETHER a thread is open, not on its
  // record: a re-read of the open thread is a new object and used to unlock and relock the body.
  // (It also announced 'detail-panel-change' to the Layout, which no longer listens.)
  const open = selectedMessage !== null;
  useEffect(() => {
    document.body.style.overflow = open && !isPhone && !split ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, isPhone, split]);
};
