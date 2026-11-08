/**
 * The rule that decides whether a search carries the work-queue lens.
 *
 * It exists because sending that lens made the backend's own "a search is not a browse"
 * bypass unreachable: `view` is handled in an earlier branch than the bypass, so a search
 * for a real customer came back as "No messages found" with the thread sitting one banner
 * click away.
 */
import { describe, it, expect } from 'vitest';
import { searchIsTheOnlyFilter } from '../searchIsTheOnlyFilter';

const base = { lifecycleOrQueueActive: false, threadStatus: 'all' };

describe('searchIsTheOnlyFilter', () => {
  it('is true when the agent only typed something', () => {
    expect(searchIsTheOnlyFilter({ ...base, search: 'mark@hotmail.com' })).toBe(true);
  });

  it('is false with no search — a plain browse keeps its lens', () => {
    // CONTROL. Without it, "drop the lens" would pass on an implementation that dropped it
    // always, which would turn the inbox into the whole archive.
    expect(searchIsTheOnlyFilter({ ...base, search: '' })).toBe(false);
    expect(searchIsTheOnlyFilter({ ...base, search: null })).toBe(false);
    expect(searchIsTheOnlyFilter({ ...base, search: undefined })).toBe(false);
  });

  it('treats whitespace as no search', () => {
    // The backend trims before deciding too; disagreeing here would send a lens-free query
    // that the backend then narrows anyway, which is the confusing half of a mismatch.
    expect(searchIsTheOnlyFilter({ ...base, search: '   ' })).toBe(false);
  });

  it('is false once the agent picks a status', () => {
    // Searching inside "Resolved" must keep meaning that.
    expect(searchIsTheOnlyFilter({ ...base, search: 'mark', threadStatus: 'closed' })).toBe(false);
  });

  it('is false when a lifecycle, queue or quick-filter column is driving the list', () => {
    expect(
      searchIsTheOnlyFilter({ search: 'mark', threadStatus: 'all', lifecycleOrQueueActive: true })
    ).toBe(false);
  });

  it('defaults a missing threadStatus to untouched', () => {
    // The store can hand back undefined before the first interaction, and that is not a
    // deliberate narrowing.
    expect(searchIsTheOnlyFilter({ search: 'mark', lifecycleOrQueueActive: false })).toBe(true);
  });
});
