/**
 * An org can be served by the PLATFORM rather than by its own configuration, and every
 * per-org surface asked the wrong question about it.
 *
 * AI: `enabled` lists BYO providers. An org on `settings.aiMode = 'managed'` has none of its
 * own, so the gate reported "no AI" for an org whose AI works — on a live deployment the AI
 * button was hidden for `g-2`, the one workspace whose AI came solely from managed mode. Two
 * other managed orgs were masked only because they happened to also carry a BYO row.
 *
 * Storage: the API returned `null` for an org on the platform default, and v1.1.248 returns
 * `{ source: 'platform' }` instead. Both mean the same thing, and this bundle is served
 * against both during a deploy window — so both must read as platform. Getting that wrong
 * renders an empty customer form for an org whose bytes are in the platform bucket.
 */
import { describe, it, expect } from 'vitest';
import { isPlatformStorage } from '../../components/settings/providers/ObjectStorageConfigCard';
import { aiIsConfigured } from '../useAiConfigured';

describe('aiIsConfigured', () => {
  it('is true for an org with its own provider', () => {
    expect(aiIsConfigured({ enabled: ['openai'] })).toBe(true);
  });

  it('is true for a managed org with NO provider of its own — the g-2 case', () => {
    expect(aiIsConfigured({ enabled: [], platform: { active: true } })).toBe(true);
  });

  it('is false when there is neither', () => {
    expect(aiIsConfigured({ enabled: [], platform: { active: false } })).toBe(false);
  });

  it('CONTROL — an older API omits `platform` entirely and must not throw', () => {
    // Must survive. Reading a new BE field unguarded is how a deploy window white-screens
    // a page; this bundle ships BEFORE the backend that returns the field.
    expect(aiIsConfigured({ enabled: [] })).toBe(false);
    expect(aiIsConfigured({ enabled: ['anthropic'] })).toBe(true);
  });
});

describe('isPlatformStorage', () => {
  it('treats the older API\'s null as platform', () => {
    expect(isPlatformStorage(null)).toBe(true);
    expect(isPlatformStorage(undefined)).toBe(true);
  });

  it('treats the new explicit shape as platform', () => {
    expect(isPlatformStorage({ source: 'platform' })).toBe(true);
  });

  it('treats a customer config as BYO', () => {
    expect(isPlatformStorage({ source: 'customer' })).toBe(false);
  });

  it('CONTROL — a config with no `source` is BYO, not platform', () => {
    // Must survive. An older API returns a bucket-bearing object with no `source`; reading
    // that as platform would hide a customer's own S3 settings behind managed-storage copy.
    expect(isPlatformStorage({})).toBe(false);
  });
});
