import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CustomApiLookupPanel } from '../CustomApiLookupPanel';
import type * as LookupService from '@/services/customApiLookup.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

type CustomApiLookupResult = LookupService.CustomApiLookupResult;

/**
 * v4 summary row of the agent-facing panel (P5, message detail v4). The harness is the one in
 * CustomApiLookupPanel.test.tsx, which is at its line cap.
 *
 * Original note on the panel (CA-3 SC1–SC7, D36, D38):
 *
 * What these tests are really guarding is that four outcomes stay DISTINGUISHABLE. If "no match"
 * and "failed" look the same, agents learn to ignore both, and a real outage reads as a customer
 * with no orders — which is the confusion the whole outcome model exists to prevent.
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

describe('v4 summary row — how the press went, counted by outcome (P5)', () => {
  it('counts each outcome above the cards, only non-zero, each in its tone', async () => {
    run.mockResolvedValue([
      card({ endpointId: 1 }),
      card({ endpointId: 2, label: 'orders' }),
      card({ endpointId: 3, status: 'needs_input', rows: [], fields: [] }),
      card({ endpointId: 4, status: 'no_match', rows: [], fields: [] }),
      // An `ok` with no rows renders "No matching records" — it is a no match in the summary too.
      card({ endpointId: 5, status: 'ok', rows: [] }),
      card({ endpointId: 6, status: 'failed', reason: 'Timed out', rows: [], fields: [] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    const summary = await screen.findByTestId('lookup-summary');
    const chips = Array.from(summary.children).map((chip) => [
      chip.textContent,
      (chip as HTMLElement).dataset.tone,
    ]);
    expect(chips).toEqual([
      ['2 found', 'ok'],
      ['1 needs a number', 'ask'],
      ['2 no match', 'plain'],
      ['1 failed', 'bad'],
    ]);
    // Absent outcomes say nothing: no "0 can’t run".
    expect(summary.textContent).not.toMatch(/can’t run|needs an admin/);
    // ABOVE the cards, so a failure is seen before scrolling.
    const firstCard = screen.getAllByTestId('lookup-card')[0];
    expect(
      summary.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('a customer with no email reads "can’t run — no email"; a changed vendor "needs an admin"', async () => {
    run.mockResolvedValue([
      card({ endpointId: 1, status: 'no_identity', rows: [], fields: [] }),
      card({ endpointId: 2, status: 'shape_changed', missing: ['total'], rows: [] }),
      card({ endpointId: 3, status: 'shape_changed', missing: ['total'], rows: [] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    const summary = await screen.findByTestId('lookup-summary');
    expect(summary.textContent).toBe('1 can’t run — no email2 need an admin');
  });

  it('the two chips that say "need(s)" agree with their number: 2 need a number, 1 needs an admin', async () => {
    run.mockResolvedValue([
      card({ endpointId: 1, status: 'needs_input', rows: [], fields: [] }),
      card({ endpointId: 2, status: 'needs_input', rows: [], fields: [] }),
      card({ endpointId: 3, status: 'shape_changed', missing: ['total'], rows: [] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    const summary = await screen.findByTestId('lookup-summary');
    expect(Array.from(summary.children).map((chip) => chip.textContent)).toEqual([
      '2 need a number',
      '1 needs an admin',
    ]);
  });

  it('⛔ a record the check says is someone else’s is NOT counted as found', async () => {
    run.mockResolvedValue([
      card({ endpointId: 1, ownership: 'mismatch' }),
      card({ endpointId: 2, ownership: 'unverified' }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    const summary = await screen.findByTestId('lookup-summary');
    const chips = Array.from(summary.children).map((chip) => [
      chip.textContent,
      (chip as HTMLElement).dataset.tone,
    ]);
    expect(chips).toEqual([
      ['1 found', 'ok'],
      ['1 not this customer’s', 'bad'],
    ]);
  });

  it('each tone paints its own colour, and the failed card alone is edged in red', async () => {
    run.mockResolvedValue([
      card({ endpointId: 1 }),
      card({ endpointId: 3, status: 'needs_input', rows: [], fields: [] }),
      card({ endpointId: 4, status: 'no_match', rows: [], fields: [] }),
      card({ endpointId: 5, status: 'shape_changed', missing: ['total'], rows: [] }),
      card({ endpointId: 6, status: 'failed', reason: 'Timed out', rows: [], fields: [] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    const summary = await screen.findByTestId('lookup-summary');
    // The CLASS on screen, not just `data-tone`: a tone mapped to the wrong colour reads wrong.
    const classOf = (tone: string) =>
      (summary.querySelector(`[data-tone="${tone}"]`) as HTMLElement).className.split(/\s+/);
    expect(classOf('ok')).toEqual(expect.arrayContaining(['bg-success-muted', 'text-success']));
    expect(classOf('ask')).toEqual(expect.arrayContaining(['bg-primary-muted', 'text-primary']));
    expect(classOf('plain')).toEqual(
      expect.arrayContaining(['bg-sunken', 'text-muted-foreground'])
    );
    expect(classOf('warn')).toEqual(expect.arrayContaining(['bg-warning-muted', 'text-warning']));
    expect(classOf('bad')).toEqual(
      expect.arrayContaining(['bg-destructive-muted', 'text-destructive'])
    );
    const edges = screen
      .getAllByTestId('lookup-card')
      .map((node) => node.className.includes('border-destructive-line'));
    expect(edges).toEqual([false, false, false, false, true]);
    expect(screen.getAllByTestId('lookup-card')[0].className).toContain('border-border');
  });

  it('CONTROL: before a press there is no summary at all', async () => {
    render(<CustomApiLookupPanel conversationId={1} />);
    await screen.findAllByRole('button', { name: /look up/i });
    expect(screen.queryByTestId('lookup-summary')).toBeNull();
  });

  it('the card header carries the connection and "rows of total"', async () => {
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
    expect(await screen.findByText('Militech · 2 of 14')).toBeTruthy();
  });

  it('CONTROL: a complete result carries the row count alone — "of" only when rows were cut', async () => {
    // Mutation batch: `total > rows.length` forced true read "2 of 2", claiming a cut that never
    // happened; a cap must say it bit, and ONLY when it bit.
    run.mockResolvedValue([
      card({
        endpointId: 1,
        rows: [
          { order_id: '1', total: '1', total__currency: 'EUR' },
          { order_id: '2', total: '2', total__currency: 'EUR' },
        ],
        total: 2,
      }),
      card({ endpointId: 2, label: 'orders', connectionName: 'Shopify' }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    expect(await screen.findByText('Militech · 2')).toBeTruthy();
    // No total at all: the count, with no "of" invented.
    expect(screen.getByText('Shopify · 1')).toBeTruthy();
    expect(screen.queryByText(/ of /)).toBeNull();
  });

  it('the root carries data-lookup-root, which the composer "Look up" button scrolls to', async () => {
    const { container } = render(<CustomApiLookupPanel conversationId={1} />);
    await screen.findAllByRole('button', { name: /look up/i });
    expect(container.querySelector('[data-lookup-root]')).not.toBeNull();
  });

  it('the root takes focus from the Look up button: tabIndex -1 and named "Connected systems"', async () => {
    const { container } = render(<CustomApiLookupPanel conversationId={1} />);
    await screen.findAllByRole('button', { name: /look up/i });
    const root = container.querySelector<HTMLElement>('[data-lookup-root]')!;
    expect(root).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('group', { name: 'Connected systems' })).toBe(root);
    root.focus();
    expect(document.activeElement).toBe(root);
  });
});
