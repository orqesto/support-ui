/**
 * FE audit 2026-09-29, D-H2: Statistics › Overview called `/api/statistics` with no `days` and no
 * `channel`, so the backend answered its 90-day, all-channel default under a filter bar saying
 * "7 days · Telegram". The Overview now sends the window and channel like every other tab.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const { statisticsService } = await import('../statistics.service');

describe('statisticsService.getAll', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: { success: true, data: {} } });
  });

  it('sends the window and the channel', async () => {
    await statisticsService.getAll({ days: 7 }, 'telegram');
    expect(get).toHaveBeenCalledWith('/api/statistics?days=7&channel=telegram');
  });

  it('"all" channels sends only the window', async () => {
    await statisticsService.getAll({ days: 30 }, 'all');
    expect(get).toHaveBeenCalledWith('/api/statistics?days=30');
  });

  it('a custom range sends from/to — the first and last instant of its local days — not days', async () => {
    await statisticsService.getAll({ days: 7, fromDay: '2026-10-03', toDay: '2026-10-09' }, 'email');
    const from = new Date(2026, 9, 3).toISOString();
    const to = new Date(2026, 9, 9, 23, 59, 59, 999).toISOString();
    expect(get).toHaveBeenCalledWith(
      `/api/statistics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&channel=email`
    );
  });

  it("CONTROL: with no arguments it names the backend's own default window", async () => {
    await statisticsService.getAll();
    expect(get).toHaveBeenCalledWith('/api/statistics?days=90');
  });
});
