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
    await statisticsService.getAll(7, 'telegram');
    expect(get).toHaveBeenCalledWith('/api/statistics?days=7&channel=telegram');
  });

  it('"all" channels sends only the window', async () => {
    await statisticsService.getAll(30, 'all');
    expect(get).toHaveBeenCalledWith('/api/statistics?days=30');
  });

  it("CONTROL: with no arguments it names the backend's own default window", async () => {
    await statisticsService.getAll();
    expect(get).toHaveBeenCalledWith('/api/statistics?days=90');
  });
});
