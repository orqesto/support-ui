/**
 * "Mine" returned nothing. `assigneeId: 'me'` was passed to the API verbatim, where
 * `parseInt('me')` is NaN — not undefined, not 0 — so the query became
 * `assignee_id = NaN` and matched no row. No error anywhere: an empty inbox is a
 * perfectly ordinary result.
 */
import { describe, it, expect } from 'vitest';
import { assigneeApiParams } from '../assigneeApiParams';

describe('assigneeApiParams', () => {
  it('sends "me" as a boolean, never as an id', () => {
    expect(assigneeApiParams('me')).toEqual({ assignedToMe: 'true' });
  });

  it('never lets "me" reach assigneeId — parseInt would make it NaN', () => {
    expect(assigneeApiParams('me').assigneeId).toBeUndefined();
  });

  it('sends "unassigned" as 0, which the API reads as IS NULL', () => {
    expect(assigneeApiParams('unassigned')).toEqual({ assigneeId: '0' });
  });

  it('passes a real user id straight through', () => {
    expect(assigneeApiParams('7')).toEqual({ assigneeId: '7' });
  });

  it('sends nothing at all when the filter is off', () => {
    expect(assigneeApiParams('all')).toEqual({});
    expect(assigneeApiParams(undefined)).toEqual({});
    expect(assigneeApiParams('')).toEqual({});
  });

  it('never emits both keys — they would fight in the WHERE clause', () => {
    for (const value of ['me', 'unassigned', '7', 'all', undefined]) {
      const params = assigneeApiParams(value);
      expect(Object.keys(params).length).toBeLessThanOrEqual(1);
    }
  });
});
