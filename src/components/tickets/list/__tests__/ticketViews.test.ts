import { describe, expect, it } from 'vitest';
import { defaultFilters } from '@/stores/ticketsStore';
import {
  BUILT_IN_TICKET_VIEWS,
  DEFAULT_VIEW_FILTERS,
  activeView,
  filtersOfView,
  viewFiltersOf,
} from '../ticketViews';

describe('built-in ticket views', () => {
  it('are the six views of the design, in order, Needs us first', () => {
    expect(BUILT_IN_TICKET_VIEWS.map((view) => view.name)).toEqual([
      'Needs us',
      'All',
      'Mine',
      'Unassigned',
      'Owes reply',
      'Urgent',
    ]);
  });

  it('open on Needs us', () => {
    expect(DEFAULT_VIEW_FILTERS).toEqual({ needs: 'yes' });
  });
});

describe('activeView', () => {
  const views = BUILT_IN_TICKET_VIEWS;

  it('lights Mine for exactly assignee = me', () => {
    expect(activeView({ ...defaultFilters, assigneeId: 'me' }, views)?.name).toBe('Mine');
  });

  it('lights All when nothing is filtered', () => {
    expect(activeView(defaultFilters, views)?.name).toBe('All');
  });

  it('lights nothing for a filter state no view matches', () => {
    expect(activeView({ ...defaultFilters, assigneeId: 'me', priority: 'high' }, views)).toBeNull();
  });

  it('lights nothing while searching — a search is not a view', () => {
    expect(activeView({ ...defaultFilters, needs: 'yes', search: 'visa' }, views)).toBeNull();
  });

  it('matches Urgent on both of its filters only', () => {
    expect(activeView({ ...defaultFilters, status: 'open', priority: 'critical' }, views)?.name).toBe(
      'Urgent'
    );
    expect(activeView({ ...defaultFilters, status: 'open' }, views)).toBeNull();
  });
});

describe('a view as stored', () => {
  it('keeps only the filters that are set', () => {
    expect(viewFiltersOf({ ...defaultFilters, owes: 'yes', labelId: '3' })).toEqual({
      owes: 'yes',
      labelId: '3',
    });
  });

  it('applies over the defaults and drops keys the list does not know', () => {
    expect(filtersOfView({ owes: 'yes', inboxOnlyKey: 'x' })).toEqual({ ...defaultFilters, owes: 'yes' });
  });
});
