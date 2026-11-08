import { useEffect } from 'react';
import type { Message } from '@/types';

export const useDetailPanelBodyLock = (
  selectedMessage: Message | null,
  isPhone: boolean,
  split: boolean
) => {
  // Lock body scroll while the detail panel is open + notify Layout to hide header. Not in
  // split: there the detail is a pane beside the list and both scroll on their own.
  useEffect(() => {
    if (selectedMessage && !isPhone && !split) {
      document.body.style.overflow = 'hidden';
      window.dispatchEvent(new CustomEvent('detail-panel-change', { detail: { open: true } }));
    } else {
      document.body.style.overflow = '';
      window.dispatchEvent(new CustomEvent('detail-panel-change', { detail: { open: false } }));
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedMessage, isPhone, split]);
};
