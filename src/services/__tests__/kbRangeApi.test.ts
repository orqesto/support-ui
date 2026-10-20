import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ url: string; body: unknown }> = [];
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (url: string, body?: unknown) => {
      calls.push({ url, body });
      return Promise.resolve({ data: { success: true, data: { echoed: url } } });
    },
  },
}));

import { integrationsService } from '../integrations.service';

describe('kb history range service calls', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('kbHistoryRange posts the body to the source route and returns data', async () => {
    const result = await integrationsService.kbHistoryRange(7, { days: 90, apply: true });
    expect(calls).toEqual([
      { url: '/api/integrations/7/kb-history-range', body: { days: 90, apply: true } },
    ]);
    expect(result).toEqual({ echoed: '/api/integrations/7/kb-history-range' });
  });

  it('countImapMessages starts a background count, with days only when given', async () => {
    await integrationsService.countImapMessages(3).catch(() => undefined);
    await integrationsService.countImapMessages(3, { days: 0 }).catch(() => undefined);
    expect(calls).toEqual([
      { url: '/api/integrations/3/count-jobs', body: { kind: 'imap-count', params: {} } },
      { url: '/api/integrations/3/count-jobs', body: { kind: 'imap-count', params: { days: 0 } } },
    ]);
  });

  it('the dry run (days, no apply) is a background count; the policy read is a plain request', async () => {
    await integrationsService.kbHistoryRange(7, { days: 90 }).catch(() => undefined);
    await integrationsService.kbHistoryRange(7, {});
    expect(calls).toEqual([
      {
        url: '/api/integrations/7/count-jobs',
        body: { kind: 'kb-history-range', params: { days: 90 } },
      },
      { url: '/api/integrations/7/kb-history-range', body: {} },
    ]);
  });
});
