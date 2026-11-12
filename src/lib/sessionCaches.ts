/*
  In-memory caches of what a person has seen (seededState, attachmentThumbnails) register here, and
  sign-out or a workspace switch (authStore, in the main chunk) clears them all — without the main
  chunk loading the caches themselves, or the caches depending on the auth store.
*/
const clearers = new Set<() => void>();

/** A cache to clear when the person or the workspace changes. */
export const clearOnSessionChange = (clear: () => void): void => {
  clearers.add(clear);
};

export const clearSessionCaches = (): void => {
  clearers.forEach((clear) => clear());
};
