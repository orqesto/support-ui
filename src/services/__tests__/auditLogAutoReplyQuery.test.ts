/**
 * The automatic replies view of Audit Logs asks the backend with its 2026-11-23 parameters:
 * several actions in one `action`, `reason` and `channel` — and counts over the page's period.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn<(url: string) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (url: string) => get(url) } }));

import { auditLogService } from '../auditLog.service';

const query = () => new URL(get.mock.calls[0][0], 'http://x.test').searchParams;

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({
    data: {
      success: true,
      data: { logs: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } },
    },
  });
});

describe('auditLogService — automatic replies', () => {
  it('sends both actions as one list, with the reason and the channel', async () => {
    await auditLogService.getAll({
      action: 'message.auto_reply_sent,message.auto_reply_withheld',
      reason: 'would_send',
      channel: 'chat_widget',
    });
    expect(get.mock.calls[0][0]).toMatch(/^\/api\/audit-logs\?/);
    expect(query().get('action')).toBe('message.auto_reply_sent,message.auto_reply_withheld');
    expect(query().get('reason')).toBe('would_send');
    expect(query().get('channel')).toBe('chat_widget');
  });

  it('CONTROL: without them, neither parameter is sent', async () => {
    await auditLogService.getAll({ action: 'message.reply' });
    expect(query().has('reason')).toBe(false);
    expect(query().has('channel')).toBe(false);
  });

  it('counts: no dates = the backend’s own period; with dates, the whole first and last day', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: { range: { startDate: 'a', endDate: 'b' }, totals: { sent: 2 } },
      },
    });
    const counts = await auditLogService.getAutoReplyCounts();
    expect(get.mock.calls[0][0]).toBe('/api/audit-logs/auto-replies/counts');
    // A partial answer reads as zeros and empty lists, never undefined.
    expect(counts.totals).toEqual({ sent: 2, wouldSend: 0, held: 0, acknowledgments: 0 });
    expect(counts.byChannel).toEqual([]);
    expect(counts.heldByReason).toEqual([]);
    await auditLogService.getAutoReplyCounts({ startDate: '2026-11-01', endDate: '2026-11-07' });
    const range = new URL(get.mock.calls[1][0], 'http://x.test').searchParams;
    expect(new Date(range.get('startDate') ?? '').getTime()).toBeLessThan(
      new Date(range.get('endDate') ?? '').getTime()
    );
    expect(range.get('startDate')).toMatch(/^2026-1[01]-/);
  });
});
