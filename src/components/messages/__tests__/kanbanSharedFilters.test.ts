/**
 * The board must send the "Needs routing" department filter, not swallow it.
 *
 * The department picker offers `needs_routing` as a sentinel. The list turns it into
 * `view=needs_routing`; the board used to drop it entirely and trust "the column's
 * fixedFilters" — which say nothing about routing — so the chip read "Needs routing" while
 * every column kept showing the whole department set. A filter that visibly does nothing is
 * how an agent concludes there is nothing to route.
 *
 * ⛔ A count-of-keys assertion would pass either way here (one key in, one key out). These pin
 * the KEY the sentinel becomes and that no department id leaks beside it.
 */
import { describe, expect, it } from 'vitest';
import { buildSharedFilters } from '../kanbanSharedFilters';
import { defaultFilters } from '@/stores/messagesStore';

describe('the board and the Needs routing sentinel', () => {
  it('turns the sentinel into the additive needs_routing queue', () => {
    const api = buildSharedFilters({ ...defaultFilters, departmentId: 'needs_routing' });
    expect(api.queue).toBe('needs_routing');
    // It is a mark, not a department — sending it as one would be a FALSE scope (no such
    // dept id in the user's set) and the whole board would come back empty.
    expect(api.departmentId).toBeUndefined();
  });

  it('still sends a real department as a department', () => {
    const api = buildSharedFilters({ ...defaultFilters, departmentId: '7' });
    expect(api.departmentId).toBe('7');
    expect(api.queue).toBeUndefined();
  });

  it('sends neither for "all" — the control', () => {
    const api = buildSharedFilters({ ...defaultFilters, departmentId: 'all' });
    expect(api.departmentId).toBeUndefined();
    expect(api.queue).toBeUndefined();
  });
});
