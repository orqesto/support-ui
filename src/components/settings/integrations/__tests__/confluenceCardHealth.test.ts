/**
 * 2026-09-17: a Confluence source with a partial token showed a GREEN dot — the dot meant
 * "enabled", not "working" — and a sync with nothing selected read "Synced 0 pages" in green.
 */
import { describe, expect, it } from 'vitest';
import { syncDot, syncMeta } from '../confluenceCardHelpers';

describe('syncDot — health, not enabled', () => {
  it('THE BUG: an enabled source whose sync failed is red, not green', () => {
    expect(syncDot({ enabled: true, lastSyncStatus: 'failed' })).toEqual({ cls: 'bg-red-500', label: 'Sync failed' });
  });

  it('green only after a successful sync', () => {
    expect(syncDot({ enabled: true, lastSyncStatus: 'success' }).cls).toBe('bg-green-500');
    expect(syncDot({ enabled: true, lastSyncStatus: null }).cls).toBe('bg-amber-400');
    expect(syncDot({ enabled: true, lastSyncStatus: 'syncing' }).cls).toBe('bg-blue-500');
  });

  it('a paused source is grey whatever its last sync said', () => {
    expect(syncDot({ enabled: false, lastSyncStatus: 'failed' }).cls).toBe('bg-gray-400');
  });
});

describe('syncMeta — nothing selected', () => {
  const synced = { lastSyncStatus: 'success' as const, lastSyncedAt: null, lastSyncedPageCount: 0, lastSyncError: null };

  it('a successful sync with nothing selected says so, instead of "Synced 0 pages" in green', () => {
    expect(syncMeta(synced, 0).text).toMatch(/nothing selected yet/i);
    expect(syncMeta(synced, 0).cls).toBe('text-amber-600');
  });

  it('CONTROL: with a selection, zero pages is still reported as a sync', () => {
    expect(syncMeta(synced, 2).text).toBe('Synced 0 pages');
  });

  it('pages processed one by one (no config selection) still read as synced', () => {
    expect(syncMeta({ ...synced, lastSyncedPageCount: 3 }, 0).text).toBe('Synced 3 pages');
  });
});
