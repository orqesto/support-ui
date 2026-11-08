/**
 * Moving saved views off this browser and onto the account.
 *
 * The rules with a wrong answer available are all in the carry-across: whose copy wins
 * when both have a "VIP", and when it is safe to clear the only copy that exists. Getting
 * either backwards loses someone's views silently — they simply have fewer pills than
 * they did yesterday, with nothing to say why.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const service = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
}));
vi.mock('@/services/savedView.service', () => ({ savedViewService: service }));

const { loadSavedViews, readLocalSavedViews } = await import('../savedViews');

const KEY = 'odly-inbox-saved-views';
const row = (id: number, name: string, filters = {}) => ({
  id,
  name,
  filters,
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
});

beforeEach(() => {
  localStorage.clear();
  service.list.mockReset();
  service.save.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('loading', () => {
  it('reads the account’s views when the endpoint answers', async () => {
    service.list.mockResolvedValue([row(1, 'VIP', { priority: 'critical' })]);
    const loaded = await loadSavedViews();
    expect(loaded.source).toBe('remote');
    expect(loaded.views).toEqual([{ id: 1, name: 'VIP', filters: { priority: 'critical' } }]);
  });

  it('falls back to this browser’s copy when there is no endpoint yet', async () => {
    // The frontend ships from main and is live before the API is. A missing route must
    // mean "keep working locally", not "you have no saved views".
    service.list.mockRejectedValue(new Error('404'));
    localStorage.setItem(KEY, JSON.stringify([{ name: 'Local', filters: { priority: 'high' } }]));
    const loaded = await loadSavedViews();
    expect(loaded.source).toBe('local');
    expect(loaded.views.map((view) => view.name)).toEqual(['Local']);
  });
});

describe('carrying this browser’s views across', () => {
  it('uploads what the account does not have, then clears the local copy', async () => {
    service.list.mockResolvedValue([]);
    service.save.mockImplementation((name: string, filters: object) =>
      Promise.resolve(row(7, name, filters))
    );
    localStorage.setItem(KEY, JSON.stringify([{ name: 'Local', filters: { priority: 'high' } }]));

    const loaded = await loadSavedViews();

    expect(service.save).toHaveBeenCalledWith('Local', { priority: 'high' });
    expect(loaded.views.map((view) => view.name)).toEqual(['Local']);
    // Cleared only now — before the upload was accepted, this was the only copy.
    expect(readLocalSavedViews()).toEqual([]);
  });

  it('keeps the account’s view when both have the same name', async () => {
    // The other machine sees the account's copy. A local one overwriting it would change
    // what that machine shows, from a device the user is not looking at.
    service.list.mockResolvedValue([row(1, 'VIP', { priority: 'critical' })]);
    localStorage.setItem(KEY, JSON.stringify([{ name: 'VIP', filters: { priority: 'low' } }]));

    const loaded = await loadSavedViews();

    expect(service.save).not.toHaveBeenCalled();
    expect(loaded.views).toEqual([{ id: 1, name: 'VIP', filters: { priority: 'critical' } }]);
  });

  it('does not clear storage when the upload failed', async () => {
    // Half-migrated and then wiped is how someone loses a view for good.
    service.list.mockResolvedValue([]);
    service.save.mockRejectedValue(new Error('500'));
    localStorage.setItem(KEY, JSON.stringify([{ name: 'Local', filters: { priority: 'high' } }]));

    const loaded = await loadSavedViews();

    expect(readLocalSavedViews().map((view) => view.name)).toEqual(['Local']);
    // Still offered, so the pill does not vanish while the row is being retried.
    expect(loaded.views.map((view) => view.name)).toEqual(['Local']);
  });

  it('touches nothing when this browser has none', async () => {
    service.list.mockResolvedValue([row(1, 'VIP')]);
    const loaded = await loadSavedViews();
    expect(service.save).not.toHaveBeenCalled();
    expect(loaded.views).toHaveLength(1);
  });
});
