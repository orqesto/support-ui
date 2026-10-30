import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * The source list's mark-imported warning (support-service#1229) is shown only while the setting
 * is on: the backend keeps a failure note for 24 h, and a source switched off since should not
 * keep a "Not marked read" badge for the rest of the day.
 */
const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => get(...args) },
}));

import { integrationsService } from '@/services/integrations.service';

const warning = { status: 'failed', error: 'refused', at: '2026-10-30T12:00:00Z' };
const row = (id: number, type: string, config: unknown) => ({
  id,
  type,
  name: `source ${id}`,
  config,
  markImportedWarning: warning,
});

beforeEach(() => get.mockReset());

describe('integrationsService.getAll — mark-imported warning', () => {
  it('keeps the warning while the setting is on (IMAP and Gmail)', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [
          row(1, 'email', { email: { markImported: { enabled: true } } }),
          row(2, 'gmail', { gmail: { markImported: { enabled: true, label: 'Odly' } } }),
        ],
      },
    });
    const { data } = await integrationsService.getAll();
    expect((data ?? []).map((source) => source.markImportedWarning)).toEqual([
      { status: 'failed', error: 'refused' },
      { status: 'failed', error: 'refused' },
    ]);
  });

  it('drops a leftover warning once the setting is off or absent', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [
          row(1, 'email', { email: { markImported: { enabled: false } } }),
          row(2, 'gmail', { gmail: {} }),
          row(3, 'email', {}),
        ],
      },
    });
    const { data } = await integrationsService.getAll();
    expect((data ?? []).map((source) => source.markImportedWarning)).toEqual([null, null, null]);
  });
});
