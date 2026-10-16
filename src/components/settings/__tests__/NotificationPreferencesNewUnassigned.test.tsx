import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const get = vi.fn<(url: string) => Promise<unknown>>();
const put = vi.fn<(url: string, body: unknown) => Promise<unknown>>(() => Promise.resolve({ data: {} }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string) => get(url), put: (url: string, body: unknown) => put(url, body) },
}));

const { NotificationPreferencesSettings } = await import('../NotificationPreferencesSettings');

const toggle = () => {
  const row = screen.getByText('New unassigned messages').closest('div');
  if (!row) throw new Error('row missing');
  return within(row).getByRole('switch');
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('New unassigned messages setting (#957 §3.6)', () => {
  // This case cannot prove the field is READ — ON is also the default before the GET resolves.
  // It pins only that the row renders against an old backend; "reads a stored OFF" is the reading test.
  it('an old backend (no field) still renders the row, ON', async () => {
    get.mockResolvedValue({ data: { data: { minSeverity: 'warning' } } });
    render(<NotificationPreferencesSettings />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(toggle().getAttribute('aria-checked')).toBe('true');
  });

  it('reads a stored OFF', async () => {
    get.mockResolvedValue({ data: { data: { notifyNewUnassigned: false } } });
    render(<NotificationPreferencesSettings />);
    await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('false'));
  });

  it('switching it off PUTs exactly that field', async () => {
    get.mockResolvedValue({ data: { data: {} } });
    render(<NotificationPreferencesSettings />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    fireEvent.click(toggle());
    expect(put).toHaveBeenCalledWith('/api/users/me/notification-preferences', { notifyNewUnassigned: false });
  });

  it('a failed save rolls the switch back', async () => {
    get.mockResolvedValue({ data: { data: {} } });
    put.mockRejectedValueOnce(new Error('500'));
    render(<NotificationPreferencesSettings />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    fireEvent.click(toggle());
    await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('true'));
  });
});
