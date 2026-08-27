/**
 * An org on Odly's managed storage must be able to ask whether it works.
 *
 * The card said where files live and stopped. `/api/integrations/test-storage` takes a
 * submitted BYO config, so it cannot answer for an org that submitted none — the same
 * blind spot as managed AI: a per-org surface enumerates BYO rows, and a platform-provided
 * resource has none.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ObjectStorageConfigCard } from '../ObjectStorageConfigCard';

const get = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args) as unknown,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Managed storage: the config endpoint reports the platform, not a customer bucket. */
const onManagedStorage = (health?: Record<string, unknown>) => {
  get.mockImplementation((url: string) => {
    if (url === '/api/integrations/storage/health') {
      if (!health) return Promise.reject(new Error('404'));
      return Promise.resolve({ data: { success: true, data: health } });
    }
    return Promise.resolve({
      data: { success: true, data: { source: 'platform', ownership: 'platform', driver: 's3', region: 'eu-central-1', hasSecret: false } },
    });
  });
};

describe('ObjectStorageConfigCard — managed storage health', () => {
  it('does not probe on mount', async () => {
    // It writes and deletes a real object. Cheap, but a side effect on the customer's
    // bucket, and not something to fire because a tab was opened.
    onManagedStorage({ ok: true, source: 'platform', driver: 's3', latencyMs: 42 });

    render(<ObjectStorageConfigCard />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls.some((call) => String(call[0]).includes('/storage/health'))).toBe(false);
  });

  it('reports a working backend when asked', async () => {
    onManagedStorage({ ok: true, source: 'platform', driver: 's3', latencyMs: 42 });

    render(<ObjectStorageConfigCard />);
    await userEvent.click(await screen.findByRole('button', { name: /check storage/i }));

    expect(await screen.findByText(/Working — wrote and read back in 42ms/)).toBeTruthy();
  });

  it('says what went wrong when it does not', async () => {
    onManagedStorage({
      ok: false,
      source: 'platform',
      driver: 's3',
      latencyMs: 900,
      error: 'The platform storage backend returned AccessDenied.',
    });

    render(<ObjectStorageConfigCard />);
    await userEvent.click(await screen.findByRole('button', { name: /check storage/i }));

    expect(await screen.findByText(/AccessDenied/)).toBeTruthy();
  });

  it('stays quiet against a backend that has no such route', async () => {
    // CONTROL for a deploy skew: this bundle ships from main on push and can reach a BE
    // that predates the endpoint. A red "not working" box for a missing route would be a
    // worse lie than saying nothing.
    onManagedStorage(undefined);

    render(<ObjectStorageConfigCard />);
    await userEvent.click(await screen.findByRole('button', { name: /check storage/i }));

    await waitFor(() =>
      expect(get.mock.calls.some((call) => String(call[0]).includes('/storage/health'))).toBe(true)
    );
    expect(screen.queryByText(/Not working/)).toBeNull();
  });
});
