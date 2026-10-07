/**
 * Which workspace THIS browser tab works in.
 *
 * The selection used to be persisted inside `auth-storage` (localStorage) — one slot shared by
 * every tab — so two tabs on two workspaces collapsed onto whichever tab wrote last the moment
 * either reloaded. It now lives in sessionStorage, which is per tab and survives a reload of that
 * tab. A "last chosen" copy in localStorage only seeds a tab that has none yet (a brand-new tab),
 * so it still opens where the user last worked.
 *
 * The backend scopes every request by the `X-Organization-Context` header, which carries this
 * value, so two tabs in two workspaces need no shared server state. `GET /api/users/me` answers
 * for the header's workspace too (role, departments), not the one the session token was minted for.
 */
export const TAB_WORKSPACE_KEY = 'workspace-tab';
export const LAST_WORKSPACE_KEY = 'workspace-last';
const LEGACY_AUTH_STORAGE_KEY = 'auth-storage';

const parseId = (raw: unknown): number | null => {
  const id = typeof raw === 'string' ? Number(raw) : raw;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
};

// Storage can throw (blocked site data, private mode quirks) — never let that break sign-in.
const read = (storage: () => Storage, key: string): string | null => {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
};

const write = (storage: () => Storage, key: string, value: string | null): void => {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Selection then lasts until reload only — still correct for this tab.
  }
};

const session = () => window.sessionStorage;
const local = () => window.localStorage;

/** The value `auth-storage` carried before the selection moved per tab. */
const readLegacySelection = (): number | null => {
  const raw = read(local, LEGACY_AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return parseId(
      (JSON.parse(raw) as { state?: { selectedOrganizationId?: unknown } })?.state
        ?.selectedOrganizationId
    );
  } catch {
    return null;
  }
};

/** This tab's workspace; for a new tab, the last one chosen in any tab. */
export const readTabWorkspace = (): number | null =>
  parseId(read(session, TAB_WORKSPACE_KEY)) ??
  parseId(read(local, LAST_WORKSPACE_KEY)) ??
  readLegacySelection();

/** Remember `id` for this tab and as the seed for the next new tab; `null` forgets both. */
export const writeTabWorkspace = (id: number | null): void => {
  const value = id === null ? null : String(id);
  write(session, TAB_WORKSPACE_KEY, value);
  write(local, LAST_WORKSPACE_KEY, value);
};

/**
 * Claim an adopted workspace for this tab only. A tab that inherited the last-chosen (or legacy)
 * value holds nothing of its own until the user switches, so another tab's later pick would move
 * it on its next reload — the very bug this module exists to stop. The last-chosen seed is left
 * alone: adopting a workspace is not choosing one.
 */
export const pinTabWorkspace = (id: number | null): void => {
  if (id !== null) write(session, TAB_WORKSPACE_KEY, String(id));
};
