import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/**
 * Below the `sm` breakpoint the message detail is a PAGE (`/messages/:id`), not the slide-in
 * panel.
 *
 * The panel is `position: fixed` over the list and locks `body` scroll while it is open. That
 * is fine on a desktop, and on a phone it kills the one gesture people use to refresh: the
 * browser only offers pull-to-refresh when the DOCUMENT is the thing scrolling, and with the
 * body locked and the panel scrolling inside its own box it never is. The full-page route
 * already exists (the ⤢ button in the panel header), scrolls the document, has a Back
 * button, and survives a reload — so on a phone every path that selects a message lands
 * there instead.
 *
 * 🔑 ONE chokepoint. Six call sites set `selectedMessage` (list click, kanban card, reopen,
 * approve/reject follow-ups, the `?id=` deep link in `useMessagesUrlSync`). Redirecting on
 * the STATE rather than at each site means a seventh site cannot forget.
 *
 * ⛔ `clearSelection` must drop the `?id=` param with `replace`, not push: otherwise Back from
 * the page lands on `/messages?id=…`, which re-selects the message, which redirects again.
 */
export const PHONE_QUERY = '(max-width: 639px)';

export const usePhoneOpensMessageAsPage = (
  selectedMessage: { id: number } | null,
  clearSelection: () => void
): boolean => {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const navigate = useNavigate();
  // The callback closes over page state and changes identity every render; the effect must
  // key on the SELECTION, not on the callback.
  const clearRef = useRef(clearSelection);
  clearRef.current = clearSelection;
  // `navigate` gets a new identity after every navigation — including the one this effect
  // just made — so without this the effect would fire twice for one selection. Keyed on the
  // message id, not on the object: the same thread re-fetched is still the same redirect.
  const redirectedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!isPhone || !selectedMessage) {
      redirectedFor.current = null;
      return;
    }
    if (redirectedFor.current === selectedMessage.id) return;
    redirectedFor.current = selectedMessage.id;
    clearRef.current();
    navigate(`/messages/${selectedMessage.id}`);
  }, [isPhone, selectedMessage, navigate]);

  return isPhone;
};
