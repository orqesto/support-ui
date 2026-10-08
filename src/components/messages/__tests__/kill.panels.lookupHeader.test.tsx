import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CustomApiLookupPanel, summariseLookup } from '../CustomApiLookupPanel';
import type * as LookupService from '@/services/customApiLookup.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

type CustomApiLookupResult = LookupService.CustomApiLookupResult;

/**
 * The lookup card header and summary: a row count is said only for an ok card with rows, and
 * "N of total" only when the vendor has more than were returned. Harness copied from
 * CustomApiLookupPanelSummary.test.tsx.
 */

const run = vi.fn<(body: unknown) => Promise<CustomApiLookupResult[]>>();
const availability = vi.fn<(surface: string) => Promise<boolean>>();

vi.mock('@/services/customApiLookup.service', async () => {
  const actual = await vi.importActual<typeof LookupService>('@/services/customApiLookup.service');
  return {
    ...actual,
    customApiLookupService: {
      run: (body: unknown) => run(body),
      availability: (surface: string) => availability(surface),
    },
  };
});

const card = (over: Partial<CustomApiLookupResult> = {}): CustomApiLookupResult =>
  ({
    endpointId: 20,
    label: 'this order',
    connectionName: 'Militech',
    resultShape: 'one',
    status: 'ok',
    rows: [{ order_id: '137416', total: '348.50', total__currency: 'EUR' }],
    fields: [
      { path: 'order_id', label: 'Order', kind: 'plain' },
      { path: 'total', label: 'Total', kind: 'money' },
    ],
    ...over,
  }) as CustomApiLookupResult;

const press = async (name = /look up/i) => {
  // `find`, not `get`: the panel renders only once availability has answered.
  await userEvent.click((await screen.findAllByRole('button', { name }))[0]);
};

/**
 * A fresh cache per render, so one test's availability answer never leaks into the next.
 *
 * ⛔ AND A ROUTER (CA-6). The panel now links out to the customer's records page, and a `<Link>`
 * outside a router context throws — so this wrapper is what keeps every test in this file honest
 * about the context the panel actually renders in. Without it the suite dies at render with
 * "Cannot destructure property 'basename'", which looks like a test-harness problem and is really
 * the component telling you what it now requires.
 */
const render = (ui: ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return rtlRender(ui, { wrapper });
};

beforeEach(() => {
  run.mockReset();
  availability.mockReset();
  availability.mockResolvedValue(true);
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

/** The text of a card's header connection span: "<connection>[ · rows[ of total]]". */
const headerOf = (node: HTMLElement) =>
  (node.firstElementChild?.lastElementChild as HTMLElement).textContent;

describe('summary counts only an ok card with rows as found', () => {
  it('a shape_changed result that still carries rows is "needs an admin", not "found"', () => {
    expect(
      summariseLookup([card({ status: 'shape_changed', missing: ['total'] })]).map(
        (part) => part.text
      )
    ).toEqual(['1 needs an admin']);
    // CONTROL: the same rows on an ok card are found.
    expect(summariseLookup([card()]).map((part) => part.text)).toEqual(['1 found']);
  });
});

describe('card header — the connection, then the row count only for an ok card with rows', () => {
  it('a failed card carrying rows reads just the connection name', async () => {
    run.mockResolvedValue([card({ status: 'failed', reason: 'Timed out' })]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    const [node] = await screen.findAllByTestId('lookup-card');
    expect(headerOf(node)).toBe('Militech');
  });

  it('a no-row card reads just the connection name', async () => {
    run.mockResolvedValue([card({ status: 'no_match', rows: [], fields: [] })]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    const [node] = await screen.findAllByTestId('lookup-card');
    expect(headerOf(node)).toBe('Militech');
  });

  it('total equal to the rows shown reads "· 2", not "2 of 2"', async () => {
    run.mockResolvedValue([
      card({
        rows: [
          { order_id: '1', total: '1', total__currency: 'EUR' },
          { order_id: '2', total: '2', total__currency: 'EUR' },
        ],
        total: 2,
      }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    const [node] = await screen.findAllByTestId('lookup-card');
    expect(headerOf(node)).toBe('Militech · 2');
  });

  it('no total reads the row count alone', async () => {
    run.mockResolvedValue([card()]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    const [node] = await screen.findAllByTestId('lookup-card');
    expect(headerOf(node)).toBe('Militech · 1');
  });

  it('CONTROL: more rows exist than shown reads "2 of 14"', async () => {
    run.mockResolvedValue([
      card({
        rows: [
          { order_id: '1', total: '1', total__currency: 'EUR' },
          { order_id: '2', total: '2', total__currency: 'EUR' },
        ],
        total: 14,
      }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    const [node] = await screen.findAllByTestId('lookup-card');
    expect(headerOf(node)).toBe('Militech · 2 of 14');
  });
});

describe('v4 lookup header — "ran …" and "Look up again" once a lookup has run', () => {
  const ran = () => screen.queryByText(/^ran /);

  it('before a run: "Look up", no "ran" hint; while busy: "Looking up…"', async () => {
    let answer: (rows: CustomApiLookupResult[]) => void = () => {};
    run.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<CustomApiLookupPanel conversationId={1} />);
    expect(await screen.findByRole('button', { name: 'Look up' })).toBeInTheDocument();
    expect(ran()).toBeNull();
    await press(/^look up$/i);
    expect(screen.getByRole('button', { name: 'Looking up…' })).toBeDisabled();
    expect(ran()).toBeNull();
    answer([card()]);
    expect(await screen.findByRole('button', { name: 'Look up again' })).toBeInTheDocument();
  });

  it('after a run: "ran just now" and "Look up again"; minutes later "ran 3m ago"', async () => {
    run.mockResolvedValue([card()]);
    const view = render(<CustomApiLookupPanel conversationId={1} />);
    await press(/^look up$/i);
    expect(await screen.findByRole('button', { name: 'Look up again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Look up' })).toBeNull();
    expect(ran()?.textContent).toBe('ran just now');
    const later = Date.now() + 3 * 60_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    view.rerender(<CustomApiLookupPanel conversationId={1} className="mt-1" />);
    expect(ran()?.textContent).toBe('ran 3m ago');
    vi.restoreAllMocks();
  });

  it('a lookup that failed has not run: still "Look up", no hint', async () => {
    run.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    render(<CustomApiLookupPanel conversationId={1} />);
    await press(/^look up$/i);
    expect(await screen.findByRole('button', { name: 'Look up' })).toBeEnabled();
    expect(ran()).toBeNull();
  });

  it('another thread starts over: "Look up", no hint', async () => {
    run.mockResolvedValue([card()]);
    const view = render(<CustomApiLookupPanel conversationId={1} />);
    await press(/^look up$/i);
    await screen.findByRole('button', { name: 'Look up again' });
    view.rerender(<CustomApiLookupPanel conversationId={2} />);
    expect(await screen.findByRole('button', { name: 'Look up' })).toBeInTheDocument();
    expect(ran()).toBeNull();
  });
});
