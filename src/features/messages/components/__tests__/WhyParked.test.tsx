/**
 * "Needs routing" is two different situations wearing one label, and they want opposite
 * responses. Production, 2026-09-01: of 142 parked conversations in the replayable corpus,
 * **131 had no similarity within 0.75 of anything** — so the common case is the one where
 * routing by hand teaches the router nothing.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhyParked } from '../WhyParked';

const get = vi.fn();
vi.mock('@/services/routingDecision.service', () => ({
  routingDecisionService: { get: (id: number | string) => get(id) as unknown },
}));

const renderIt = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WhyParked conversationId={170} />
    </QueryClientProvider>
  );

beforeEach(() => get.mockReset());
afterEach(cleanup);

describe('why a thread is parked', () => {
  it('names the department that nearly won, and the bar that refused it', async () => {
    get.mockResolvedValue({
      reason: 'needs_routing',
      decidedAt: '2026-09-01T10:00:00Z',
      chosenDeptId: null,
      weakBar: 0.82,
      verdict: 'below_bar',
      closest: { departmentId: 81, name: 'Support', similarity: 0.7919, cleared: false },
      considered: [],
    });
    renderIt();
    expect(await screen.findByText('Support')).toBeInTheDocument();
    expect(screen.getByTestId('why-parked')).toHaveTextContent('0.79');
    expect(screen.getByTestId('why-parked')).toHaveTextContent('0.82');
  });

  it('says a rule is the answer when nothing came close', async () => {
    get.mockResolvedValue({
      reason: 'needs_routing',
      decidedAt: '2026-09-01T10:00:00Z',
      chosenDeptId: null,
      weakBar: 0.82,
      verdict: 'nothing_scored',
      closest: null,
      considered: [],
    });
    renderIt();
    expect(await screen.findByText(/No routing rule came close/)).toBeInTheDocument();
    // and it must NOT imply a near miss that did not happen
    expect(screen.queryByText(/just under/)).not.toBeInTheDocument();
  });

  it('says nothing at all when no decision is stored — silence beats a wrong story', async () => {
    get.mockResolvedValue(null);
    const { container } = renderIt();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('why-parked')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });

  /**
   * ⚠️ NOT covered here: the failed-read path. The component renders nothing when the query
   * errors (there is no `error` branch at all), but vitest reports the deliberate rejection
   * itself as an unhandled error before react-query can take it, and bending the harness
   * around that buys less than it costs. The `data == null` case above exercises the same
   * `return null`.
   */
});
