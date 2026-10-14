import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The service's skew defence, tested through the REAL service.
 *
 * 🔴 WHY SEPARATELY: the panel's own suite mocks `customApiLookupService` wholesale, so
 * `normalise` never runs there — the panel passed its "tolerates a narrow response" test because
 * the COMPONENT is defensive, not because the service is. Two defences, one test, and removing
 * either one stayed green. This exercises the service itself.
 *
 * What it guards: a push to `main` deploys this frontend while the backend ships on a tag, so this
 * code meets responses from a backend that predates it.
 */
const post = vi.fn();
const get = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (...args: unknown[]): unknown => post(...args),
    get: (...args: unknown[]): unknown => get(...args),
  },
}));

const { customApiLookupService } = await import('../customApiLookup.service');

beforeEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('customApiLookupService.run', () => {
  it('fills in the fields an older backend does not send', async () => {
    // RED: return the rows untouched ⇒ a component reading `result.rows.length` on an older
    // deployment white-screens the whole thread view.
    post.mockResolvedValue({
      data: { success: true, data: [{ endpointId: 20, label: 'x', status: 'ok' }] },
    });

    const [row] = await customApiLookupService.run({ conversationId: 1 });

    expect(row.rows).toEqual([]);
    expect(row.fields).toEqual([]);
    expect(row.suggestions).toEqual([]);
  });

  it('⛔ does NOT invent an ownership verdict', async () => {
    // Absent means "this backend performs no ownership check". Defaulting it to 'owned' asserts
    // something no backend said; defaulting it to 'mismatch' flags every record on an older
    // deployment. Neither is ours to decide on the client.
    post.mockResolvedValue({
      data: { success: true, data: [{ endpointId: 20, label: 'x', status: 'ok' }] },
    });

    const [row] = await customApiLookupService.run({ conversationId: 1 });

    expect(row.ownership).toBeUndefined();
  });

  it('keeps what the backend DID send', async () => {
    // POSITIVE CONTROL: without it, a normaliser that blanked every field would pass the tests
    // above while discarding real data.
    post.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            endpointId: 20,
            label: 'this order',
            status: 'ok',
            rows: [{ order_id: '137416' }],
            fields: [{ path: 'order_id', label: 'Order', kind: 'plain' }],
            suggestions: ['137416'],
            ownership: 'mismatch',
          },
        ],
      },
    });

    const [row] = await customApiLookupService.run({ conversationId: 1 });

    expect(row.rows).toEqual([{ order_id: '137416' }]);
    expect(row.fields?.[0].label).toBe('Order');
    expect(row.suggestions).toEqual(['137416']);
    expect(row.ownership).toBe('mismatch');
  });

  it('survives a response with no data array at all', async () => {
    post.mockResolvedValue({ data: { success: true } });
    await expect(customApiLookupService.run({ conversationId: 1 })).resolves.toEqual([]);
  });

  it('posts to the agent-facing route, not the configuration surface', async () => {
    // ⛔ `/custom-apis/lookup` is gated on the CONVERSATION (D28); `/custom-apis` is admin-only and
    // would 403 for the support agents this feature exists for.
    post.mockResolvedValue({ data: { success: true, data: [] } });
    await customApiLookupService.run({ conversationId: 7 });

    expect(post).toHaveBeenCalledWith('/api/custom-apis/lookup', { conversationId: 7 });
  });
});

describe('customApiLookupService.availability', () => {
  it('asks the availability route for the given surface — a GET, never the lookup POST', async () => {
    get.mockResolvedValue({ data: { success: true, data: { available: true } } });
    expect(await customApiLookupService.availability('contact')).toBe(true);
    expect(get).toHaveBeenCalledWith('/api/custom-apis/lookup/availability', {
      params: { surface: 'contact' },
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('⛔ fails CLOSED on a response without the flag', async () => {
    // RED: `Boolean(data)` or `!== false` ⇒ an unexpected body shows the dead panel again.
    get.mockResolvedValue({ data: { success: true } });
    expect(await customApiLookupService.availability('thread')).toBe(false);
    get.mockResolvedValue({ data: { success: true, data: { available: 'yes' } } });
    expect(await customApiLookupService.availability('thread')).toBe(false);
  });
});

describe('skew — fields a newer backend adds (2026-10-14)', () => {
  const row = (extra: Record<string, unknown> = {}) => ({
    endpointId: 1,
    label: 'x',
    connectionName: 'Acme',
    resultShape: 'one',
    status: 'no_match',
    ...extra,
  });

  it('an older backend: referenceLabel null, no searchedFor, no skippedBecause', async () => {
    post.mockResolvedValue({ data: { success: true, data: [row()] } });
    const [result] = await customApiLookupService.run({ conversationId: 1 });
    expect(result.referenceLabel).toBeNull();
    expect(result).not.toHaveProperty('searchedFor');
    expect(result).not.toHaveProperty('skippedBecause');
  });

  it('a malformed searchedFor / skippedBecause is dropped, not rendered', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        data: [
          row({
            searchedFor: { kind: 'reference' },
            skippedBecause: { reason: 'a_reason_from_the_future', sourceLabel: 'Account' },
          }),
          row({ searchedFor: { kind: 'source', label: '' }, skippedBecause: 'nope' }),
        ],
      },
    });
    const results = await customApiLookupService.run({ conversationId: 1 });
    for (const result of results) {
      expect(result.searchedFor).toBeUndefined();
      expect(result.skippedBecause).toBeUndefined();
    }
  });

  it('well-formed ones pass through', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        data: [
          row({
            searchedFor: { kind: 'source', label: 'Account' },
            skippedBecause: { reason: 'source_no_match', sourceLabel: 'Account' },
            referenceLabel: 'User id',
          }),
        ],
      },
    });
    const [result] = await customApiLookupService.run({ conversationId: 1 });
    expect(result.searchedFor).toEqual({ kind: 'source', label: 'Account' });
    expect(result.skippedBecause).toEqual({ reason: 'source_no_match', sourceLabel: 'Account' });
    expect(result.referenceLabel).toBe('User id');
  });

  it('options from an older backend read referenceLabel as null', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { endpointId: 2, label: 'By id', connectionName: 'Acme', parameterSource: 'manual' },
          { endpointId: 3, label: 'By id', connectionName: 'Acme', referenceLabel: 'User id' },
        ],
      },
    });
    const options = await customApiLookupService.lookupOptions('thread');
    expect(options.map((option) => option.referenceLabel)).toEqual([null, 'User id']);
  });
});
