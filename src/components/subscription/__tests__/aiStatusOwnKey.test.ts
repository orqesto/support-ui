import { beforeEach, describe, expect, it, vi } from 'vitest';

let providers: unknown;
vi.mock('@/services/ai.service', () => ({
  aiService: { getProviders: () => (providers instanceof Error ? Promise.reject(providers) : Promise.resolve(providers)) },
}));
vi.mock('@/services/subscription.service', () => ({ subscriptionService: {} }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { loadOwnKey } from '../aiStatus';

describe('loadOwnKey', () => {
  beforeEach(() => {
    providers = undefined;
  });
  it('platform off and an enabled provider = own key', async () => {
    providers = { data: { platform: { active: false }, enabled: [{ id: 1 }] } };
    expect(await loadOwnKey()).toBe(true);
  });
  it('platform off and no enabled provider = no own key', async () => {
    providers = { data: { platform: { active: false }, enabled: [] } };
    expect(await loadOwnKey()).toBe(false);
  });
  it('platform on, or a failed call, = no own key', async () => {
    providers = { data: { platform: { active: true }, enabled: [{ id: 1 }] } };
    expect(await loadOwnKey()).toBe(false);
    providers = new Error('x');
    expect(await loadOwnKey()).toBe(false);
  });
});
