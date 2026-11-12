import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { chooseOption } from '@/test/chooseOption';

const put = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (...args: unknown[]) => put(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

const { SLAConfigSettings } = await import('../SLAConfigSettings');

const row = (type: string, key: string, first: number, minutes: number | null) => ({
  type,
  key,
  firstResponseMinutes: first,
  resolutionMinutes: minutes,
  resolutionHours: minutes === null ? null : Math.ceil(minutes / 60),
  isCustom: false,
});
const newBackend = [
  row('ticket', 'critical', 15, 240),
  row('message', 'critical', 15, 240),
  row('message', 'low', 240, 4320),
  row('message', 'email', 60, null),
];
const oldBackend = [
  {
    type: 'ticket',
    key: 'critical',
    firstResponseMinutes: 15,
    resolutionHours: 4,
    isCustom: false,
  },
  {
    type: 'message',
    key: 'email',
    firstResponseMinutes: 60,
    resolutionHours: null,
    isCustom: false,
  },
];

describe('SLA settings: tickets, threads by priority, threads by channel', () => {
  beforeEach(() => {
    put.mockReset();
    get.mockReset();
    put.mockResolvedValue({ data: { success: true } });
  });

  it('shows the three tables against a new backend, values in their largest unit', async () => {
    get.mockResolvedValue({ data: { success: true, data: newBackend } });
    render(<SLAConfigSettings />);
    expect(await screen.findByText('Thread SLA by priority')).toBeInTheDocument();
    expect(screen.getByText('Ticket SLA')).toBeInTheDocument();
    expect(screen.getByText('Thread SLA by channel')).toBeInTheDocument();
    // 4320 minutes → 3 days.
    expect(
      screen.getByRole('spinbutton', { name: 'Thread SLA by priority Low resolution' })
    ).toHaveValue(3);
  });

  it('hides the thread-priority table and channel resolution against an older backend', async () => {
    get.mockResolvedValue({ data: { success: true, data: oldBackend } });
    render(<SLAConfigSettings />);
    expect(await screen.findByText('Thread SLA by channel')).toBeInTheDocument();
    expect(screen.queryByText('Thread SLA by priority')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('spinbutton', { name: 'Thread SLA by channel Email resolution' })
    ).not.toBeInTheDocument();
  });

  it('setting critical thread resolution to 2 hours saves resolutionMinutes 120', async () => {
    get.mockResolvedValue({ data: { success: true, data: newBackend } });
    render(<SLAConfigSettings />);
    const amount = await screen.findByRole('spinbutton', {
      name: 'Thread SLA by priority Critical resolution',
    });
    fireEvent.change(amount, { target: { value: '2' } });
    await chooseOption(
      screen.getByRole('combobox', { name: 'Thread SLA by priority Critical resolution unit' }),
      'hours'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0][1] as { configs: Array<Record<string, unknown>> };
    expect(
      body.configs.find((cfg) => cfg.type === 'message' && cfg.key === 'critical')
    ).toMatchObject({
      resolutionMinutes: 120,
      resolutionHours: 2,
    });
  });

  it('a channel cap can be set and emptied (no cap)', async () => {
    get.mockResolvedValue({ data: { success: true, data: newBackend } });
    render(<SLAConfigSettings />);
    const cap = await screen.findByRole('spinbutton', {
      name: 'Thread SLA by channel Email resolution',
    });
    expect(cap).toHaveValue(null);
    fireEvent.change(cap, { target: { value: '5' } });
    fireEvent.change(cap, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0][1] as { configs: Array<Record<string, unknown>> };
    expect(body.configs.find((cfg) => cfg.key === 'email')).toMatchObject({
      resolutionMinutes: null,
    });
  });

  it('a load error is shown', async () => {
    get.mockRejectedValue(new Error('boom'));
    render(<SLAConfigSettings />);
    expect(await screen.findByText(/boom|Failed to load SLA configuration/)).toBeInTheDocument();
  });
});
