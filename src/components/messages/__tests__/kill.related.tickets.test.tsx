/**
 * TicketsSection (the Related popover's ticket list), rendered directly: the per-ticket thread
 * lists (first read, refresh, leave + rejoin races, unmount), the ticket:updated subscription,
 * the card's text, Remove's labels and focus handling, and the hints shown per state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// Plain functions swapped per test: no module-level vi.fn ever rejects (vitest 4 trap).
const hoist = vi.hoisted(() => ({
  threadsCalls: [] as number[],
  threadsImpl: (() => new Promise(() => {})) as (id: number) => Promise<unknown>,
  removeImpl: (() => Promise.resolve()) as () => Promise<unknown>,
  handlers: new Set<(data: unknown) => void>(),
  subscribed: [] as Array<[string, unknown]>,
  unsubscribed: [] as Array<[string, unknown]>,
  errors: [] as unknown[][],
}));

vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: {
    threadsOfTicket: (id: number) => {
      hoist.threadsCalls.push(id);
      return hoist.threadsImpl(id);
    },
    removeThread: () => hoist.removeImpl(),
  },
}));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: (event: string, cb: (data: unknown) => void) => {
    hoist.subscribed.push([event, cb]);
    if (event === 'ticket:updated') hoist.handlers.add(cb);
  },
  unsubscribeFromEvent: (event: string, cb: (data: unknown) => void) => {
    hoist.unsubscribed.push([event, cb]);
    if (event === 'ticket:updated') hoist.handlers.delete(cb);
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    error: (...args: unknown[]) => hoist.errors.push(args),
    warn: () => {},
    info: () => {},
    debug: () => {},
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { success: () => {}, error: () => {} } }));

import { TicketsSection, type HeaderTickets } from '../RelatedPopover';
import { REL_GROUP_ROW } from '../relatedStyles';
import { priorityLabel, statusLabel } from '../messageDetailConstants';
import type { ThreadTicket, TicketThread } from '@/services/ticketThreads.service';

beforeEach(() => {
  hoist.threadsCalls = [];
  hoist.threadsImpl = () => new Promise(() => {});
  hoist.removeImpl = () => Promise.resolve();
  hoist.handlers.clear();
  hoist.subscribed = [];
  hoist.unsubscribed = [];
  hoist.errors = [];
});

const ticket = (ticketId: number, over: Partial<ThreadTicket> = {}): ThreadTicket => ({
  ticketId,
  publicId: null,
  title: `Ticket ${ticketId}`,
  status: 'open',
  priority: 'high',
  issueType: 'bug',
  externalId: null,
  isPrimary: false,
  resolvedAt: null,
  owesReply: false,
  ...over,
});

const thread = (conversationId: number, over: Partial<TicketThread> = {}): TicketThread => ({
  conversationId,
  publicId: `SUP-${conversationId}`,
  subject: `Subject ${conversationId}`,
  requesterEmail: 'a@b.c',
  status: 'open',
  channel: 'email',
  createdAt: '2026-01-01T00:00:00Z',
  isPrimary: false,
  addedAt: '2026-01-01T00:00:00Z',
  owesReply: null,
  ...over,
});

const ready = (rows: ThreadTicket[], hiddenCount = 0): HeaderTickets => ({
  state: 'ready',
  rows,
  hiddenCount,
  legacy: null,
});

const listOf = (rows: TicketThread[], hiddenCount = 0) =>
  Promise.resolve({ unavailable: false, rows, hiddenCount });

const Section = ({ tickets }: { tickets: HeaderTickets }) => (
  <MemoryRouter>
    <div role="dialog" aria-label="Related" tabIndex={-1}>
      <TicketsSection
        message={{ id: 1, publicId: 'SUP-1', subject: 'Hello', isLead: false }}
        tickets={tickets}
        canManage
        canCreate
        onAddToTicket={() => {}}
        onCreateTicket={() => {}}
        onRetry={() => {}}
      />
    </div>
  </MemoryRouter>
);

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });
/** Runs `fn` (a resolve/reject) inside act and lets the promise chains settle. */
const settle = (fn: () => unknown) =>
  act(async () => {
    fn();
    await Promise.resolve();
  });
const card = (id: number) => screen.getByTestId(`related-ticket-${id}`);
const LOADING_THREADS = 'Loading the threads on this ticket…';

