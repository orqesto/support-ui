import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useRefetchPlatformSettings } from '../usePlatformSettings';

/**
 * The console's "fetch the settings again" (a reset whose own refetch never came): only the
 * settings query itself — a failing sibling under the same key prefix must not fail it.
 */
describe('useRefetchPlatformSettings', () => {
  const mount = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const settings = vi.fn(() => Promise.resolve({ ok: true }));
    const models = vi.fn(() => Promise.reject(new Error('models down')));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    // Mounted as the console mounts them: the settings query and a sibling under its key prefix.
    const hook = renderHook(
      () => {
        useQuery({ queryKey: ['platform', 'settings'], queryFn: settings });
        useQuery({ queryKey: ['platform', 'settings', 'ai-models'], queryFn: models });
        return useRefetchPlatformSettings();
      },
      { wrapper }
    );
    return { hook, settings, models };
  };

  it('refetches the settings query only; a failing sibling query does not reject it', async () => {
    const { hook, settings, models } = mount();
    await vi.waitFor(() => expect(models).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(settings).toHaveBeenCalledTimes(1));
    await expect(hook.result.current()).resolves.toBeUndefined();
    expect(settings).toHaveBeenCalledTimes(2);
    expect(models).toHaveBeenCalledTimes(1);
  });

  it('rejects when the settings fetch itself fails', async () => {
    const { hook, settings } = mount();
    await vi.waitFor(() => expect(settings).toHaveBeenCalledTimes(1));
    // Let the first read land before the refetch.
    await new Promise((resolve) => setTimeout(resolve, 20));
    settings.mockRejectedValueOnce(new Error('offline'));
    await expect(hook.result.current()).rejects.toThrow('offline');
  });
});
