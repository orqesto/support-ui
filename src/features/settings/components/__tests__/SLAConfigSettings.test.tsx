import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { chooseOption, listOptions } from '@/test/chooseOption';
import type * as DataTableModule from '@/components/ui/DataTable';

const put = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const del = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (...args: unknown[]) => put(...args),
    get: (...args: unknown[]) => get(...args),
    delete: (...args: unknown[]) => del(...args),
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
    del.mockReset();
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

  /** A backend that sends per-field override flags (and so keeps omitted fields, and resets). */
  const perField = (custom: Record<string, [boolean, boolean]> = {}) =>
    newBackend.map((entry) => {
      const flags = custom[`${entry.type}:${entry.key}`] ?? [false, false];
      return {
        ...entry,
        isCustom: flags[0] || flags[1],
        firstResponseIsCustom: flags[0],
        resolutionIsCustom: flags[1],
      };
    });
  const configsSent = (call = 0) =>
    (put.mock.calls[call][1] as { configs: Array<Record<string, unknown>> }).configs;

  describe('L1: Save sends only the changed field', () => {
    it('changing a first response sends that field only: the resolution is omitted', async () => {
      get.mockResolvedValue({ data: { success: true, data: perField() } });
      render(<SLAConfigSettings />);
      const first = await screen.findByRole('spinbutton', {
        name: 'Ticket SLA Critical first response',
      });
      fireEvent.change(first, { target: { value: '30' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      expect(configsSent()).toEqual([
        { type: 'ticket', key: 'critical', firstResponseMinutes: 30 },
      ]);
    });

    it('changing a resolution sends that field only: the first response is omitted', async () => {
      get.mockResolvedValue({ data: { success: true, data: perField() } });
      render(<SLAConfigSettings />);
      const amount = await screen.findByRole('spinbutton', {
        name: 'Thread SLA by priority Low resolution',
      });
      fireEvent.change(amount, { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      // 2 in the field's unit (days, as 4320 minutes was shown) = 2880 minutes.
      expect(configsSent()).toEqual([
        { type: 'message', key: 'low', resolutionMinutes: 2880, resolutionHours: 48 },
      ]);
    });

    it('CONTROL: an older backend (no per-field flags) is still sent both fields', async () => {
      get.mockResolvedValue({ data: { success: true, data: newBackend } });
      render(<SLAConfigSettings />);
      const first = await screen.findByRole('spinbutton', {
        name: 'Ticket SLA Critical first response',
      });
      fireEvent.change(first, { target: { value: '30' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      expect(configsSent()[0]).toMatchObject({ firstResponseMinutes: 30, resolutionMinutes: 240 });
    });
  });

  describe('L2: Reset to default per row', () => {
    const resetButton = (name: string) => screen.queryByRole('button', { name });

    it('only a row with an override offers it', async () => {
      get.mockResolvedValue({
        data: { success: true, data: perField({ 'message:low': [false, true] }) },
      });
      render(<SLAConfigSettings />);
      expect(
        await screen.findByRole('button', { name: 'Reset Thread SLA by priority Low to default' })
      ).toBeInTheDocument();
      expect(resetButton('Reset Thread SLA by priority Critical to default')).toBeNull();
      expect(resetButton('Reset Ticket SLA Critical to default')).toBeNull();
      // The overridden field is marked; the row's other field is not.
      expect(screen.getAllByText('custom')).toHaveLength(1);
    });

    it('CONTROL: an older backend (no DELETE route) offers no reset, even on a custom row', async () => {
      get.mockResolvedValue({
        data: {
          success: true,
          data: newBackend.map((entry) =>
            entry.key === 'low' ? { ...entry, isCustom: true } : entry
          ),
        },
      });
      render(<SLAConfigSettings />);
      expect(await screen.findByText('(custom)')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /to default/ })).toBeNull();
    });

    it('DELETEs the row, shows the defaults it answers with, and drops that row’s unsaved edit only', async () => {
      get.mockResolvedValue({
        data: {
          success: true,
          data: perField({ 'message:low': [true, false] }).map((entry) =>
            entry.key === 'low' && entry.type === 'message'
              ? { ...entry, firstResponseMinutes: 10 }
              : entry
          ),
        },
      });
      let answer: (value: unknown) => void = () => undefined;
      del.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      render(<SLAConfigSettings />);
      const lowFirst = await screen.findByRole('spinbutton', {
        name: 'Thread SLA by priority Low first response',
      });
      expect(lowFirst).toHaveValue(10);
      // Unsaved edits: one on the row being reset, one on another row.
      fireEvent.change(lowFirst, { target: { value: '0' } });
      const ticketFirst = screen.getByRole('spinbutton', {
        name: 'Ticket SLA Critical first response',
      });
      fireEvent.change(ticketFirst, { target: { value: '30' } });

      fireEvent.click(
        screen.getByRole('button', { name: 'Reset Thread SLA by priority Low to default' })
      );
      expect(del).toHaveBeenCalledWith('/api/organizations/sla-config/message/low');
      // In flight: Save and the reset itself wait.
      expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      answer({ data: { success: true, data: perField() } });

      // The defaults (240 minutes = 4 hours), the override marks gone, no reset on the row now.
      await vi.waitFor(() =>
        expect(
          screen.getByRole('spinbutton', { name: 'Thread SLA by priority Low first response' })
        ).toHaveValue(4)
      );
      expect(screen.queryByText('(custom)')).toBeNull();
      expect(resetButton('Reset Thread SLA by priority Low to default')).toBeNull();
      // The other row keeps its edit, and Save sends only it (the reset row's refused "0" is gone).
      expect(
        screen.getByRole('spinbutton', { name: 'Ticket SLA Critical first response' })
      ).toHaveValue(30);
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      expect(configsSent()).toEqual([
        { type: 'ticket', key: 'critical', firstResponseMinutes: 30 },
      ]);
    });

    it('a failed reset shows the error and leaves the row as it was', async () => {
      get.mockResolvedValue({
        data: { success: true, data: perField({ 'message:low': [false, true] }) },
      });
      del.mockRejectedValue(new Error('reset refused'));
      render(<SLAConfigSettings />);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Reset Thread SLA by priority Low to default' })
      );
      expect(await screen.findByText(/reset refused|Failed to reset/)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Reset Thread SLA by priority Low to default' })
      ).not.toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByText('(custom)')).toBeInTheDocument();
    });
  });
});
