import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Type-only (erased at runtime, so it does not defeat vi.resetModules below).
import type { useOnboardingStore as UseOnboardingStoreHook } from '../onboardingStore';

const getStatusMock = vi.fn<() => Promise<unknown>>();

vi.mock('@/services/onboarding.service', () => ({
  onboardingService: {
    getStatus: (): Promise<unknown> => getStatusMock(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

let useOnboardingStore: typeof UseOnboardingStoreHook;

// Drain pending microtasks AND the store's retry-backoff timers. Under fake
// timers this settles resolved fetches and advances the fail-open retry ladder.
const flush = () => vi.runAllTimersAsync();

describe('onboardingStore', () => {
  beforeEach(async () => {
    // Re-import for a fresh module so the store's module-level `inFlightForOrg`
    // guard resets between tests — otherwise a fetch left in flight (e.g. the
    // fail-open retry ladder) leaks its org and poisons the next test's guard.
    vi.resetModules();
    vi.useFakeTimers();
    getStatusMock.mockReset();
    ({ useOnboardingStore } = await import('../onboardingStore'));
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('surfaces managedAiAvailable from the status payload (drives the AI step)', async () => {
    getStatusMock.mockResolvedValue({
      onboarding: { status: 'pending', currentStep: 2, startedAt: 'x' },
      isComplete: false,
      trial: null,
      managedAiAvailable: true,
    });

    useOnboardingStore.getState().fetchOnce(7);
    await flush();

    expect(useOnboardingStore.getState().managedAiAvailable).toBe(true);
  });

  it('defaults managedAiAvailable to false when the payload omits it', async () => {
    getStatusMock.mockResolvedValue({ onboarding: null, isComplete: true, trial: null });

    useOnboardingStore.getState().fetchOnce(7);
    await flush();

    expect(useOnboardingStore.getState().managedAiAvailable).toBe(false);
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

  it('org switch mid-flight: fetches org B and discards the stale org-A response', async () => {
    // Deferred promises so we control resolution order.
    let resolveA!: (v: unknown) => void;
    let resolveB!: (v: unknown) => void;
    getStatusMock
      .mockImplementationOnce(() => new Promise((resolve) => (resolveA = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveB = resolve)));

    useOnboardingStore.getState().fetchOnce(7); // org A in flight
    useOnboardingStore.getState().fetchOnce(8); // switch to B before A resolves
    expect(getStatusMock).toHaveBeenCalledTimes(2); // B's fetch was NOT swallowed

    // A resolves LATE with pending — must be discarded (fetchedForOrg is now 8).
    resolveA({
      onboarding: { status: 'pending', currentStep: 1, startedAt: 'x' },
      isComplete: false,
      trial: { status: 'trialing', trialEndsAt: 'a' },
    });
    await flush();
    expect(useOnboardingStore.getState().status).not.toBe('pending');

    // B resolves with complete — this is the one that sticks.
    resolveB({ onboarding: null, isComplete: true, trial: null });
    await flush();
    expect(useOnboardingStore.getState().status).toBe('complete');
    expect(useOnboardingStore.getState().fetchedForOrg).toBe(8);
  });

  it('clears prior-org trial/onboarding immediately when a new org fetch starts', () => {
    useOnboardingStore.setState({
      status: 'pending',
      onboarding: { status: 'pending', currentStep: 3, startedAt: 'x' },
      trial: { status: 'trialing', trialEndsAt: 'a' },
      fetchedForOrg: 7,
    });
    getStatusMock.mockImplementation(() => new Promise(() => {})); // never resolves

    useOnboardingStore.getState().fetchOnce(9);
    // Stale org-7 data must be gone before org-9's response arrives.
    expect(useOnboardingStore.getState().status).toBe('unknown');
    expect(useOnboardingStore.getState().trial).toBeNull();
    expect(useOnboardingStore.getState().onboarding).toBeNull();
  });
});
