/** Platform Defaults -> Thread presence (2026-11-09): units, partial save, inline 400. */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const puts: { url: string; body: unknown }[] = [];
let putError: Error | null = null;
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (url: string, body: unknown) => {
      puts.push({ url, body });
      return putError ? Promise.reject(putError) : Promise.resolve({ data: { success: true } });
    },
    get: () => new Promise(() => undefined),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { failure: () => undefined, success: () => undefined } }));

const { PresenceCard } = await import('../PresenceCard');
const { normalizePresence } = await import('@/services/presenceSettings');

const field = (value: number, min: number, max: number, source = 'default') => ({
  value,
  source,
  min,
  max,
});
const RAW = {
  enabled: { value: true, source: 'default' },
  heartbeatMs: field(15000, 5000, 60000),
  expiryMs: field(45000, 10000, 180000, 'db'),
  writingIdleMs: field(8000, 2000, 60000),
  awayAfterMs: field(120000, 30000, 900000),
  listFlushMs: field(2000, 500, 10000),
  ticketWatchCap: field(50, 1, 200),
};
const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PresenceCard presence={normalizePresence(RAW)} />
    </QueryClientProvider>
  );

beforeEach(() => {
  puts.length = 0;
  putError = null;
});
afterEach(cleanup);

describe('PresenceCard', () => {
  it('renders values in seconds, hints and a default/saved badge per field', () => {
    wrap();
    expect(screen.getByRole('heading', { name: 'Thread presence' })).toBeInTheDocument();
    expect(screen.getByLabelText('Heartbeat (seconds)')).toHaveValue(15);
    expect(screen.getByLabelText('Expiry (seconds)')).toHaveValue(45);
    expect(screen.getByLabelText('Threads watched per ticket list')).toHaveValue(50);
    expect(screen.getByLabelText('Enabled')).toBeChecked();
    expect(screen.getAllByText('saved')).toHaveLength(1);
    expect(screen.getAllByText('default')).toHaveLength(6);
    expect(screen.getByText(/Allowed: 5 to 60\./)).toBeInTheDocument();
  });

  it('saves only the changed fields, seconds converted to ms', async () => {
    wrap();
    fireEvent.change(screen.getByLabelText('Heartbeat (seconds)'), { target: { value: '10.5' } });
    fireEvent.change(screen.getByLabelText('Threads watched per ticket list'), {
      target: { value: '80' },
    });
    fireEvent.click(screen.getByLabelText('Enabled'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({
      presence: { heartbeatMs: 10500, ticketWatchCap: 80, enabled: false },
    });
  });

  it('keeps Save off with nothing changed or a value outside the bounds', () => {
    wrap();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(screen.getByLabelText('Heartbeat (seconds)'), { target: { value: '2' } });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Enter a number from 5 to 60.')).toBeInTheDocument();
  });

  it('shows a 400 naming the fields and keeps what was typed', async () => {
    putError = Object.assign(new Error('Expiry must be at least twice the heartbeat'), {
      status: 400,
      data: {
        error: 'Expiry must be at least twice the heartbeat',
        code: 'VALIDATION_FAILED',
        fields: ['expiryMs', 'heartbeatMs'],
      },
    });
    wrap();
    fireEvent.change(screen.getByLabelText('Heartbeat (seconds)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('(check: expiryMs, heartbeatMs)');
    expect(screen.getByLabelText('Heartbeat (seconds)')).toHaveValue(40);
  });

  it('CONTROL: an older backend without the block shows only why', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PresenceCard presence={normalizePresence(undefined)} />
      </QueryClientProvider>
    );
    expect(screen.queryByLabelText('Heartbeat (seconds)')).toBeNull();
    expect(screen.getByText(/arrive with the next backend release/)).toBeInTheDocument();
  });
});