describe('thread lists — reads', () => {
  it('a first read says it is loading, then shows the list (hint gone)', async () => {
    const read = deferred<unknown>();
    hoist.threadsImpl = () => read.promise;
    render(<Section tickets={ready([ticket(9)])} />);
    expect(within(card(9)).getByText(LOADING_THREADS)).toBeInTheDocument();
    await settle(() => read.resolve({ unavailable: false, rows: [thread(1)], hiddenCount: 0 }));
    expect(within(card(9)).queryByText(LOADING_THREADS)).toBeNull();
    expect(within(card(9)).getByText('1 thread on this ticket')).toBeInTheDocument();
  });

  it('two-digit ticket ids are read as themselves', async () => {
    render(<Section tickets={ready([ticket(12)])} />);
    await flush();
    expect(hoist.threadsCalls).toEqual([12]);
  });

  it('no request while the tickets load, nor when the thread is on no ticket', async () => {
    const { rerender } = render(
      <Section tickets={{ state: 'loading', rows: [], hiddenCount: 0, legacy: null }} />
    );
    await flush();
    rerender(<Section tickets={ready([])} />);
    await flush();
    expect(hoist.threadsCalls).toEqual([]);
  });

  it('starting a read for a new ticket keeps another ticket’s list', async () => {
    hoist.threadsImpl = (id) => (id === 7 ? listOf([thread(1)]) : new Promise(() => {}));
    const { rerender } = render(<Section tickets={ready([ticket(7)])} />);
    await flush();
    expect(within(card(7)).getByText('1 thread on this ticket')).toBeInTheDocument();
    rerender(<Section tickets={ready([ticket(7), ticket(9)])} />);
    await flush();
    expect(within(card(9)).getByText(LOADING_THREADS)).toBeInTheDocument();
    expect(within(card(7)).getByText('1 thread on this ticket')).toBeInTheDocument();
  });

  it('leaving one ticket keeps the other ticket’s list', async () => {
    hoist.threadsImpl = () => listOf([thread(1)]);
    const { rerender } = render(<Section tickets={ready([ticket(9), ticket(7)])} />);
    await flush();
    rerender(<Section tickets={ready([ticket(7)])} />);
    await flush();
    expect(within(card(7)).getByText('1 thread on this ticket')).toBeInTheDocument();
  });

  it('leave + rejoin: the pre-leave read that resolves late is not shown as current', async () => {
    const reads: Deferred<unknown>[] = [];
    hoist.threadsImpl = () => {
      const read = deferred<unknown>();
      reads.push(read);
      return read.promise;
    };
    const { rerender } = render(<Section tickets={ready([ticket(9)])} />);
    rerender(<Section tickets={ready([])} />);
    rerender(<Section tickets={ready([ticket(9)])} />);
    expect(reads).toHaveLength(2);
    await settle(() =>
      reads[0].resolve({
        unavailable: false,
        rows: [thread(77, { subject: 'OLD' })],
        hiddenCount: 0,
      })
    );
    expect(screen.queryByText('OLD')).toBeNull();
    expect(within(card(9)).getByText(LOADING_THREADS)).toBeInTheDocument();
  });

  it('leave + rejoin: the pre-leave read that FAILS late writes no failure', async () => {
    const reads: Deferred<unknown>[] = [];
    hoist.threadsImpl = () => {
      const read = deferred<unknown>();
      reads.push(read);
      return read.promise;
    };
    const { rerender } = render(<Section tickets={ready([ticket(9)])} />);
    rerender(<Section tickets={ready([])} />);
    rerender(<Section tickets={ready([ticket(9)])} />);
    await settle(() => reads[0].reject(new Error('late')));
    expect(screen.queryByText('We could not list the threads on this ticket just now.')).toBeNull();
    expect(hoist.errors).toEqual([]);
  });

  it('a read that fails after the popover closed logs nothing', async () => {
    const read = deferred<unknown>();
    hoist.threadsImpl = () => read.promise;
    const { unmount } = render(<Section tickets={ready([ticket(9)])} />);
    unmount();
    await settle(() => read.reject(new Error('after close')));
    expect(hoist.errors).toEqual([]);
  });

  it('CONTROL: a read that fails while open is logged and said', async () => {
    const read = deferred<unknown>();
    hoist.threadsImpl = () => read.promise;
    render(<Section tickets={ready([ticket(9)])} />);
    await settle(() => read.reject(new Error('open')));
    expect(hoist.errors).toHaveLength(1);
    expect(
      within(card(9)).getByText('We could not list the threads on this ticket just now.')
    ).toBeInTheDocument();
  });
});

