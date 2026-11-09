import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const put = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const patch = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const del = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    patch: (...args: unknown[]) => patch(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

import { organizationService } from '@/services/organization.service';

const reply = (data: unknown) => ({ data: { success: true, data } });

/**
 * Skill routing values (BE spec 2026-11-02). FE ships on merge, BE on a tag: an older backend
 * answers keys without `type` and has no values endpoints — the client reads that as "topic" and
 * "not available", never as an error the settings page shows.
 */
describe('organizationService — routing keys and values', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keys carry their type; an older backend without one reads as topic', async () => {
    get.mockResolvedValue(
      reply([
        { id: 1, key: 'lang', description: null, type: 'language' },
        { id: 2, key: 'payment_sys', description: null },
      ])
    );
    await expect(organizationService.getRoutingKeys()).resolves.toEqual([
      { id: 1, key: 'lang', description: null, type: 'language', typeReported: true },
      { id: 2, key: 'payment_sys', description: null, type: 'topic', typeReported: false },
    ]);
  });

  it('adding a key sends its type; changing it PATCHes the key', async () => {
    post.mockResolvedValue(reply({}));
    patch.mockResolvedValue(reply({}));
    await organizationService.addRoutingKey('lang', undefined, 'language');
    expect(post).toHaveBeenCalledWith('/api/organizations/routing-keys', {
      key: 'lang',
      description: undefined,
      type: 'language',
    });
    await organizationService.setRoutingKeyType('pay sys', 'topic');
    expect(patch).toHaveBeenCalledWith('/api/organizations/routing-keys/pay%20sys', {
      type: 'topic',
    });
  });

  it('values: list, set description, delete, suggest — encoded paths', async () => {
    get.mockResolvedValue(
      reply([
        {
          value: 'usdc',
          description: 'USD Coin',
          holders: 1,
          unused: false,
          reassigned30d: 0,
          knownLanguage: null,
        },
      ])
    );
    await expect(organizationService.getRoutingKeyValues('payment_sys')).resolves.toHaveLength(1);
    expect(get).toHaveBeenCalledWith(
      '/api/organizations/routing-keys/payment_sys/values',
      undefined
    );
    put.mockResolvedValue(reply({ value: 'usd c', description: null }));
    await organizationService.setRoutingValueDescription('payment_sys', 'usd c', null);
    expect(put).toHaveBeenCalledWith('/api/organizations/routing-keys/payment_sys/values/usd%20c', {
      description: null,
    });
    del.mockResolvedValue(reply({}));
    await organizationService.deleteRoutingValue('payment_sys', 'usdc');
    expect(del).toHaveBeenCalledWith('/api/organizations/routing-keys/payment_sys/values/usdc');
    post.mockResolvedValue(reply({ description: 'Tether …' }));
    await expect(
      organizationService.suggestRoutingValueDescription('payment_sys', 'usdt')
    ).resolves.toEqual({ description: 'Tether …' });
  });

  it('values on an older backend (404) → null, not an error', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404, data: { error: 'Not found' } })
    );
    await expect(organizationService.getRoutingKeyValues('payment_sys')).resolves.toBeNull();
  });

  it('suggest refused (409) → the reason, not an error', async () => {
    post.mockRejectedValue(
      Object.assign(new Error('Conflict'), { status: 409, data: { reason: 'no_ai' } })
    );
    await expect(
      organizationService.suggestRoutingValueDescription('payment_sys', 'usdt')
    ).resolves.toEqual({ refused: 'no_ai' });
  });

  it('test a message posts the text and returns the outcome', async () => {
    post.mockResolvedValue(reply({ wouldAssign: null, keys: [] }));
    await organizationService.testRoutingMessage({ text: 'Tether', askAi: false });
    expect(post).toHaveBeenCalledWith('/api/organizations/routing/test', {
      text: 'Tether',
      askAi: false,
    });
  });

  it('the reassignment count is asked for only when the caller wants it (it costs a month scan)', async () => {
    get.mockResolvedValue(reply([]));
    await organizationService.getRoutingKeyValues('payment_sys');
    expect(get).toHaveBeenLastCalledWith(
      '/api/organizations/routing-keys/payment_sys/values',
      undefined
    );
    await organizationService.getRoutingKeyValues('payment_sys', { includeReassigned: true });
    expect(get).toHaveBeenLastCalledWith('/api/organizations/routing-keys/payment_sys/values', {
      params: { include: 'reassigned' },
    });
  });

  it('value patterns keep strength and case options; malformed entries are dropped; no field stays absent', async () => {
    get.mockResolvedValue(
      reply([
        {
          value: 'usdt',
          description: null,
          holders: 1,
          unused: false,
          reassigned30d: null,
          knownLanguage: null,
          patterns: [
            { preset: 'tron_address', strength: 'hint' },
            { regex: 'ORD-\\d+', caseSensitive: true },
            { regex: 'x', strength: 'loud' },
            { nothing: true },
            'junk',
          ],
        },
        {
          value: 'usdc',
          description: null,
          holders: 1,
          unused: false,
          reassigned30d: null,
          knownLanguage: null,
        },
      ])
    );
    const rows = await organizationService.getRoutingKeyValues('payment_sys');
    expect(rows?.[0].patterns).toEqual([
      { preset: 'tron_address', strength: 'hint' },
      { regex: 'ORD-\\d+', caseSensitive: true },
      { regex: 'x' },
    ]);
    expect(rows?.[1]).not.toHaveProperty('patterns');
  });

  it('saving patterns PUTs them with default options left out', async () => {
    put.mockResolvedValue(reply({}));
    await organizationService.setRoutingValuePatterns('pay sys', 'usd t', [
      { preset: 'tron_address', strength: 'decides' },
      { preset: 'evm_address', strength: 'hint' },
      { regex: 'A\\d', caseSensitive: false, strength: 'hint' },
      { regex: 'B\\d', caseSensitive: true },
    ]);
    expect(put).toHaveBeenCalledWith(
      '/api/organizations/routing-keys/pay%20sys/values/usd%20t/patterns',
      {
        patterns: [
          { preset: 'tron_address' },
          { preset: 'evm_address', strength: 'hint' },
          { regex: 'A\\d', strength: 'hint' },
          { regex: 'B\\d', caseSensitive: true },
        ],
      }
    );
  });

  it('pattern presets: the backend list, normalized; an older backend (404) gets the built-in v1.1.325 list; other errors throw', async () => {
    get.mockResolvedValueOnce(
      reply([
        { id: 'iban', label: 'IBAN', category: 'banking', caseSensitive: true, example: 'XX00 …' },
        { id: 'phone_e164', label: 'Phone', category: 'contact', caseSensitive: false },
        { label: 'no id' },
      ])
    );
    await expect(organizationService.getRoutingPatternPresets()).resolves.toEqual({
      presets: [
        { id: 'iban', label: 'IBAN', category: 'banking', caseSensitive: true, example: 'XX00 …' },
        { id: 'phone_e164', label: 'Phone', category: 'contact', caseSensitive: false },
      ],
      legacy: false,
    });
    expect(get).toHaveBeenLastCalledWith('/api/organizations/routing-pattern-presets');

    get.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404, data: {} }));
    const { presets: fallback, legacy } = await organizationService.getRoutingPatternPresets();
    // An older backend: flagged, so the editor does not offer options it would drop.
    expect(legacy).toBe(true);
    expect(fallback.map((preset) => preset.id)).toEqual([
      'evm_tx_hash',
      'evm_address',
      'tron_address',
      'btc_address',
      'hex64_hash',
    ]);
    expect(fallback.every((preset) => preset.category === 'crypto')).toBe(true);

    get.mockRejectedValueOnce(Object.assign(new Error('Server'), { status: 500, data: {} }));
    await expect(organizationService.getRoutingPatternPresets()).rejects.toThrow('Server');
  });
});
