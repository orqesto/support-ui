import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CustomApiLookupPanel } from '../CustomApiLookupPanel';
import type * as LookupService from '@/features/custom-api';
import { clearLookupCache, LOOKUP_CACHE_TTL_MS } from '@/lib/lookupResultCache';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

type CustomApiLookupResult = LookupService.CustomApiLookupResult;

/**
 * #920 (owner 2026-11-11): the thread's Lookups tab runs the lookups when it opens, and a fresh
 * result (five minutes, this browser) is reused instead of calling the client's vendor again.
 * One test per acceptance point of the issue, plus its edge cases. The panel is rendered as the
 * Lookups tab renders it (`autoRun`); the tab's own wiring (no run before it opens, none without a
 * customer email) is tested in messages' MessagePanelTabs.badges.test.tsx.
 */

const run = vi.fn<(body: unknown) => Promise<CustomApiLookupResult[]>>();
const runDetailed =
  vi.fn<
    (body: unknown) => Promise<{ results: CustomApiLookupResult[]; lookedUpAs: string | null }>
  >();
const availability = vi.fn<(surface: string) => Promise<boolean>>();

vi.mock('@/features/custom-api/services/customApiLookup.service', async () => {
  const actual = await vi.importActual<typeof LookupService>(
    '@/features/custom-api/services/customApiLookup.service'
  );
  return {
    ...actual,
    customApiLookupService: {
      run: (body: unknown) => run(body),
      runDetailed: (body: unknown) => runDetailed(body),
      availability: (surface: string) => availability(surface),
      lookupOptions: () => Promise.resolve([]),
    },
  };
});

const card = (order: string): CustomApiLookupResult =>
  ({
    endpointId: 20,
    label: 'Their orders',
    connectionName: 'Example shop',
    resultShape: 'one',
    status: 'ok',
    rows: [{ order_id: order }],
    fields: [{ path: 'order_id', label: 'Order', kind: 'plain' }],
  }) as CustomApiLookupResult;

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  };
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const render = (ui: ReactElement, client = newClient()) =>
  rtlRender(ui, { wrapper: wrapperFor(client) });

beforeEach(() => {
  clearLookupCache();
  run.mockReset();
  runDetailed.mockReset();
  availability.mockReset();
  availability.mockResolvedValue(true);
  useAuthStore.setState({
    selectedOrganizationId: 1,
    user: { id: 9 } as User,
    isAuthenticated: true,
  });
});
afterEach(() => vi.useRealTimers());