describe('thread lists — ticket:updated', () => {
  it('a null payload is ignored without throwing', async () => {
    render(<Section tickets={ready([ticket(9)])} />);
    await flush();
    const [handler] = [...hoist.handlers];
    expect(() => handler(null)).not.toThrow();
    expect(hoist.threadsCalls).toEqual([9]);
  });

  it('an update for an unrelated ticket reads nothing; one for this ticket re-reads', async () => {
    hoist.threadsImpl = () => listOf([thread(1)]);
    render(<Section tickets={ready([ticket(9)])} />);
    await flush();
    act(() => hoist.handlers.forEach((handler) => handler({ ticketId: 999 })));
    act(() => hoist.handlers.forEach((handler) => handler({})));
    expect(hoist.threadsCalls).toEqual([9]);
    act(() => hoist.handlers.forEach((handler) => handler({ ticketId: 9 })));
    expect(hoist.threadsCalls).toEqual([9, 9]);
  });

  it('an update for a two-digit ticket id re-reads that ticket', async () => {
    hoist.threadsImpl = () => listOf([thread(1)]);
    render(<Section tickets={ready([ticket(12)])} />);
    await flush();
    act(() => hoist.handlers.forEach((handler) => handler({ ticketId: 12 })));
    expect(hoist.threadsCalls).toEqual([12, 12]);
  });

  it('a ticket added later is re-read on its update', async () => {
    hoist.threadsImpl = () => listOf([thread(1)]);
    const { rerender } = render(<Section tickets={ready([ticket(9)])} />);
    await flush();
    rerender(<Section tickets={ready([ticket(9), ticket(7)])} />);
    await flush();
    act(() => hoist.handlers.forEach((handler) => handler({ ticketId: 7 })));
    expect(hoist.threadsCalls.filter((id) => id === 7)).toHaveLength(2);
  });

  it('closing unsubscribes the same listener', async () => {
    const { unmount } = render(<Section tickets={ready([ticket(9)])} />);
    await flush();
    const sub = hoist.subscribed.find(([event]) => event === 'ticket:updated');
    expect(sub).toBeDefined();
    unmount();
    expect(hoist.unsubscribed).toContainEqual(['ticket:updated', sub![1]]);
    expect(hoist.handlers.size).toBe(0);
  });
});

