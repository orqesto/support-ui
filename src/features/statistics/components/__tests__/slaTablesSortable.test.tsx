/**
 * L4 (owner 2026-11-12): the SLA breach list and the ticket SLA by priority table are drawn with
 * the design-system DataTable, every data column sorts from its header, the breach list opens
 * most overdue first, and the priority table in priority order (critical → low, not alphabetical).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as DataTableModule from '@/components/ui/DataTable';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));
// The real DataTable, counted: the table must come from the design system, not a hand-rolled one.
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

const { SLABreachList } = await import('../SLABreachList');
const { SLAByPriorityTable } = await import('../SLAByPriorityTable');

const renderWith = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/stats']}>
        <Routes>
          <Route path="/stats" element={ui} />
          <Route path="/threads/:id" element={<p>thread page</p>} />
          <Route path="/tickets/:id" element={<p>ticket page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

/** The sort button in a column's header. */
const sortButton = (name: RegExp) =>
  within(screen.getByRole('columnheader', { name })).getByRole('button');

/** The text of one column (0-based) in body order. */
const column = (index: number) =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelectorAll('td')[index]?.textContent);

describe('SLA breach list on DataTable', () => {
  const breach = (id: number, over: Record<string, unknown>) => ({
    id,
    type: 'message',
    channel: 'email',
    priority: 'low',
    sender: `customer${id}@example.com`,
    subject: `Subject ${id}`,
    breachAmount: 10,
    createdAt: '2026-11-01T10:00:00Z',
    ...over,
  });
  const breaches = [
    breach(1, { breachAmount: 10, priority: 'low', createdAt: '2026-11-03T10:00:00Z' }),
    breach(2, { breachAmount: 60, priority: 'medium', createdAt: '2026-11-01T10:00:00Z' }),
    breach(3, { breachAmount: 30, priority: 'critical', createdAt: '2026-11-02T10:00:00Z' }),
  ];
  const SUBJECT = 3;

  beforeEach(() => {
    get.mockReset();
    dataTableRenders.mockClear();
    get.mockResolvedValue({ data: { total: 3, breaches } });
  });

  it('is drawn by the DataTable and opens most overdue first', async () => {
    renderWith(<SLABreachList days={30} />);
    expect(await screen.findByText('Subject 2')).toBeInTheDocument();
    expect(dataTableRenders).toHaveBeenCalled();
    expect(column(SUBJECT).map((text) => text?.split('From')[0])).toEqual([
      'Subject 2',
      'Subject 3',
      'Subject 1',
    ]);
  });

  it('every column sorts from its header; Priority by the app order, not alphabetically', async () => {
    renderWith(<SLABreachList days={30} />);
    await screen.findByText('Subject 2');
    for (const name of ['Type', 'Channel', 'Priority', 'Subject', 'Overdue', 'When'])
      expect(sortButton(new RegExp(`^${name}`))).toBeInTheDocument();
    fireEvent.click(sortButton(/^Priority/));
    expect(column(2)).toEqual(['critical', 'medium', 'low']);
    fireEvent.click(sortButton(/^When/));
    expect(column(SUBJECT).map((text) => text?.split('From')[0])).toEqual([
      'Subject 2',
      'Subject 3',
      'Subject 1',
    ]);
    fireEvent.click(sortButton(/^Overdue/));
    expect(column(4)).toEqual(['+10m', '+30m', '+60m']);
  });

  it('a row still opens its thread', async () => {
    renderWith(<SLABreachList days={30} />);
    fireEvent.click(await screen.findByRole('button', { name: /Subject 3/ }));
    expect(await screen.findByText('thread page')).toBeInTheDocument();
  });

  it('review 8: a click anywhere in the row opens it (here the When cell)', async () => {
    renderWith(<SLABreachList days={30} />);
    await screen.findByText('Subject 2');
    const whenCell = screen.getAllByRole('row')[1].querySelectorAll('td')[5];
    fireEvent.click(whenCell);
    expect(await screen.findByText('thread page')).toBeInTheDocument();
  });

  it('review 8: a ticket breach row opens the ticket', async () => {
    get.mockResolvedValue({
      data: { total: 1, breaches: [breach(9, { type: 'ticket_resolution' })] },
    });
    renderWith(<SLABreachList days={30} />);
    await screen.findByText('Subject 9');
    fireEvent.click(screen.getAllByRole('row')[1].querySelectorAll('td')[4]);
    expect(await screen.findByText('ticket page')).toBeInTheDocument();
  });

  it('CONTROL: a sort header click does not open a row', async () => {
    renderWith(<SLABreachList days={30} />);
    await screen.findByText('Subject 2');
    fireEvent.click(sortButton(/^When/));
    expect(screen.queryByText('thread page')).toBeNull();
  });

  it('CONTROL: no breaches keeps the empty state (no table)', async () => {
    get.mockResolvedValue({ data: { total: 0, breaches: [] } });
    renderWith(<SLABreachList days={30} />);
    expect(await screen.findByText('No active SLA breaches')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('Ticket SLA by priority on DataTable', () => {
  const stats = (total: number, over: Record<string, unknown> = {}) => ({
    total,
    firstResponseTarget: 60,
    avgFirstResponse: 30,
    firstResponseBreached: 0,
    resolutionTarget: 4,
    resolutionTargetMinutes: 240,
    avgResolution: 1,
    resolutionBreached: 0,
    ...over,
  });
  const body = {
    period: { days: 30, from: '', to: '' },
    messages: { compliance: { total: 0, breached: 0, rate: 100 } },
    tickets: {
      // Sent out of order on purpose: the table orders them itself.
      low: stats(5, { resolutionTargetMinutes: 4320 }),
      critical: stats(9, { resolutionTargetMinutes: 60 }),
      medium: stats(2, { resolutionTargetMinutes: 1440 }),
      high: stats(7, { resolutionTargetMinutes: 240 }),
      compliance: {
        firstResponse: { total: 0, breached: 0, rate: 100 },
        resolution: { total: 0, breached: 0, rate: 100 },
      },
    },
  };

  beforeEach(() => {
    get.mockReset();
    dataTableRenders.mockClear();
    get.mockResolvedValue({ data: body });
  });

  it('is drawn by the DataTable, in priority order, every column sortable', async () => {
    renderWith(<SLAByPriorityTable days={30} />);
    expect(await screen.findByText('Critical')).toBeInTheDocument();
    expect(dataTableRenders).toHaveBeenCalled();
    expect(column(0)).toEqual(['Critical', 'High', 'Medium', 'Low']);
    // 8 data columns, each with a sort button in its header.
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(8);
    for (const header of headers) expect(header).toHaveAttribute('aria-sort');
  });

  it('Priority sorts by priority order (critical → low), not alphabetically', async () => {
    renderWith(<SLAByPriorityTable days={30} />);
    await screen.findByText('Critical');
    fireEvent.click(sortButton(/^Priority/));
    expect(column(0)).toEqual(['Critical', 'High', 'Medium', 'Low']);
    fireEvent.click(sortButton(/^Priority/));
    expect(column(0)).toEqual(['Low', 'Medium', 'High', 'Critical']);
  });

  it('numbers sort numerically: Total, and Resolution Target by its minutes', async () => {
    renderWith(<SLAByPriorityTable days={30} />);
    await screen.findByText('Critical');
    fireEvent.click(sortButton(/^Total/));
    expect(column(1)).toEqual(['2', '5', '7', '9']);
    fireEvent.click(sortButton(/^Resolution Target/));
    expect(column(0)).toEqual(['Critical', 'High', 'Medium', 'Low']);
    fireEvent.click(sortButton(/^Resolution Target/));
    expect(column(0)).toEqual(['Low', 'Medium', 'High', 'Critical']);
  });

  it('CONTROL: no ticket data keeps the empty state (no table)', async () => {
    get.mockResolvedValue({ data: { ...body, tickets: { compliance: body.tickets.compliance } } });
    renderWith(<SLAByPriorityTable days={30} />);
    expect(await screen.findByText('No Ticket Data')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
