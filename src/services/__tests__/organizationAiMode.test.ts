import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const patch = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
  },
}));

import { organizationService } from '@/services/organization.service';

const orgWithSettings = (settings: unknown) => ({
  data: { success: true, data: { id: 18, name: 'Acme', settings } },
});

// Managed AI is PLATFORM spend: the org pays nothing and we pay the model bill. So the
// read path must never *invent* managed — anything that isn't the literal 'managed'
// string resolves to 'byo'. A misread here bills us for a workspace that never opted in.
describe('organizationService.getAiMode', () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 'managed' only for the literal 'managed' setting", async () => {
    get.mockResolvedValue(orgWithSettings({ aiMode: 'managed' }));
    await expect(organizationService.getAiMode()).resolves.toBe('managed');
  });

  it.each([
    ['byo explicitly', { aiMode: 'byo' }],
    ['key absent', { autoReplyEnabled: true }],
    ['settings empty', {}],
    ['settings null', null],
    ['settings undefined', undefined],
    ['an unexpected value', { aiMode: 'MANAGED' }],
    ['a truthy non-string', { aiMode: 1 }],
  ])('falls back to byo when %s', async (_label, settings) => {
    get.mockResolvedValue(orgWithSettings(settings));
    await expect(organizationService.getAiMode()).resolves.toBe('byo');
  });
});

describe('organizationService.setAiModeSelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PATCHes the tenant-scoped route (not the global-admin /ai-mode)', async () => {
    patch.mockResolvedValue({ data: { success: true, data: { aiMode: 'managed' } } });

    await expect(organizationService.setAiModeSelf('managed')).resolves.toEqual({
      aiMode: 'managed',
    });

    expect(patch).toHaveBeenCalledTimes(1);
    const [url, body] = patch.mock.calls[0];
    expect(url).toBe('/api/organizations/ai-mode/self');
    expect(body).toEqual({ aiMode: 'managed' });
  });

  it('echoes the requested mode when the response carries no data envelope', async () => {
    patch.mockResolvedValue({ data: { success: true } });
    await expect(organizationService.setAiModeSelf('byo')).resolves.toEqual({ aiMode: 'byo' });
  });

  it('propagates the 403 rejection so the caller can read its `code`', async () => {
    const denied = Object.assign(new Error('Managed AI is not available on your current plan.'), {
      status: 403,
      data: { success: false, code: 'managed_ai_not_entitled' },
    });
    patch.mockRejectedValue(denied);

    await expect(organizationService.setAiModeSelf('managed')).rejects.toMatchObject({
      data: { code: 'managed_ai_not_entitled' },
    });
  });
});

// Audit A-F1 (2026-10-23): Settings › AI reads the mode the workspace RUNS on. An unset choice is
// resolved by the backend (`/api/ai/providers` → `platform.active`).
describe('organizationService.getAiModeState', () => {
  beforeEach(() => vi.clearAllMocks());

  const answer = (settings: unknown, platform: unknown) =>
    get.mockImplementation((url: unknown) =>
      String(url).includes('/api/ai/providers')
        ? platform instanceof Error
          ? Promise.reject(platform)
          : Promise.resolve({ data: { success: true, data: { enabled: [], platform } } })
        : Promise.resolve(orgWithSettings(settings))
    );

  it('nothing stored, the backend runs it on our AI: resolved managed, stored undefined', async () => {
    answer({}, { active: true });
    await expect(organizationService.getAiModeState()).resolves.toEqual({
      resolved: 'managed',
      stored: undefined,
    });
  });

  it('nothing stored, not on our AI: resolved byo, stored undefined', async () => {
    answer({}, { active: false });
    await expect(organizationService.getAiModeState()).resolves.toEqual({
      resolved: 'byo',
      stored: undefined,
    });
  });

  it('an older backend (no platform) or a failed read falls back to the stored choice', async () => {
    answer({ aiMode: 'managed' }, undefined);
    await expect(organizationService.getAiModeState()).resolves.toEqual({
      resolved: 'managed',
      stored: 'managed',
    });
    answer({ aiMode: 'byo' }, new Error('down'));
    await expect(organizationService.getAiModeState()).resolves.toEqual({
      resolved: 'byo',
      stored: 'byo',
    });
  });

  it('an unknown stored value reads as nothing stored', async () => {
    answer({ aiMode: 'MANAGED' }, { active: false });
    await expect(organizationService.getAiModeState()).resolves.toEqual({
      resolved: 'byo',
      stored: undefined,
    });
  });
});
