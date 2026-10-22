/**
 * The audit log filter holds local DAYS; it used to send them bare (`endDate=2026-10-09`), which
 * the API reads as UTC midnight — so the "to" day itself was cut off (date-range calendar audit,
 * 2026-10-22). It now sends the first instant of the from-day and the last of the to-day.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const { auditLogService } = await import('../auditLog.service');

describe('audit log date range', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: { success: true, data: [], pagination: {} } });
  });

  it('the end day is sent as its last instant, not midnight', async () => {
    await auditLogService.getAll({ startDate: '2026-10-03', endDate: '2026-10-09' });
    const url = String(get.mock.calls[0][0]);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('startDate')).toBe(new Date(2026, 9, 3).toISOString());
    expect(params.get('endDate')).toBe(new Date(2026, 9, 9, 23, 59, 59, 999).toISOString());
  });
});
