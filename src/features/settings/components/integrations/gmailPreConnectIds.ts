/**
 * The ids of every source before leaving for Google on the redirect flow. Back from it, the new
 * source is already in the loaded list (it reads as "reconnected"), and in onboarding the card
 * mounts with no list at all — so newness is taken from this set. Per tab (sessionStorage).
 */
const PRE_CONNECT_IDS_KEY = 'odly.gmail.preConnectIds';

export const savePreConnectIds = (ids: number[]) => {
  try {
    sessionStorage.setItem(PRE_CONNECT_IDS_KEY, JSON.stringify(ids));
  } catch {
    // Blocked storage: the return falls back to the loaded list.
  }
};

/** Read once and cleared: the ids saved before the redirect, or null when none were. */
export const takePreConnectIds = (): number[] | null => {
  try {
    const raw = sessionStorage.getItem(PRE_CONNECT_IDS_KEY);
    sessionStorage.removeItem(PRE_CONNECT_IDS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => typeof id === 'number')
      : null;
  } catch {
    return null;
  }
};

/**
 * A source is new when its id was not among the ids saved before the redirect; with none saved
 * (the popup flow, or blocked storage) when it is not in the loaded list.
 */
export const isNewSource = (
  id: number,
  loaded: readonly { id: number }[],
  preConnectIds: readonly number[] | null
): boolean =>
  preConnectIds ? !preConnectIds.includes(id) : !loaded.some((source) => source.id === id);
