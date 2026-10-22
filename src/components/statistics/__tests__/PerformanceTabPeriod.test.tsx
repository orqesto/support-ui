/**
 * Final review (date-range calendar, C1): the Statistics Performance tab rendered its SLA cards,
 * charts and breaches with `days` only, so a custom "3–9 Aug" showed SLA figures for "the last 7
 * days ending now" beside message figures for 3–9 Aug. Every SLA request carries the range.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const calls: Array<Record<string, unknown> | undefined> = [];
const record = (params?: Record<string, unknown>) => {
  calls.push(params);
  return new Promise(() => undefined); // stay loading: only the request matters
};
vi.mock('@/services/sla.service', () => ({
  slaService: {
    getSummary: record,
    getStatistics: record,
    getBreaches: record,
    getTrends: record,
  },
}));

const { PerformanceTab } = await import('../PerformanceTab');

afterEach(() => {
  cleanup();
  calls.length = 0;
});

describe('PerformanceTab', () => {
  it('a custom range reaches every SLA request as from/to, not days', async () => {
    render(
      <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <PerformanceTab
          days={7}
          period={{ days: 7, fromDay: '2026-08-03', toDay: '2026-08-09' }}
          msgStats={null}
          msgLoading
          labelStats={null}
          labelLoading
          speedData={null}
          speedLoading
          speedDays={7}
        />
      </QueryClientProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(4));
    for (const params of calls) {
      expect(params).toMatchObject({ from: new Date(2026, 7, 3).toISOString() });
      expect(params).not.toHaveProperty('days');
    }
  });
});
