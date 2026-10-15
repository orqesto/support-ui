/**
 * Platform Defaults → Custom API health (2026-10-14): two whole numbers ≥ 1, saved with PUT
 * /api/admin/platform/settings/custom-api. An older backend: no inputs, only why.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const puts: { url: string; body: unknown }[] = [];
let putFails: Error | null = null;
const toastFailure = vi.fn<(scope: string, error: unknown) => void>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (url: string, body: unknown) => {
      puts.push({ url, body });
      return putFails ? Promise.reject(putFails) : Promise.resolve({ data: { success: true } });
    },
    get: () => new Promise(() => undefined),
  },
}));
vi.mock('@/lib/toast', () => ({
  toast: {
    failure: (scope: string, error: unknown) => toastFailure(scope, error),
    success: () => undefined,
  },
}));

const { CustomApiHealthCard, CUSTOM_API_HEALTH_NOT_DEPLOYED } = await import(
  '../CustomApiHealthCard'
);
const { normalizeCustomApi } = await import('@/services/platformSettings.service');

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

const SETTING = {
  health: {
    noMatchStreak: { value: 20, source: 'db' as const },
    okWindowDays: { value: 7, source: 'default' as const },
  },
};

beforeEach(() => {
  puts.length = 0;
  putFails = null;
  toastFailure.mockReset();
});
afterEach(cleanup);

describe('CustomApiHealthCard', () => {
  it('shows the saved values and saves both with PUT /settings/custom-api', async () => {
    wrap(<CustomApiHealthCard customApi={SETTING} />);
    expect(screen.getByLabelText(/Nothing found in a row/)).toHaveValue(20);
    fireEvent.change(screen.getByLabelText(/Nothing found in a row/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Recent means within/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: '/api/admin/platform/settings/custom-api',
      body: { noMatchStreak: 3, okWindowDays: 2 },
    });
  });

  it('refuses 0, a fraction or blank without calling the server', () => {
    wrap(<CustomApiHealthCard customApi={SETTING} />);
    for (const bad of ['0', '1.5', '']) {
      fireEvent.change(screen.getByLabelText(/Nothing found in a row/), { target: { value: bad } });
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    }
    expect(puts).toHaveLength(0);
  });

  it('a route the server does not have (404 or 400) is reported, not swallowed', async () => {
    for (const status of [404, 400]) {
      putFails = Object.assign(new Error('nope'), { status });
      toastFailure.mockReset();
      const { unmount } = wrap(<CustomApiHealthCard customApi={SETTING} />);
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(toastFailure).toHaveBeenCalledTimes(1));
      expect(toastFailure.mock.calls[0][0]).toMatch(/custom API health/);
      unmount();
    }
  });

  it('an older backend: no inputs, says it arrives with the next backend release', () => {
    wrap(<CustomApiHealthCard customApi={undefined} />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText(CUSTOM_API_HEALTH_NOT_DEPLOYED)).toBeInTheDocument();
  });
});

describe('normalizeCustomApi', () => {
  it('keeps two whole numbers with known sources; any other shape is absent', () => {
    expect(normalizeCustomApi(SETTING)).toEqual(SETTING);
    expect(
      normalizeCustomApi({
        health: {
          noMatchStreak: { value: '20', source: 'db' },
          okWindowDays: { value: 7, source: 'db' },
        },
      })
    ).toBeUndefined();
    expect(
      normalizeCustomApi({ health: { noMatchStreak: { value: 20, source: 'db' } } })
    ).toBeUndefined();
    expect(normalizeCustomApi(undefined)).toBeUndefined();
  });

  it('an unknown source reads as the default', () => {
    expect(
      normalizeCustomApi({
        health: {
          noMatchStreak: { value: 5, source: 'somewhere' },
          okWindowDays: { value: 7, source: 'db' },
        },
      })?.health.noMatchStreak.source
    ).toBe('default');
  });
});
