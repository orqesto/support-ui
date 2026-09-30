import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ObjectStorageConfigCard } from '../ObjectStorageConfigCard';

const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args) as unknown,
    post: (...args: unknown[]) => post(...args) as unknown,
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

const startTest = async () => {
  get.mockResolvedValue({
    data: {
      success: true,
      data: { source: 'platform', ownership: 'platform', driver: 's3', hasSecret: false },
    },
  });
  let settle: (value: unknown) => void = () => {};
  post.mockImplementationOnce(() => new Promise((resolve) => (settle = resolve)));
  render(<ObjectStorageConfigCard />);
  fireEvent.click(await screen.findByText('Bring your own S3'));
  fireEvent.change(screen.getByPlaceholderText('odly-attachments'), {
    target: { value: 'tested' },
  });
  fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
  return (value: unknown) =>
    act(async () => {
      settle({ data: { success: true, data: value } });
      await Promise.resolve();
    });
};

describe('Object storage — a test that lands after the form changed', () => {
  it('⛔ does not say "Connection OK" for a bucket it never tested', async () => {
    const land = await startTest();
    fireEvent.change(screen.getByPlaceholderText('odly-attachments'), {
      target: { value: 'other' },
    });
    await land({ ok: true, latencyMs: 7 });

    expect(post.mock.calls[0][1]).toMatchObject({ bucket: 'tested' });
    expect(screen.queryByText(/connection ok/i)).not.toBeInTheDocument();
  });

  it('CONTROL: a test nobody overtook reports', async () => {
    const land = await startTest();
    await land({ ok: true, latencyMs: 7 });
    expect(screen.getByText(/connection ok/i)).toBeInTheDocument();
  });
});
