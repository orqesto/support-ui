import { beforeEach, describe, expect, it, vi } from 'vitest';

const getStatusMock = vi.fn<() => Promise<unknown>>();

vi.mock('@/services/onboarding.service', () => ({
  onboardingService: {
    getStatus: (): Promise<unknown> => getStatusMock(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useOnboardingStore } from '../onboardingStore';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('onboardingStore', () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      status: 'unknown',
      onboarding: null,
      trial: null,
      fetchedForOrg: null,
    });
    getStatusMock.mockReset();
  });

  it('derives pending from an incomplete status payload', async () => {
    getStatusMock.mockResolvedValue({
      onboarding: { status: 'pending', currentStep: 2, startedAt: 'x' },
      isComplete: false,
      trial: { status: 'trialing', trialEndsAt: '2026-08-14T00:00:00.000Z' },
    });

    useOnboardingStore.getState().fetchOnce(7);
    await flush();

    const state = useOnboardingStore.getState();
    expect(state.status).toBe('pending');
    expect(state.onboarding?.currentStep).toBe(2);
    expect(state.trial?.status).toBe('trialing');
  });

  it('derives complete when the org predates the wizard (null onboarding)', async () => {
    getStatusMock.mockResolvedValue({ onboarding: null, isComplete: true, trial: null });

    useOnboardingStore.getState().fetchOnce(7);
    await flush();

    expect(useOnboardingStore.getState().status).toBe('complete');
  });

  it('dedupes fetches per org (second call is a no-op)', async () => {
    getStatusMock.mockResolvedValue({ onboarding: null, isComplete: true, trial: null });

    useOnboardingStore.getState().fetchOnce(7);
    await flush();
    useOnboardingStore.getState().fetchOnce(7);
    await flush();

    expect(getStatusMock).toHaveBeenCalledTimes(1);
  });

  it('refetches when the selected org changes', async () => {
    getStatusMock.mockResolvedValue({ onboarding: null, isComplete: true, trial: null });

    useOnboardingStore.getState().fetchOnce(7);
    await flush();
    useOnboardingStore.getState().fetchOnce(8);
    await flush();

    expect(getStatusMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing without an org selected', async () => {
    useOnboardingStore.getState().fetchOnce(null);
    await flush();
    expect(getStatusMock).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().status).toBe('unknown');
  });

  it('fails OPEN on fetch error (complete → no redirect loop, no wizard trap)', async () => {
    getStatusMock.mockRejectedValue(new Error('boom'));

    useOnboardingStore.getState().fetchOnce(7);
    await flush();

    expect(useOnboardingStore.getState().status).toBe('complete');
  });

  it('markComplete flips status so the wizard exits cleanly', () => {
    useOnboardingStore.setState({ status: 'pending' });
    useOnboardingStore.getState().markComplete();
    expect(useOnboardingStore.getState().status).toBe('complete');
  });
});
