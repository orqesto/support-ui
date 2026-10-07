/**
 * Every plan limit an admin can set — on a plan (console plan editor) or for ONE workspace (the
 * workspace's limit overrides). Mirrors the backend's `LIMIT_KEYS` (limitService.ts); the backend
 * rejects an unknown key, and a key missing here could never be set from the console, which is how
 * AI calls, storage, departments and the auto-reply allotment were unreachable until 2026-10-07.
 */
export const LIMIT_FIELDS = [
  { key: 'maxUsers', label: 'Users', hint: 'Seats in the workspace' },
  { key: 'maxIntegrations', label: 'Channels', hint: 'Enabled mailboxes and channels; paused ones do not count' },
  { key: 'maxMessagesPerMonth', label: 'Messages / period', hint: 'Analysed per billing period; message packs add to it' },
  { key: 'maxAutoRepliesPerMonth', label: 'Auto-replies / period', hint: 'Over the allotment a reply becomes a suggestion' },
  { key: 'maxAICallsPerMonth', label: 'AI calls / period', hint: 'On the platform AI key only — a workspace on its own key is not capped by this' },
  { key: 'maxDepartments', label: 'Active departments', hint: 'Departments switched on at once' },
  { key: 'maxStorageMb', label: 'Storage (MB)', hint: 'Files people upload; not inbound mail, not a workspace\'s own bucket' },
  { key: 'maxStoredMessages', label: 'Stored messages', hint: 'All messages kept, not per period' },
  { key: 'maxKbItems', label: 'Knowledge base items', hint: 'All knowledge base entries kept' },
  { key: 'maxHistoryDays', label: 'History import (days)', hint: 'How far back a mailbox import reaches' },
  { key: 'maxHistoryMessages', label: 'History import (messages)', hint: 'Messages a mailbox import brings in' },
  { key: 'maxOrganizations', label: 'Workspaces per owner', hint: 'Workspaces one owner can create' },
] as const;

export type LimitKey = (typeof LIMIT_FIELDS)[number]['key'];

/** The backend's "no limit" convention. */
export const UNLIMITED = 999999;

export const formatLimit = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  return value >= UNLIMITED ? 'Unlimited' : value.toLocaleString();
};

export type LimitDraft = Partial<Record<LimitKey, string>>;

export const draftFromLimits = (limits: Partial<Record<string, number>>): LimitDraft =>
  Object.fromEntries(
    LIMIT_FIELDS.map(({ key }) => [key, limits[key] === undefined ? '' : String(limits[key])])
  ) as LimitDraft;

/**
 * Parse a limits draft: blank fields are left out (on a plan update the backend keeps the stored
 * value; on a new plan the limit is unlimited), anything else must be a whole number ≥ 0.
 */
export const parseLimitDraft = (
  draft: LimitDraft
): { ok: true; limits: Partial<Record<LimitKey, number>> } | { ok: false; invalid: LimitKey[] } => {
  const limits: Partial<Record<LimitKey, number>> = {};
  const invalid: LimitKey[] = [];
  for (const { key } of LIMIT_FIELDS) {
    const raw = (draft[key] ?? '').trim();
    if (raw === '') continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) invalid.push(key);
    else limits[key] = value;
  }
  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, limits };
};
