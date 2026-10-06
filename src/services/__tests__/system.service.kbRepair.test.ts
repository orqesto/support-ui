/**
 * The KB repair endpoints write on exactly `apply: true` and nothing else. The check and the
 * list must never carry it; the writes must carry exactly it (and the re-read, only its mailbox).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const posts: Array<{ url: string; body: unknown }> = [];
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (url: string, body: unknown) => {
      posts.push({ url, body });
      return Promise.resolve({ data: { success: true, data: {} } });
    },
  },
}));

const { default: systemService } = await import('../system.service');

beforeEach(() => {
  posts.length = 0;
});

describe('system.service — KB repair requests', () => {
  it('the document check and the mailbox list send no apply', async () => {
    await systemService.checkKbDocumentRepair();
    await systemService.listKbHistorySweep();
    expect(posts).toEqual([
      { url: '/api/system/repair-unvalidated-kb-documents', body: {} },
      { url: '/api/system/request-kb-history-sweep', body: {} },
    ]);
  });

  it('the writes send exactly apply: true — the re-read for one mailbox only', async () => {
    await systemService.applyKbDocumentRepair();
    await systemService.requestKbHistorySweep(68);
    expect(posts).toEqual([
      { url: '/api/system/repair-unvalidated-kb-documents', body: { apply: true } },
      { url: '/api/system/request-kb-history-sweep', body: { messageSourceId: 68, apply: true } },
    ]);
  });
});
