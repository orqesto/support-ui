import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DatabaseConfigCard } from '../DatabaseConfigCard';

const { get, post } = vi.hoisted(() => ({
  get: vi.fn<(...args: unknown[]) => unknown>(),
  post: vi.fn<(...args: unknown[]) => unknown>(),
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), failure: vi.fn() } }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OK = {
  ok: true,
  latencyMs: 12,
  serverVersion: 'PostgreSQL 16.4',
  empty: true,
  canCreate: true,
  vectorAvailable: true,
};

/**
 * The URL field already cleared the result on every keystroke; the gap was the probe still in
 * flight — it landed after the edit and printed "Connection OK" under a URL it never dialled.
 */
const startTest = async () => {
  get.mockResolvedValue({
    data: {
      success: true,
      data: {
        mode: 'managed',
        source: 'platform',
        hostMasked: null,
        provenance: null,
        region: null,
        status: 'active',
        schemaVersion: null,
        verifiedAt: null,
        provisionedAt: null,
        sharedRetentionUntil: null,
        updatedAt: '2026-09-07T00:00:00.000Z',
        move: null,
      },
    },
  });
  let settle: (value: unknown) => void = () => {};
  post.mockImplementationOnce(() => new Promise((resolve) => (settle = resolve)));
  render(<DatabaseConfigCard />);
  await screen.findByText(/managed database/);
  fireEvent.click(screen.getByRole('button', { name: /bring your own postgres/i }));
  fireEvent.change(screen.getByLabelText(/Connection string/), {
    target: { value: 'postgres://u:p@tested.example.com:5432/odly' },
  });
  fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
  return (value: unknown) =>
    act(async () => {
      settle({ data: { success: true, data: value } });
      await Promise.resolve();
    });
};

describe('Database — a test that lands after the URL changed', () => {
  it('⛔ does not report on a URL it never dialled', async () => {
    const land = await startTest();
    fireEvent.change(screen.getByLabelText(/Connection string/), {
      target: { value: 'postgres://u:p@other.example.com:5432/odly' },
    });
    await land(OK);
    expect(screen.queryByTestId('database-test-result')).not.toBeInTheDocument();
  });

  it('CONTROL: a test nobody overtook reports', async () => {
    const land = await startTest();
    await land(OK);
    expect(screen.getByTestId('database-test-result')).toHaveTextContent('PostgreSQL 16.4');
  });
});
