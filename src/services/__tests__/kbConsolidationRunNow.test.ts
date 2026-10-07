/**
 * "Run now" service calls: a 409 is an answer (why the run did not start), a 404 is an older
 * backend without the route (no button), anything else is an error — as the app's real API
 * client delivers them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import type * as ApiClientModule from '@/lib/api-client';

let getImpl: (url: string) => Promise<unknown> = () => Promise.resolve({ data: { data: {} } });
const getUrls: string[] = [];
let postImpl: () => Promise<unknown> = () => Promise.resolve({ data: { data: {} } });

// Errors go through the REAL response interceptor, as in the app: it rejects with a plain Error
// carrying `status`/`data`, not the AxiosError the transport raised (audit pass 3, HIGH-1/2).
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    apiClient: {
      get: (url: string) => {
        getUrls.push(url);
        return getImpl(url).catch((err: unknown) => actual.handleResponseError(err));
      },
      post: () => postImpl().catch((err: unknown) => actual.handleResponseError(err)),
    },
  };
});

const { kbConsolidationService } = await import('../kbConsolidation.service');
const { kbService } = await import('../kb.service');

const httpError = (status: number, data: unknown) =>
  new AxiosError('request failed', String(status), undefined, undefined, {
    status,
    data,
    statusText: '',
    headers: {},
    config: {},
  } as AxiosResponse);

beforeEach(() => {
  getUrls.length = 0;
  getImpl = () => Promise.resolve({ data: { data: {} } });
  postImpl = () => Promise.resolve({ data: { data: {} } });
});

describe('kbConsolidationService run now', () => {
  it('202 ⇒ started with the server start time', async () => {
    postImpl = () =>
      Promise.resolve({ data: { data: { started: true, startedAt: '2026-10-05T10:00:00Z' } } });
    await expect(kbConsolidationService.runNow()).resolves.toEqual({
      started: true,
      startedAt: '2026-10-05T10:00:00Z',
    });
  });

  it('409 ⇒ not started, with the reason and when to retry', async () => {
    postImpl = () =>
      Promise.reject(
        httpError(409, { success: false, data: { reason: 'disabled', retryAfter: null } })
      );
    await expect(kbConsolidationService.runNow()).resolves.toEqual({
      started: false,
      reason: 'disabled',
      retryAfter: null,
    });
    postImpl = () =>
      Promise.reject(
        httpError(409, { data: { reason: 'cooldown', retryAfter: '2026-10-05T10:14:00Z' } })
      );
    await expect(kbConsolidationService.runNow()).resolves.toEqual({
      started: false,
      reason: 'cooldown',
      retryAfter: '2026-10-05T10:14:00Z',
    });
  });

  it('409 with switches (newer backend) ⇒ the refusal carries them, normalised', async () => {
    const switches = {
      ownKey: true,
      selfHosted: false,
      globalApplies: false,
      enabled: { on: false, from: 'default' },
      dryRun: { on: false, from: 'default' },
      quality: { on: false, from: 'default' },
    };
    postImpl = () =>
      Promise.reject(
        httpError(409, { success: false, data: { reason: 'disabled', retryAfter: null, switches } })
      );
    await expect(kbConsolidationService.runNow()).resolves.toEqual({
      started: false,
      reason: 'disabled',
      retryAfter: null,
      switches,
    });
    // The BE sends `switches: null` when it has none: no key, as from an older backend.
    postImpl = () =>
      Promise.reject(
        httpError(409, { data: { reason: 'disabled', retryAfter: null, switches: null } })
      );
    const refused = await kbConsolidationService.runNow();
    expect('switches' in refused).toBe(false);
  });

  it('a 500 is an error, not a refusal', async () => {
    postImpl = () => Promise.reject(httpError(500, { success: false }));
    await expect(kbConsolidationService.runNow()).rejects.toMatchObject({ status: 500 });
  });

  it('GET 404 (older backend) ⇒ null; GET 403 ⇒ error', async () => {
    // A real 404 carries a JSON body (the route-not-found envelope).
    getImpl = () => Promise.reject(httpError(404, { success: false, error: 'Not found' }));
    await expect(kbConsolidationService.getRunState()).resolves.toBeNull();
    getImpl = () => Promise.reject(httpError(403, { success: false, message: 'Forbidden' }));
    await expect(kbConsolidationService.getRunState()).rejects.toMatchObject({ status: 403 });
  });

  it('GET 200 ⇒ normalized state', async () => {
    getImpl = () =>
      Promise.resolve({
        data: { data: { runningSince: '2026-10-05T10:00:00Z', last: null, canRun: true } },
      });
    await expect(kbConsolidationService.getRunState()).resolves.toEqual({
      runningSince: '2026-10-05T10:00:00Z',
      last: null,
      canRun: true,
    });
  });
});

describe('kbService.getAll with a finding', () => {
  it('sends the finding together with its department', async () => {
    getImpl = () => Promise.resolve({ data: { data: { entries: [], pagination: {} } } });
    await kbService.getAll({ type: 'qa_pair', finding: 'raw_email', departmentId: 3 });
    const query = new URLSearchParams(getUrls[0].split('?')[1]);
    expect(query.get('finding')).toBe('raw_email');
    expect(query.get('departmentId')).toBe('3');
  });

  it('a finding without a department is not sent (the backend would refuse it)', async () => {
    getImpl = () => Promise.resolve({ data: { data: { entries: [], pagination: {} } } });
    await kbService.getAll({ type: 'qa_pair', finding: 'raw_email' });
    expect(getUrls[0]).not.toContain('finding=');
  });
});
