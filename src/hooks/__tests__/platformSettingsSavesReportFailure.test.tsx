/**
 * A rejected platform-settings save has to SAY SO.
 *
 * Observed live on staging 2026-09-11: Console → Platform Defaults → Managed AI, save an
 * invalid Bedrock role ARN. The server answers 400 with `fields: ['bedrockRoleArn']`, the
 * button flips to "Loading…" and back, and NOTHING is rendered — no toast, no inline
 * message, no banner. `ManagedAiDefaultsCard` passes `{ onSuccess }` only, the hook had no
 * `onError`, and `main.tsx` installs no MutationCache handler, so the error had nowhere to go.
 *
 * That is the screen #376 was written for, and it was still silent afterwards: naming the
 * field in the message does nothing while the message is discarded.
 *
 * ⛔ The last two tests are the ones that stop this being "add onError to everything". Two of
 * these six mutations are reported by their CALLER — a second toast on top would be a
 * regression, not a fix.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const toastError = vi.fn<(message: string) => void>();
// `failure` runs the REAL formatError, so these tests assert the sentence a person reads
// rather than the arguments a mock was handed.
vi.mock('@/lib/toast', async () => {
  const { formatError } = await import('@/lib/errorMessages');
  return {
    toast: {
      error: (message: string): void => toastError(message),
      success: vi.fn(),
      failure: (scope: string, err: unknown): void => toastError(formatError(scope, err)),
    },
  };
});

const updateAi = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const updateStorage = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const clearSecret = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const setSecret = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const testStorage = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/platformSettings.service', () => ({
  platformSettingsService: {
    updateAi: (input: unknown): Promise<unknown> => updateAi(input),
    updateStorage: (input: unknown): Promise<unknown> => updateStorage(input),
    clearSecret: (key: unknown): Promise<unknown> => clearSecret(key),
    setSecret: (key: unknown, value: unknown): Promise<unknown> => setSecret(key, value),
    testStorage: (input: unknown): Promise<unknown> => testStorage(input),
  },
}));

const hooks = await import('../usePlatformSettings');

/** What the api-client interceptor hands a caller for a rejected validation. */
const rejected = () =>
  Promise.reject(
    Object.assign(new Error('Validation error (check: bedrockRoleArn)'), {
      status: 400,
      data: { error: 'Validation error', code: 'VALIDATION_FAILED', fields: ['bedrockRoleArn'] },
    })
  );

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [updateAi, updateStorage, clearSecret, setSecret, testStorage]) {
    fn.mockImplementation(rejected);
  }
});

const run = (hook: () => { mutate: (input: never) => void }): void => {
  const { result } = renderHook(hook, { wrapper });
  act(() => result.current.mutate({} as never));
};

/** Give a settled promise chain a turn to run, for the two "nothing is toasted" controls. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('a rejected platform-settings save reports itself', () => {
  it('THE DEFECT: Managed AI defaults said nothing at all', async () => {
    run(() => hooks.useUpdatePlatformAi());
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toContain('bedrockRoleArn');
  });

  it('Default Storage defaults, the same card pattern, the same hole', async () => {
    run(() => hooks.useUpdatePlatformStorage());
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it('clearing a stored credential reports a refusal', async () => {
    run(() => hooks.useClearPlatformSecret());
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  /**
   * NEGATIVE CONTROL. `SecretField.save` catches this rejection and renders it beside the
   * input it belongs to; a toast as well would report one refusal twice.
   */
  it('does NOT toast a refused secret — the field renders that itself', async () => {
    run(() => hooks.useSetPlatformSecret());
    await settle();
    expect(toastError).not.toHaveBeenCalled();
  });

  /**
   * NEGATIVE CONTROL. `DefaultStorageCard.runTest` passes its own `onError` and renders the
   * outcome as a test result, which is the whole point of a probe.
   */
  it('does NOT toast a failed storage probe — the card shows the result', async () => {
    run(() => hooks.useTestPlatformStorage());
    await settle();
    expect(toastError).not.toHaveBeenCalled();
  });
});