describe('#920 — the Lookups tab runs when it opens', () => {
  it('1. opening the tab runs for the customer with no press', async () => {
    run.mockResolvedValue([card('A-100')]);
    render(<CustomApiLookupPanel conversationId={1} autoRun />);
    expect(await screen.findByText('A-100')).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ conversationId: 1 });
  });

  it('2. CONTROL — a panel without autoRun (contact drawer, records page) calls nothing', async () => {
    render(<CustomApiLookupPanel contactId={5} />);
    await screen.findAllByRole('button', { name: /look up/i });
    expect(run).not.toHaveBeenCalled();
  });

  it('3. switching thread on the tab runs for the new thread; the old results never show', async () => {
    let resolveFirst: (rows: CustomApiLookupResult[]) => void = () => undefined;
    run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    run.mockResolvedValueOnce([card('B-200')]);
    const view = render(<CustomApiLookupPanel conversationId={1} autoRun />);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    view.rerender(<CustomApiLookupPanel conversationId={2} autoRun />);
    expect(await screen.findByText('B-200')).toBeInTheDocument();
    expect(run).toHaveBeenLastCalledWith({ conversationId: 2 });
    // Thread 1's answer lands late: dropped by the generation guard.
    resolveFirst([card('A-100')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('A-100')).toBeNull();
  });

  it('4. leaving the tab and coming back reuses the fresh result — no second vendor call', async () => {
    run.mockResolvedValue([card('A-100')]);
    const client = newClient();
    const first = render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await screen.findByText('A-100');
    first.unmount(); // the tab closes
    render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    expect(await screen.findByText('A-100')).toBeInTheDocument();
    expect(screen.getByText(/ran /)).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('4. "Look up again" still forces a fresh run', async () => {
    run.mockResolvedValue([card('A-100')]);
    render(<CustomApiLookupPanel conversationId={1} autoRun />);
    await screen.findByText('A-100');
    run.mockResolvedValue([card('A-101')]);
    await userEvent.click(screen.getByRole('button', { name: /look up again/i }));
    expect(await screen.findByText('A-101')).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('4. CONTROL — after five minutes the result is not fresh: the tab runs again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    run.mockResolvedValue([card('A-100')]);
    const client = newClient();
    const first = render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await screen.findByText('A-100');
    first.unmount();
    vi.setSystemTime(Date.now() + LOOKUP_CACHE_TTL_MS + 1000);
    render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it('5. "Look up another email" still works, and its result is never reused for the customer', async () => {
    run.mockResolvedValue([card('A-100')]);
    runDetailed.mockResolvedValue({ results: [card('Z-900')], lookedUpAs: 'other@example.com' });
    const client = newClient();
    const first = render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await screen.findByText('A-100');
    await userEvent.click(screen.getByRole('button', { name: /look up another email/i }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /look up another email/i }),
      'other@example.com'
    );
    await userEvent.click(screen.getByRole('button', { name: /look up as/i }));
    expect(await screen.findByText('Z-900')).toBeInTheDocument();
    first.unmount();
    render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    // Back on the tab: the CUSTOMER's cached result, not the typed person's, and no new call.
    expect(await screen.findByText('A-100')).toBeInTheDocument();
    expect(screen.queryByText('Z-900')).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('6. no connected system here ⇒ no call', async () => {
    availability.mockResolvedValue(false);
    render(<CustomApiLookupPanel conversationId={1} autoRun />);
    await waitFor(() => expect(availability).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(run).not.toHaveBeenCalled();
  });
});

describe('#920 — edge cases', () => {
  it('a vendor error shows once and is not retried automatically', async () => {
    run.mockRejectedValue(Object.assign(new Error('Rate limited'), { status: 429 }));
    render(<CustomApiLookupPanel conversationId={1} autoRun />);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('nothing is cached for another user or workspace in the same tab', async () => {
    run.mockResolvedValue([card('A-100')]);
    const client = newClient();
    const first = render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await screen.findByText('A-100');
    first.unmount();
    useAuthStore.setState({ user: { id: 10 } as User });
    render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it('signing out empties the cache', async () => {
    run.mockResolvedValue([card('A-100')]);
    const client = newClient();
    const first = render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await screen.findByText('A-100');
    first.unmount();
    useAuthStore.getState().logout();
    useAuthStore.setState({
      selectedOrganizationId: 1,
      user: { id: 9 } as User,
      isAuthenticated: true,
    });
    render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  // Review of #920.
  it('a result with a failed lookup is not reused: the tab runs again', async () => {
    run.mockResolvedValue([
      { ...card('A-100'), status: 'failed', rows: [] } as CustomApiLookupResult,
    ]);
    const client = newClient();
    const first = render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    first.unmount();
    render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it('reopening the tab while the first run is still answering joins it — one vendor call', async () => {
    let answer: (rows: CustomApiLookupResult[]) => void = () => undefined;
    run.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    const client = newClient();
    const first = render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<CustomApiLookupPanel conversationId={1} autoRun />, client);
    await new Promise((resolve) => setTimeout(resolve, 0));
    answer([card('A-100')]);
    expect(await screen.findByText('A-100')).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a typed-email run started while the automatic run answers is not overwritten by it', async () => {
    let answerCustomer: (rows: CustomApiLookupResult[]) => void = () => undefined;
    run.mockImplementation(
      () =>
        new Promise((resolve) => {
          answerCustomer = resolve;
        })
    );
    runDetailed.mockResolvedValue({ results: [card('Z-900')], lookedUpAs: 'other@example.com' });
    render(<CustomApiLookupPanel conversationId={1} autoRun />);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await userEvent.click(await screen.findByRole('button', { name: /look up another email/i }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /look up another email/i }),
      'other@example.com'
    );
    // Enter while the automatic run is still answering: refused like the (disabled) button.
    await userEvent.keyboard('{Enter}');
    expect(runDetailed).not.toHaveBeenCalled();
    answerCustomer([card('A-100')]);
    await screen.findByText('A-100');
    await userEvent.click(screen.getByRole('button', { name: /look up as/i }));
    expect(await screen.findByText('Z-900')).toBeInTheDocument();
    expect(screen.queryByText('A-100')).toBeNull();
  });

  it("the thread's customer changed ⇒ the previous customer's result is not reused", async () => {
    run.mockResolvedValue([card('A-100')]);
    const client = newClient();
    const first = render(
      <CustomApiLookupPanel conversationId={1} autoRun customerEmail="first@example.com" />,
      client
    );
    await screen.findByText('A-100');
    first.unmount();
    render(
      <CustomApiLookupPanel conversationId={1} autoRun customerEmail="second@example.com" />,
      client
    );
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });
});
