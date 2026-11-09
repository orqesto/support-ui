import { useEffect, useRef } from 'react';

/**
 * Opens the reply box when an address ARRIVES — also onto a FOLDED draft. The box's own "a draft
 * arrived" effect fires only when the draft goes from empty to non-empty, so with a folded draft
 * "Reply to this message" changed the To of a box nobody could see, and the next Send went to the
 * new address (review of #819–#822, 2026-11-03). The reset to empty after a send opens nothing.
 */
export const useOpenOnNewAddress = (
  draft: { to: string; cc: string; bcc: string } | undefined,
  open: () => void
): void => {
  const addresses = [draft?.to, draft?.cc, draft?.bcc];
  const key = addresses.join('|');
  const lastKey = useRef(key);
  const openRef = useRef(open);
  openRef.current = open;
  const hasAddress = addresses.some((value) => value?.trim());
  useEffect(() => {
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (hasAddress) openRef.current();
  }, [key, hasAddress]);
};
