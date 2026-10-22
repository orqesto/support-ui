/**
 * Bookmarking a recent search as a view must never overwrite an unrelated view of that name —
 * saving replaces by name.
 */
import { describe, expect, it } from 'vitest';
import { nameForSearchView, type SavedView } from '../savedViews';

const view = (name: string, filters: SavedView['filters']): SavedView => ({ name, filters });

describe('nameForSearchView', () => {
  it('uses the search text when no view has that name', () => {
    expect(nameForSearchView('urgent', [])).toBe('urgent');
  });

  it('never takes the name of an unrelated view', () => {
    const views = [view('urgent', { priority: 'high', assigneeId: 'me' })];
    expect(nameForSearchView('urgent', views)).toBe('Search: urgent');
  });

  it('numbers past every taken name', () => {
    const views = [
      view('urgent', { priority: 'high' }),
      view('Search: urgent', { priority: 'low' }),
      view('Search: urgent (2)', { priority: 'medium' }),
    ];
    expect(nameForSearchView('urgent', views)).toBe('Search: urgent (3)');
  });

  it('reuses the search’s own view — saving it again changes nothing', () => {
    const views = [view('urgent', { search: 'urgent' })];
    expect(nameForSearchView('urgent', views)).toBe('urgent');
  });
});
