import { describe, it, expect } from 'vitest';
import { getStatusBadge } from '../inboxCardHelpers';

/**
 * List cards read `getStatusBadge`; the detail header reads the same `closedStatusMeta`. A closed
 * thread must say the same thing in both — never "Resolved" on the card it was opened from.
 */
const base = { parkedAt: null, lastReplyFromClient: null };

describe('getStatusBadge for a closed thread', () => {
  it('says "Not customer work" for a binned thread, in the muted colour', () => {
    const badge = getStatusBadge({
      ...base,
      status: 'closed',
      metadata: { notCustomerWork: { by: 13, at: '2026-09-28T10:00:00Z', reason: null } },
    } as never);
    expect(badge?.label).toBe('Not customer work');
    expect(badge?.className).not.toContain('success');
  });

  it('says "Closed" for a thread closed any other way', () => {
    expect(getStatusBadge({ ...base, status: 'closed' } as never)?.label).toBe('Closed');
  });

  it('still says Resolved for a resolved thread (control)', () => {
    expect(getStatusBadge({ ...base, status: 'resolved' } as never)?.label).toBe('Resolved');
  });
});
