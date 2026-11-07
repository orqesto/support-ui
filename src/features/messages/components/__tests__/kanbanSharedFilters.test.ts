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

/**
 * `'me'` is SYMBOLIC and must never be sent as an id — `assigneeApiParams` says so at the
 * top of its own file, and the list view obeys it. The board had its own private mapping
 * that handled `'unassigned'` and passed everything else through, so the built-in "Mine"
 * saved view asked the API for the user whose id is the string "me".
 *
 * What that did: `parseInt('me')` is NaN, which is neither `undefined` nor `0`, so the
 * predicate became `assignee_id = NaN`. Since BE #754 an unusable id fails closed instead,
 * which removes the error and leaves an EMPTY BOARD — a filter that silently answers
 * "nothing is yours". Either way the board's Mine filter has never worked.
 */
describe('the board and the symbolic assignee values', () => {
  it('sends "Mine" as the boolean the API resolves against the caller', () => {
    const api = buildSharedFilters({ ...defaultFilters, assigneeId: 'me' });
    expect(api.assignedToMe).toBe('true');
    // The point of the fix: no id at all. `assigneeId=me` is what reached the column.
    expect(api.assigneeId).toBeUndefined();
  });

  it('CONTROL: "Unassigned" still goes as 0, which the API special-cases to IS NULL', () => {
    const api = buildSharedFilters({ ...defaultFilters, assigneeId: 'unassigned' });
    expect(api.assigneeId).toBe('0');
    expect(api.assignedToMe).toBeUndefined();
  });

  it('CONTROL: a real user id is already an id and passes through', () => {
    const api = buildSharedFilters({ ...defaultFilters, assigneeId: '7' });
    expect(api.assigneeId).toBe('7');
    expect(api.assignedToMe).toBeUndefined();
  });

  it('CONTROL: "all" sends neither', () => {
    const api = buildSharedFilters({ ...defaultFilters, assigneeId: 'all' });
    expect(api.assigneeId).toBeUndefined();
    expect(api.assignedToMe).toBeUndefined();
  });
});
