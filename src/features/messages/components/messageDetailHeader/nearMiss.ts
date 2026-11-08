// "Also matched" dismissals: per thread, for the page's lifetime. Deliberately not persisted —
// the suggestion is a routing hint, and a new session is a fair time to show it again.
const dismissedNearMiss = new Set<number>();
export const dismissNearMiss = (messageId: number) => dismissedNearMiss.add(messageId);
export const isNearMissDismissed = (messageId: number) => dismissedNearMiss.has(messageId);

/**
 * The hint's sentence, naming the departments routing also scored (v3). A department this user's
 * list does not carry is not named — it is counted in the generic wording instead.
 */
export const nearMissSentence = (names: (string | undefined)[]): string => {
  const known = names.filter((name): name is string => Boolean(name));
  if (known.length === 0) {
    return `Routing also scored this for ${names.length === 1 ? 'another team' : 'other teams'}.`;
  }
  // A department missing from this user's list is still COUNTED, so the sentence never claims
  // fewer departments than the buttons' source did.
  const unknown = names.length - known.length;
  const parts =
    unknown > 0 ? [...known, unknown === 1 ? 'another team' : `${unknown} other teams`] : known;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
  return `Routing also scored this for ${list}.`;
};
