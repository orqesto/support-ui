import { describe, it, expect } from 'vitest';
import { slaPerformancePath } from '@/lib/slaPerformancePath';

/**
 * Moved from the old /sla page's drill-down test (2026-11-10): the Dashboard's "Avg Response
 * Time" tile must open SLA figures for the SAME window as its number, and a window the
 * Statistics picker has no button for falls back instead of stranding the picker.
 */
describe('slaPerformancePath', () => {
  it('keeps a window the picker can show', () => {
    expect(slaPerformancePath('?days=7', 30)).toBe('/statistics?days=7#performance');
    expect(slaPerformancePath('?from=2026-08-03&to=2026-08-09', 30)).toBe(
      '/statistics?from=2026-08-03&to=2026-08-09#performance'
    );
  });

  it('falls back to the default for a day count with no preset (the tile can send 1)', () => {
    expect(slaPerformancePath('?days=1', 30)).toBe('/statistics?days=30#performance');
  });

  it('ignores junk and a missing window', () => {
    expect(slaPerformancePath('?days=all', 30)).toBe('/statistics?days=30#performance');
    expect(slaPerformancePath('', 30)).toBe('/statistics?days=30#performance');
  });
});
