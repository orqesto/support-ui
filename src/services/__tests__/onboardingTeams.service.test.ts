import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

import {
  getOnboardingTeams,
  saveOnboardingTeams,
  SetupInProgressError,
  OnboardingCompleteError,
} from '@/services/onboarding.service';

/** The api-client interceptor rethrows a fresh Error carrying status + data (not .response). */
const apiError = (status: number, code: string) =>
  Object.assign(new Error(code), { status, data: { error: code, code } });

describe('onboarding teams picker service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getOnboardingTeams reads the offered list from the teams path', async () => {
    const data = {
      offered: [
        {
          presetKey: 'billing',
          name: 'Billing',
          description: null,
          itemCount: 4,
          teamId: null,
          active: false,
        },
      ],
      preTicked: ['billing'],
      editable: true,
    };
    get.mockResolvedValue({ data: { success: true, data } });
    await expect(getOnboardingTeams()).resolves.toEqual(data);
    expect(get).toHaveBeenCalledWith('/api/organizations/onboarding/teams');
  });

  it('404 NOT_AVAILABLE resolves null (picker not shown)', async () => {
    get.mockRejectedValue(apiError(404, 'NOT_AVAILABLE'));
    await expect(getOnboardingTeams()).resolves.toBeNull();
  });

  it('other read failures still throw', async () => {
    get.mockRejectedValue(apiError(500, 'INTERNAL'));
    await expect(getOnboardingTeams()).rejects.toThrow();
    get.mockRejectedValue(apiError(404, 'SOMETHING_ELSE'));
    await expect(getOnboardingTeams()).rejects.toThrow();
  });

  it('saveOnboardingTeams posts the keys and returns the results', async () => {
    const results = [{ presetKey: 'billing', outcome: 'created', teamId: 7 }];
    post.mockResolvedValue({ data: { success: true, data: { results } } });
    await expect(saveOnboardingTeams(['billing'])).resolves.toEqual(results);
    expect(post).toHaveBeenCalledWith('/api/organizations/onboarding/teams', {
      presetKeys: ['billing'],
    });
  });

  it('409 SETUP_IN_PROGRESS throws SetupInProgressError', async () => {
    post.mockRejectedValue(apiError(409, 'SETUP_IN_PROGRESS'));
    await expect(saveOnboardingTeams(['billing'])).rejects.toBeInstanceOf(SetupInProgressError);
  });

  it('409 ONBOARDING_COMPLETE throws OnboardingCompleteError', async () => {
    post.mockRejectedValue(apiError(409, 'ONBOARDING_COMPLETE'));
    await expect(saveOnboardingTeams([])).rejects.toBeInstanceOf(OnboardingCompleteError);
  });

  it('503 PICK_LOCK_UNAVAILABLE throws a plain error carrying the code', async () => {
    post.mockRejectedValue(apiError(503, 'PICK_LOCK_UNAVAILABLE'));
    const err = await saveOnboardingTeams(['billing']).catch((caught: unknown) => caught);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SetupInProgressError);
    expect((err as { code?: string }).code).toBe('PICK_LOCK_UNAVAILABLE');
  });

  it('an unrelated 409 is rethrown untouched', async () => {
    const original = apiError(409, 'OTHER');
    post.mockRejectedValue(original);
    await expect(saveOnboardingTeams(['billing'])).rejects.toBe(original);
  });
});
