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
      { id: 1, key: 'lang', description: null, type: 'language' },
      { id: 2, key: 'payment_sys', description: null, type: 'topic' },
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
    expect(get).toHaveBeenCalledWith('/api/organizations/routing-keys/payment_sys/values');
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
    get.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404, data: { error: 'Not found' } }));
    await expect(organizationService.getRoutingKeyValues('payment_sys')).resolves.toBeNull();
  });

  it('suggest refused (409) → the reason, not an error', async () => {
    post.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409, data: { reason: 'no_ai' } }));
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
});
