import type { ContactProfile } from '@/types/api';

type Facts = Pick<ContactProfile, 'createdAt' | 'stats'>;

/**
 * When this person became a customer: their EARLIEST conversation (`stats.firstMessageAt`).
 *
 * ⚠️ `contact.createdAt` is not that — the row is created the first time anyone opens the
 * contact, so it can read "3 minutes" for a customer of two years. It is used only when the
 * backend predates `firstMessageAt` (field ABSENT), which is what this screen showed before. A
 * backend that sends `null` is saying "no conversations you can see" — that stays unknown.
 */
export const customerSince = (contact: Facts): string | null => {
  const stats = contact.stats as Partial<Facts['stats']> | undefined;
  if (stats && 'firstMessageAt' in stats) return stats.firstMessageAt ?? null;
  return contact.createdAt ?? null;
};

/**
 * "14 conversations · 1 open" (v3). The open part only when the backend sends it — an older one
 * does not, and "0 open" would be a claim it never made.
 */
export const lifetimeLabel = (stats: Partial<Facts['stats']> | undefined): string | null => {
  if (typeof stats?.messageCount !== 'number') return null;
  const total = `${stats.messageCount} conversation${stats.messageCount === 1 ? '' : 's'}`;
  return typeof stats.openCount === 'number' ? `${total} · ${stats.openCount} open` : total;
};
