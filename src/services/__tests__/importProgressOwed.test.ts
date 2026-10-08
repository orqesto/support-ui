/**
 * The owed list and its retry: the exact routes and bodies (a retry body without `dryRun` is
 * refused by the backend, and only the confirm sends `false`), and an answer from a backend before
 * `canRetry` / `hiddenCount` / `dryRun` read as "not offered" / "not known" / what was asked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests: { method: string; url: string; body?: unknown }[] = [];
let answer: unknown = {};
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) => {
      requests.push({ method: 'get', url });
      return Promise.resolve({ data: { success: true, data: answer } });
    },
    post: (url: string, body: unknown) => {
      requests.push({ method: 'post', url, body });
      return Promise.resolve({ data: { success: true, data: answer } });
    },
  },
}));

const { importProgressService } = await import('@/services/importProgress.service');

beforeEach(() => {
  requests.length = 0;
  answer = {};
});

describe('owed and retry-owed', () => {
  it('reads the run owed list from its route; an older answer offers no retry and knows no hidden count', async () => {
    answer = {
      run: { id: 'run-a', channel: 'gmail', startedAt: 'x', outcome: 'done', messages: 3 },
      scope: 'departments',
      owed: { embedding: { count: 2, conversations: [{ conversationId: 9, publicId: 'SUP-9' }] } },
    };
    const owed = await importProgressService.owed(7, 'run-a');
    expect(requests).toEqual([
      { method: 'get', url: '/api/integrations/7/import-progress/runs/run-a/owed' },
    ]);
    expect(owed.canRetry).toBe(false);
    expect(owed.owed.embedding.hiddenCount).toBeUndefined();
    expect(owed.owed.kb).toEqual({ count: 0, conversations: [] });
    expect(owed.owed.embedding.conversations[0]).toMatchObject({
      conversationId: 9,
      publicId: 'SUP-9',
      deleted: false,
    });
  });

  it('sends dryRun on both calls, and words the answer by what was asked', async () => {
    answer = { embedding: { queued: 1 } }; // no dryRun field
    const dry = await importProgressService.retryOwed(7, 'run-a', true);
    const real = await importProgressService.retryOwed(7, 'run-a', false);
    expect(requests).toEqual([
      {
        method: 'post',
        url: '/api/integrations/7/import-progress/runs/run-a/retry-owed',
        body: { dryRun: true },
      },
      {
        method: 'post',
        url: '/api/integrations/7/import-progress/runs/run-a/retry-owed',
        body: { dryRun: false },
      },
    ]);
    expect(dry.dryRun).toBe(true);
    expect(real.dryRun).toBe(false);
    expect(real.embedding.queued).toBe(1);
    expect(real.heldBackForNow).toBe(false);
    expect(real.heldBackForGood).toBe(false);
  });
});
