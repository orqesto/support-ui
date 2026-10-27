import { describe, it, expect, vi, beforeEach } from 'vitest';

type GetConfig = { params?: Record<string, string> };
const get = vi.fn<(url: string, config?: GetConfig) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string, config?: GetConfig) => get(url, config) },
}));

const { fetchNotificationsOfKind, resetNotificationsByKindForTests } = await import(
  '@/services/notificationsByKind.service'
);

const page = (id: number) => ({ notifications: [{ id }], total: 1, hasMore: false });
const byKindAnswer = (byKind: Record<string, unknown>) => ({
  data: { success: true, data: { byKind } },
});
const kindsAsked = (call: number) => get.mock.calls[call]?.[1]?.params?.kinds?.split(',');

beforeEach(() => {
  get.mockReset();
  resetNotificationsByKindForTests();
});

describe('fetchNotificationsOfKind', () => {
  it('kinds asked in the same tick go out as ONE by-kind request, each answered in the per-kind shape', async () => {
    get.mockResolvedValueOnce(byKindAnswer({ alpha: page(1), beta: page(2), gamma: page(3) }));
    const answers = await Promise.all([
      fetchNotificationsOfKind('alpha'),
      fetchNotificationsOfKind('beta'),
      fetchNotificationsOfKind('gamma'),
    ]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toBe('/api/notifications/by-kind');
    expect(kindsAsked(0)).toEqual(['alpha', 'beta', 'gamma']);
    expect(answers.map((res) => res.data.data)).toEqual([page(1), page(2), page(3)]);
  });

  it('the same kind twice is asked for once and answers both callers', async () => {
    get.mockResolvedValueOnce(byKindAnswer({ alpha: page(1) }));
    const [first, second] = await Promise.all([
      fetchNotificationsOfKind('alpha'),
      fetchNotificationsOfKind('alpha'),
    ]);
    expect(kindsAsked(0)).toEqual(['alpha']);
    expect(first.data.data).toEqual(page(1));
    expect(second.data.data).toEqual(page(1));
  });

  it('calls in different ticks are separate requests', async () => {
    get.mockResolvedValueOnce(byKindAnswer({ alpha: page(1) }));
    await fetchNotificationsOfKind('alpha');
    get.mockResolvedValueOnce(byKindAnswer({ beta: page(2) }));
    await fetchNotificationsOfKind('beta');
    expect(get).toHaveBeenCalledTimes(2);
    expect(kindsAsked(1)).toEqual(['beta']);
  });

  it('a backend without the route (404) gets the per-kind requests, now and from then on', async () => {
    get.mockImplementation((url, config) =>
      url === '/api/notifications/by-kind'
        ? Promise.reject(Object.assign(new Error('Not Found'), { response: { status: 404 } }))
        : Promise.resolve({
            data: { success: true, data: page(config?.params?.kind === 'alpha' ? 1 : 2) },
          })
    );
    const answers = await Promise.all([
      fetchNotificationsOfKind('alpha'),
      fetchNotificationsOfKind('beta'),
    ]);
    expect(answers.map((res) => res.data.data)).toEqual([page(1), page(2)]);
    get.mockClear();
    await fetchNotificationsOfKind('alpha');
    expect(get.mock.calls.map(([url, config]) => [url, config?.params])).toEqual([
      ['/api/notifications', { kind: 'alpha' }],
    ]);
  });

  it('any other failure rejects every caller and does NOT give up on by-kind', async () => {
    get.mockRejectedValueOnce({ response: { status: 500 } });
    const results = await Promise.allSettled([
      fetchNotificationsOfKind('alpha'),
      fetchNotificationsOfKind('beta'),
    ]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    get.mockResolvedValueOnce(byKindAnswer({ alpha: page(1) }));
    await fetchNotificationsOfKind('alpha');
    expect(get.mock.calls[1]?.[0]).toBe('/api/notifications/by-kind');
  });

  it('a kind missing from the answer rejects (never reads as "no rows"); the others still resolve', async () => {
    get.mockResolvedValueOnce(byKindAnswer({ alpha: page(1) }));
    const [alpha, beta] = await Promise.allSettled([
      fetchNotificationsOfKind('alpha'),
      fetchNotificationsOfKind('beta'),
    ]);
    expect(alpha.status).toBe('fulfilled');
    expect(beta.status).toBe('rejected');
  });

  it('more kinds than the backend accepts in one request are split into requests of at most 30', async () => {
    const kinds = Array.from({ length: 31 }, (_, index) => `kind_${index}`);
    get.mockImplementation((_url, config) =>
      Promise.resolve(
        byKindAnswer(
          Object.fromEntries(
            (config?.params?.kinds ?? '').split(',').map((kind, index) => [kind, page(index)])
          )
        )
      )
    );
    await Promise.all(kinds.map((kind) => fetchNotificationsOfKind(kind)));
    expect(get).toHaveBeenCalledTimes(2);
    expect(kindsAsked(0)).toHaveLength(30);
    expect(kindsAsked(1)).toEqual(['kind_30']);
  });
});
