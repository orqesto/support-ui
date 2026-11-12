/**
 * SLA Performance shows thread resolution (backend 0238) and the ticket resolution target in
 * minutes. An older backend (no `messages.resolution`, no `resolutionTargetMinutes`) renders as
 * before, with no crash.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ThreadResolutionByPriorityTable } from '../ThreadResolutionByPriorityTable';
import { SLAByPriorityTable } from '../SLAByPriorityTable';
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

const totals = (over: Record<string, unknown> = {}) => ({
  total: 4,
  resolved: 3,
  breached: 1,
  decided: 4,
  complianceRate: 75,
  avgResolutionSeconds: 3 * 3600,
  medianResolutionSeconds: 2 * 3600,
  ...over,
});

const stats = (messagesExtra: Record<string, unknown>, ticketHigh: Record<string, unknown>) => ({
  period: { days: 30, from: '', to: '' },
  messages: { compliance: { total: 0, breached: 0, rate: 100 }, ...messagesExtra },
  tickets: {
    high: {
      total: 2,
      firstResponseTarget: 60,
      avgFirstResponse: 30,
      firstResponseBreached: 0,
      resolutionTarget: 1.5,
      avgResolution: 1,
      resolutionBreached: 0,
      ...ticketHigh,
    },
    compliance: {
      firstResponse: { total: 0, breached: 0, rate: 100 },
      resolution: { total: 0, breached: 0, rate: 100 },
    },
  },
});

const renderWith = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>
  );

describe('SLA Performance: thread resolution', () => {
  beforeEach(() => get.mockReset());

  it('renders compliance and average resolution by priority', async () => {
    get.mockResolvedValue({
      data: stats({ resolution: { ...totals(), byPriority: { high: totals() } } }, {}),
    });
    renderWith(<ThreadResolutionByPriorityTable days={30} />);
    expect(await screen.findByText('Thread resolution')).toBeInTheDocument();
    expect(
      screen.getByText(/75\.0% resolved within target · 4 cycles · median 2h/)
    ).toBeInTheDocument();
    expect(screen.getByText('3h')).toBeInTheDocument();
  });

  it('draws the priority rows with the design-system DataTable', async () => {
    dataTableRenders.mockClear();
    get.mockResolvedValue({
      data: stats({ resolution: { ...totals(), byPriority: { high: totals() } } }, {}),
    });
    renderWith(<ThreadResolutionByPriorityTable days={30} />);
    expect(await screen.findByText('Thread resolution')).toBeInTheDocument();
    expect(dataTableRenders).toHaveBeenCalled();
    expect(screen.getByRole('columnheader', { name: 'Avg resolution' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '3h' })).toBeInTheDocument();
  });

  it('an older backend without messages.resolution renders nothing and does not crash', async () => {
    get.mockResolvedValue({ data: stats({}, {}) });
    const { container } = renderWith(<ThreadResolutionByPriorityTable days={30} />);
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toBe('');
  });

  it('a ticket resolution target of 90 minutes shows 1h 30m; an older backend still shows hours', async () => {
    get.mockResolvedValue({ data: stats({}, { resolutionTargetMinutes: 90 }) });
    const { unmount } = renderWith(<SLAByPriorityTable days={30} />);
    expect(await screen.findByText('1h 30m')).toBeInTheDocument();
    unmount();
    get.mockResolvedValue({ data: stats({}, {}) });
    renderWith(<SLAByPriorityTable days={30} />);
    expect(await screen.findByText('1.5h')).toBeInTheDocument();
  });

  it("the breach list asks for threads' resolution breaches (include=resolution)", async () => {
    get.mockResolvedValue({ data: { total: 0, breaches: [] } });
    const { slaService } = await import('@/features/statistics/services/sla.service');
    await slaService.getBreaches({ limit: 5 });
    expect(get).toHaveBeenCalledWith('/api/sla/breaches', {
      params: { limit: 5, include: 'resolution' },
    });
  });

  it('a malformed resolution (byPriority null) is dropped, not rendered into a crash (review)', async () => {
    get.mockResolvedValue({ data: stats({ resolution: { ...totals(), byPriority: null } }, {}) });
    const { slaService } = await import('@/features/statistics/services/sla.service');
    expect((await slaService.getStatistics({ days: 30 })).messages.resolution).toBeNull();
  });

  it('two resolution breaches of one thread render as two rows (review: duplicate keys)', async () => {
    const row = (createdAt: string) => ({
      id: 7,
      type: 'message_resolution',
      channel: 'email',
      priority: 'high',
      sender: 'customer@example.com',
      targetMinutes: 240,
      actualMinutes: 300,
      breachAmount: 60,
      createdAt,
    });
    get.mockResolvedValue({
      data: { total: 2, breaches: [row('2026-11-01T10:00:00Z'), row('2026-11-05T10:00:00Z')] },
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { SLABreachList } = await import('../SLABreachList');
    renderWith(
      <MemoryRouter>
        <SLABreachList days={30} />
      </MemoryRouter>
    );
    expect(await screen.findAllByText('From: customer@example.com')).toHaveLength(2);
    expect(errors.mock.calls.some((call) => String(call[0]).includes('same key'))).toBe(false);
    errors.mockRestore();
  });
});
