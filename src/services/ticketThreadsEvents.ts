/**
 * Fired on `window` after a thread is added to or taken off a ticket, with the thread ids whose
 * tickets changed. The backend emits no socket event for these, and the thread header and its
 * Customer-tab panel are separate components — without this the header kept naming a ticket the
 * panel had just removed.
 *
 * Its own module (not `ticketThreads.service`), so a test that mocks the service does not also
 * have to re-declare the event.
 */
export const THREAD_TICKETS_CHANGED = 'odly:thread-tickets-changed';

export const announceThreadTicketsChanged = (conversationIds: number[]): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds } }));
};