describe('the card and its list', () => {
  it('status · priority: one dot, between them', () => {
    render(<Section tickets={ready([ticket(9)])} />);
    const status = within(card(9)).getByText(statusLabel('open'));
    const facts = status.parentElement!;
    expect(facts.textContent).toBe(`${statusLabel('open')}·${priorityLabel('high')}`);
    expect(status.textContent).toBe(statusLabel('open'));
  });

  it('an owed reply is a warning paragraph; nothing owed draws no paragraph', () => {
    render(<Section tickets={ready([ticket(9, { owesReply: true }), ticket(7)])} />);
    const owed = within(card(9)).getByText(/Ticket #9 is fixed/);
    expect(owed.tagName).toBe('P');
    expect(owed).toHaveClass('text-warning');
    expect(card(7).querySelector('p.text-warning')).toBeNull();
  });

  it('thread rows carry the row layout; a null subject reads "(no subject)"', async () => {
    hoist.threadsImpl = () => listOf([thread(1), thread(44, { subject: null })], 2);
    render(<Section tickets={ready([ticket(9)])} />);
    await flush();
    const row = within(card(9)).getByText('(no subject)', { exact: false }).closest('li')!;
    expect(row.className.split(' ')).toEqual(expect.arrayContaining(REL_GROUP_ROW.split(' ')));
    const hidden = within(card(9)).getByText('+ 2 in departments you cannot open');
    expect(hidden.className.split(' ')).toEqual(
      expect.arrayContaining([...REL_GROUP_ROW.split(' '), 'text-muted-foreground'])
    );
  });

  it('no "+ 0 in departments" row when no thread is hidden', async () => {
    hoist.threadsImpl = () => listOf([thread(1)], 0);
    render(<Section tickets={ready([ticket(9)])} />);
    await flush();
    expect(within(card(9)).getByText('1 thread on this ticket')).toBeInTheDocument();
    expect(screen.queryByText(/in departments you cannot open/)).toBeNull();
  });
});

describe('section states', () => {
  it('"Loading…" only while the tickets load', () => {
    const { rerender } = render(
      <Section tickets={{ state: 'loading', rows: [], hiddenCount: 0, legacy: null }} />
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    rerender(<Section tickets={ready([ticket(9)])} />);
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('no "+ 0 tickets" hint when none are hidden, ready or loading', () => {
    const { rerender } = render(<Section tickets={ready([ticket(9)], 0)} />);
    expect(screen.queryByText(/tickets? in departments/)).toBeNull();
    rerender(<Section tickets={{ state: 'loading', rows: [], hiddenCount: 0, legacy: null }} />);
    expect(screen.queryByText(/tickets? in departments/)).toBeNull();
  });
});

describe('Remove', () => {
  const removeButton = (id: number) =>
    within(card(id)).getByRole('button', { name: new RegExp(`^Remove from ticket #${id}`) });

  it('idle: every Remove reads "Remove"; pending: only the pressed one reads "Removing…", all disabled', async () => {
    const req = deferred<unknown>();
    hoist.removeImpl = () => req.promise;
    render(<Section tickets={ready([ticket(9), ticket(7)])} />);
    expect(removeButton(9)).toHaveTextContent(/^Remove$/);
    expect(removeButton(7)).toHaveTextContent(/^Remove$/);
    expect(removeButton(9)).toBeEnabled();
    fireEvent.click(removeButton(9));
    expect(removeButton(9)).toHaveTextContent(/^Removing…$/);
    expect(removeButton(7)).toHaveTextContent(/^Remove$/);
    expect(removeButton(9)).toBeDisabled();
    expect(removeButton(7)).toBeDisabled();
    await settle(() => req.resolve(undefined));
  });

  it('no error paragraph until a Remove fails; then a destructive one', async () => {
    hoist.removeImpl = () => Promise.reject(new Error('nope'));
    const { container } = render(<Section tickets={ready([ticket(9)])} />);
    expect(container.querySelector('p.text-destructive')).toBeNull();
    await settle(() => {
      fireEvent.click(removeButton(9));
    });
    const error = container.querySelector('p.text-destructive');
    expect(error).not.toBeNull();
    expect(error?.textContent ?? '').not.toBe('');
  });

  it('after a removal, a user who tabbed on keeps their place', async () => {
    const req = deferred<unknown>();
    hoist.removeImpl = () => req.promise;
    const { rerender } = render(<Section tickets={ready([ticket(9), ticket(7)])} />);
    fireEvent.click(removeButton(9));
    const add = screen.getByRole('button', { name: 'Add to ticket…' });
    add.focus();
    await settle(() => req.resolve(undefined));
    rerender(<Section tickets={ready([ticket(7)])} />);
    await flush();
    expect(document.activeElement).toBe(add);
  });

  it('after a removal with focus lost, focus goes to the next card’s Remove without scrolling', async () => {
    const req = deferred<unknown>();
    hoist.removeImpl = () => req.promise;
    const { rerender } = render(<Section tickets={ready([ticket(9), ticket(7)])} />);
    fireEvent.click(removeButton(9));
    (document.activeElement as HTMLElement | null)?.blur();
    await settle(() => req.resolve(undefined));
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    rerender(<Section tickets={ready([ticket(7)])} />);
    await flush();
    expect(document.activeElement).toBe(removeButton(7));
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('removing the only ticket with focus lost puts focus on the popover', async () => {
    const req = deferred<unknown>();
    hoist.removeImpl = () => req.promise;
    const { rerender } = render(<Section tickets={ready([ticket(9)])} />);
    fireEvent.click(removeButton(9));
    (document.activeElement as HTMLElement | null)?.blur();
    await settle(() => req.resolve(undefined));
    rerender(<Section tickets={ready([])} />);
    await flush();
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Related' }));
  });

  it('after a failed Remove, a user who tabbed on keeps their place', async () => {
    const req = deferred<unknown>();
    hoist.removeImpl = () => req.promise;
    render(<Section tickets={ready([ticket(9), ticket(7)])} />);
    fireEvent.click(removeButton(9));
    const add = screen.getByRole('button', { name: 'Add to ticket…' });
    add.focus();
    await settle(() => req.reject(new Error('nope')));
    await flush();
    expect(document.activeElement).toBe(add);
  });

  it('after a failed Remove with focus lost, focus returns to it without scrolling', async () => {
    const req = deferred<unknown>();
    hoist.removeImpl = () => req.promise;
    render(<Section tickets={ready([ticket(9), ticket(7)])} />);
    fireEvent.click(removeButton(9));
    (document.activeElement as HTMLElement | null)?.blur();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    await settle(() => req.reject(new Error('nope')));
    await flush();
    expect(document.activeElement).toBe(removeButton(9));
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    focus.mockRestore();
  });
});
