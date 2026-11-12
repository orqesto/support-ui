import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { chooseOption, listOptions } from '@/test/chooseOption';
import type * as DataTableModule from '@/components/ui/DataTable';

const put = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (...args: unknown[]) => put(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

// The real DataTable, counted: the target tables must come from the design system.
const dataTableRenders = vi.fn();
vi.mock('@/components/ui/DataTable', async (importOriginal) => {
  const actual = await importOriginal<typeof DataTableModule>();
  return {
    ...actual,
    DataTable: (props: Parameters<typeof actual.DataTable>[0]) => {
      dataTableRenders();
      return actual.DataTable(props);
    },
  };
});

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

  it('draws each target table with the design-system DataTable', async () => {
    dataTableRenders.mockClear();
    get.mockResolvedValue({ data: { success: true, data: newBackend } });
    render(<SLAConfigSettings />);
    expect(await screen.findByText('Thread SLA by priority')).toBeInTheDocument();
    expect(dataTableRenders).toHaveBeenCalled();
    expect(screen.getAllByRole('columnheader', { name: 'First response' })).toHaveLength(3);
    expect(screen.getByRole('columnheader', { name: 'Resolution (optional)' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await screen.findByText('Saved');
    expect(
      (put.mock.calls[0][1] as { configs: Array<Record<string, unknown>> }).configs.find(
        (cfg) => cfg.key === 'email'
      )?.resolutionMinutes
    ).not.toBeNull();
    // Emptying the saved cap is a change again: it is sent as "no cap".
    fireEvent.change(cap, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    const body = put.mock.calls[1][1] as { configs: Array<Record<string, unknown>> };
    expect(body.configs.find((cfg) => cfg.key === 'email')).toMatchObject({
      resolutionMinutes: null,
    });
  });

  it('a load error is shown', async () => {
    get.mockRejectedValue(new Error('boom'));
    render(<SLAConfigSettings />);
    expect(await screen.findByText(/boom|Failed to load SLA configuration/)).toBeInTheDocument();
  });

  it('a value the field refuses blocks Save with a message (review)', async () => {
    get.mockResolvedValue({ data: { success: true, data: newBackend } });
    render(<SLAConfigSettings />);
    const first = await screen.findByRole('spinbutton', {
      name: 'Ticket SLA Critical first response',
    });
    fireEvent.change(first, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Fix the highlighted values/)).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it('against an older backend, ticket resolution offers hours and days only (it stores hours)', async () => {
    get.mockResolvedValue({ data: { success: true, data: oldBackend } });
    render(<SLAConfigSettings />);
    const control = await screen.findByRole('combobox', {
      name: 'Ticket SLA Critical resolution unit',
    });
    expect(await listOptions(control)).toEqual(['hours', 'days']);
  });

  describe('Save sends only what changed (a sent row is stored as custom)', () => {
    const configsSent = (call = 0) =>
      (put.mock.calls[call][1] as { configs: Array<Record<string, unknown>> }).configs;

    it('changing one row sends that row only', async () => {
      get.mockResolvedValue({ data: { success: true, data: newBackend } });
      render(<SLAConfigSettings />);
      const first = await screen.findByRole('spinbutton', {
        name: 'Ticket SLA Critical first response',
      });
      fireEvent.change(first, { target: { value: '30' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      expect(configsSent()).toHaveLength(1);
      expect(configsSent()[0]).toMatchObject({ type: 'ticket', key: 'critical' });
    });

    it('an unchanged custom row is not re-sent (the backend keeps it as stored)', async () => {
      const withCustom = newBackend.map((entry) =>
        entry.type === 'message' && entry.key === 'low' ? { ...entry, isCustom: true } : entry
      );
      get.mockResolvedValue({ data: { success: true, data: withCustom } });
      render(<SLAConfigSettings />);
      const first = await screen.findByRole('spinbutton', {
        name: 'Ticket SLA Critical first response',
      });
      fireEvent.change(first, { target: { value: '30' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      expect(configsSent().map((cfg) => [cfg.type, cfg.key])).toEqual([['ticket', 'critical']]);
    });

    it('Save with no change sends no request and says so', async () => {
      get.mockResolvedValue({ data: { success: true, data: newBackend } });
      render(<SLAConfigSettings />);
      await screen.findByText('Ticket SLA');
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText('No changes to save')).toBeInTheDocument();
      expect(put).not.toHaveBeenCalled();
    });

    it('a refused value after "No changes to save" shows only the fix-it error (review)', async () => {
      get.mockResolvedValue({ data: { success: true, data: newBackend } });
      render(<SLAConfigSettings />);
      const first = await screen.findByRole('spinbutton', {
        name: 'Ticket SLA Critical first response',
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText('No changes to save')).toBeInTheDocument();
      fireEvent.change(first, { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText(/Fix the highlighted values/)).toBeInTheDocument();
      expect(screen.queryByText('No changes to save')).not.toBeInTheDocument();
    });

    it('after a save, the saved values are the new baseline: saving again sends nothing', async () => {
      get.mockResolvedValue({ data: { success: true, data: newBackend } });
      render(<SLAConfigSettings />);
      const first = await screen.findByRole('spinbutton', {
        name: 'Ticket SLA Critical first response',
      });
      fireEvent.change(first, { target: { value: '30' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('(custom)')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText('No changes to save')).toBeInTheDocument();
      expect(put).toHaveBeenCalledTimes(1);
    });
  });
});
