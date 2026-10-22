import { describe, expect, it } from 'vitest';
import { defaultFilters } from '@/stores/ticketsStore';
import { filtersFromParams, filtersToParams, ticketApiFilters } from '../ticketFilters';

describe('ticketApiFilters', () => {
  it('sends "me" as the current user id', () => {
    expect(ticketApiFilters({ ...defaultFilters, assigneeId: 'me' }, 7)).toEqual({ assigneeId: '7' });
  });

  it('sends unassigned as assignee 0', () => {
    expect(ticketApiFilters({ ...defaultFilters, assigneeId: 'unassigned' }, 7)).toEqual({
      assigneeId: '0',
    });
  });

  it('drops "me" when nobody is signed in rather than sending a bogus id', () => {
    expect(ticketApiFilters({ ...defaultFilters, assigneeId: 'me' }, null)).toEqual({});
  });

  it('passes the v3 filters through by their API names', () => {
    expect(
      ticketApiFilters(
        { ...defaultFilters, needs: 'yes', owes: 'none', threads: '2-5', updated: '24h' },
        7
      )
    ).toEqual({ needs: 'yes', owes: 'none', threads: '2-5', updated: '24h' });
  });

  it('leaves out every "all" value', () => {
    expect(ticketApiFilters(defaultFilters, 7)).toEqual({});
  });

  it('keeps the existing mappings: status, label, jira link, trimmed search', () => {
    expect(
      ticketApiFilters(
        { ...defaultFilters, status: 'open', labelId: '4', linked: 'not_synced', search: '  visa ' },
        7
      )
    ).toEqual({ status: 'open', labelId: '4', syncedToJira: 'false', search: 'visa' });
  });
});

describe('filters in the URL', () => {
  it('round-trips the v3 filters and the sort', () => {
    const params = new URLSearchParams();
    filtersToParams(
      { ...defaultFilters, needs: 'yes', owes: 'yes', threads: '6+', updated: '7d', assigneeId: 'me' },
      { sortBy: 'owed', sortOrder: 'desc' },
      params
    );
    expect(params.get('needs')).toBe('yes');
    expect(params.get('sort')).toBe('owed');
    const back = filtersFromParams(params);
    expect(back.filters).toMatchObject({
      needs: 'yes',
      owes: 'yes',
      threads: '6+',
      updated: '7d',
      assigneeId: 'me',
    });
    expect(back.sorting).toEqual({ sortBy: 'owed', sortOrder: 'desc' });
  });

  it('ignores values it does not know', () => {
    const back = filtersFromParams(new URLSearchParams('owes=maybe&threads=99&sort=nonsense&status=lost'));
    expect(back.filters).toEqual({});
    expect(back.sorting).toBeNull();
  });
});
