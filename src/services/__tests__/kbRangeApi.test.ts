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

  it('countImapMessages sends days only when given', async () => {
    await integrationsService.countImapMessages(3);
    await integrationsService.countImapMessages(3, { days: 0 });
    expect(calls.map((call) => call.body)).toEqual([undefined, { days: 0 }]);
  });
});
