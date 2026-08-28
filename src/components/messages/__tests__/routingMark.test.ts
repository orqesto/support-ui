/**
 * `needs_routing` is a MARK on an ordinary thread, not a lane the thread lives in instead.
 *
 * Every needs_routing row in production already has a department, so the status never meant
 * "unrouted" — it means the router wants a human to confirm. While it was treated as a Queue
 * value the thread vanished from the board and lived only in a queue nobody had open, which is
 * how a client came to search for mail that was sitting right there and conclude it had never
 * arrived.
 *
 * These also pin the MIRROR. `deriveWorkflowStatus` here and `deriveWorkflowStatus` /
 * `workflowStatusCondition` in the backend are three expressions of one rule, and the only thing
 * keeping them equal is that they are checked. When they drifted before, the row badge and the
 * board disagreed and every clickable count lied.
 */
import { describe, expect, it } from 'vitest';
import {
  deriveWorkflowStatus,
  getRoutingBadge,
  getStatusBadge,
} from '@/components/messages/inboxCardHelpers';

const BASE = { parkedAt: null, lastReplyFromClient: null } as const;

describe('needs_routing is a mark, not a lane', () => {
  it('gives a needs_routing thread a real work status', () => {
    // Previously null — the thread had no work status and so appeared on no board.
    expect(deriveWorkflowStatus({ ...BASE, status: 'needs_routing' })).toBe('open');
  });

  it('derives that status from the reply signal, exactly as any other thread', () => {
    expect(deriveWorkflowStatus({ ...BASE, status: 'needs_routing', lastReplyFromClient: false }))
      .toBe('pending');
    expect(deriveWorkflowStatus({ ...BASE, status: 'needs_routing', lastReplyFromClient: true }))
      .toBe('in_progress');
    expect(deriveWorkflowStatus({ ...BASE, status: 'needs_routing', parkedAt: '2026-08-28' }))
      .toBe('on_hold');
  });

  it('carries the routing mark alongside the work status, not instead of it', () => {
    const thread = { ...BASE, status: 'needs_routing' as const };
    expect(getStatusBadge(thread)).not.toBeNull();
    expect(getRoutingBadge(thread)?.label).toBe('Needs Routing');
  });

  it('marks nothing else', () => {
    for (const status of ['open', 'new', 'filtered', 'resolved', 'client_replied'] as const) {
      expect(getRoutingBadge({ status })).toBeNull();
    }
  });

  it('keeps filtered on the Queue axis — only needs_routing moved', () => {
    // `filtered` genuinely is a lane: those threads live in Spam / Not Analysed / Archived.
    expect(deriveWorkflowStatus({ ...BASE, status: 'filtered' })).toBeNull();
    expect(deriveWorkflowStatus({ ...BASE, status: 'resolved' })).toBe('resolved');
  });
});
