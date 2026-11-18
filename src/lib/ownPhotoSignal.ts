/**
 * "My profile photo changed" — so lists that show the person (tickets, threads, users) drop their
 * cached pages and the next view carries the new photo key (review 8b, F5). A tiny signal in lib,
 * so the settings feature never imports those features (the boundary ratchet).
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe; returns the unsubscribe. */
export const onOwnPhotoChanged = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The person's own photo was uploaded or removed. */
export const ownPhotoChanged = (): void => {
  for (const listener of [...listeners]) listener();
};
