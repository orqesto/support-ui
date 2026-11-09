/**
 * Thread presence (spec §5.5) outside the open thread: a single-thread action from a list row, a
 * kanban card or a drop onto the Spam lane asks first while a colleague writes a reply on that
 * thread (read from the list's presence summary); with nobody writing it runs at once. Also the
 * header More menu's "Not a lead — close", which closes the thread.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { MessageThread } from '@/services/message.service';
import type { Message, User } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { usePresenceSummaryStore } from '../../presence/presenceSummaryStore';

const service = vi.hoisted(() => ({
  classify: vi.fn(() => Promise.resolve({ success: true })),
  reopen: vi.fn(() => Promise.resolve()),
  markAsLead: vi.fn(() => Promise.resolve()),
  close: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/services/message.service', () => ({ messageService: service }));
// The picker itself: one button that asks through `beforeChange` the way AssignmentSelect does.
const assigned = vi.hoisted(() => vi.fn<() => void>());
vi.mock('@/components/admin/AssignmentSelect', () => ({
  AssignmentSelect: ({ beforeChange }: { beforeChange?: (run: () => void) => void }) => (
    <button
      type="button"
      onClick={() => {
        if (beforeChange) beforeChange(() => assigned());
        else assigned();
      }}
    >
      pick Ben
    </button>
  ),
}));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [] }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'SUP' }));

const { RowAssignee } = await import('../RowAssignee');
const { KanbanCard } = await import('../KanbanCard');
const { MessageListItem } = await import('../MessageListItem');
const { useKanbanDrag } = await import('../kanbanBoard/useKanbanDrag');
const { buildMoreMenuItems } = await import('../messageDetailHeader/buildMoreMenuItems');

const CONV = 41;
const thread = {
  threadId: `conv_${CONV}`,
  publicId: 'SUP-41',
  sender: 'buyer@shop.example',
  subject: 'Where is my order',
  status: 'in_progress',
  priority: 'medium',
  lastMessageAt: '2026-11-09T10:00:00Z',
  latestMessage: {
    id: CONV,
    type: 'inbound',
    content: 'any news?',
    channel: 'email',
    status: 'in_progress',
    assigneeId: null,
    createdAt: '2026-11-09T10:00:00Z',
    metadata: {},
  },
} as unknown as MessageThread;

const wrap = (node: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['presence-members', 1], [{ id: 7, firstName: 'Anna', lastName: null }]);
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};
const writing = (on: boolean) => {
  const store = usePresenceSummaryStore.getState();
  store.reset();
  store.applySnapshot(on ? { [CONV]: [{ userId: 7, state: 'writing_reply' }] } : {});
  store.setAvailable(true);
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 1 } as User, selectedOrganizationId: 1 });
});
afterEach(cleanup);

describe('list row and kanban card assign', () => {
  const pick = () => {
    fireEvent.click(screen.getByRole('button', { name: /Claim/ }));
    fireEvent.click(screen.getByRole('button', { name: 'pick Ben' }));
  };

  for (const [name, node] of [
    ['RowAssignee', () => <RowAssignee thread={thread} />],
    ['KanbanCard', () => <KanbanCard thread={thread} onOpen={() => {}} />],
  ] as const) {
    it(`${name}: a colleague writing a reply ⇒ asks; the assign waits for "Assign anyway"`, () => {
      writing(true);
      wrap(node());
      pick();
      expect(assigned).not.toHaveBeenCalled();
      expect(screen.getByText('Anna is writing a reply — assign anyway?')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Assign anyway' }));
      expect(assigned).toHaveBeenCalledTimes(1);
    });

    it(`${name}: nobody writing ⇒ assigns at once`, () => {
      writing(false);
      wrap(node());
      pick();
      expect(assigned).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/is writing a reply/)).toBeNull();
    });
  }
});

describe('the question inside a clickable card or row does not open the thread (fix round 2)', () => {
  const open = vi.fn();
  const places = [
    ['KanbanCard', () => <KanbanCard thread={thread} onOpen={open} />],
    ['MessageListItem row', () => <MessageListItem thread={thread} onOpen={open} />],
  ] as const;
  const ask = (node: () => ReactNode) => {
    writing(true);
    wrap(node());
    // Exact name: the row itself is a button whose name includes "Claim".
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }));
    fireEvent.click(screen.getByRole('button', { name: 'pick Ben' }));
    expect(screen.getByText('Anna is writing a reply — assign anyway?')).toBeInTheDocument();
  };
  beforeEach(() => open.mockClear());

  for (const [name, node] of places) {
    it(`${name}: pressing "Assign anyway" assigns and does not open the thread`, () => {
      ask(node);
      fireEvent.click(screen.getByRole('button', { name: 'Assign anyway' }));
      expect(assigned).toHaveBeenCalledTimes(1);
      expect(open).not.toHaveBeenCalled();
    });

    it(`${name}: pressing Cancel does not open the thread`, () => {
      ask(node);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(assigned).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    });

    it(`${name}: Space on "Assign anyway" assigns and does not open the thread`, async () => {
      const user = userEvent.setup();
      ask(node);
      screen.getByRole('button', { name: 'Assign anyway' }).focus();
      await user.keyboard(' ');
      expect(assigned).toHaveBeenCalledTimes(1);
      expect(open).not.toHaveBeenCalled();
    });

    it(`${name}: Escape closes the question without assigning or opening the thread`, async () => {
      const user = userEvent.setup();
      ask(node);
      screen.getByRole('button', { name: 'Assign anyway' }).focus();
      await user.keyboard('{Escape}');
      expect(screen.queryByText(/is writing a reply/)).toBeNull();
      expect(assigned).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    });

    it(`${name}: Enter on "Assign anyway" assigns and does not open the thread`, async () => {
      const user = userEvent.setup();
      ask(node);
      screen.getByRole('button', { name: 'Assign anyway' }).focus();
      await user.keyboard('{Enter}');
      expect(assigned).toHaveBeenCalledTimes(1);
      expect(open).not.toHaveBeenCalled();
    });
  }
});

describe('kanban drop onto Spam', () => {
  let dragEnd: (event: DragEndEvent) => Promise<void> = async () => {};
  let lanes: () => Record<string, { threads: MessageThread[] }> = () => ({});
  function Board() {
    const [colStates, setColStates] = useState<Record<string, never>>(
      () =>
        ({
          not_analysed: { threads: [thread], total: 1 },
          spam: { threads: [], total: 0 },
        }) as never
    );
    const colStatesRef = useRef(colStates);
    colStatesRef.current = colStates;
    lanes = () => colStatesRef.current as never;
    const drag = useKanbanDrag({
      queryClient: new QueryClient(),
      colStatesRef,
      setColStates: setColStates as never,
      setActiveThread: () => {},
      setActiveDragColId: () => {},
      activeTabRef: { current: 'triage' as never },
      loadBoard: (() => {}) as never,
    });
    dragEnd = (event) => drag.handleDragEnd(event);
    return <>{drag.writingGuardDialog}</>;
  }
  const drop = () =>
    act(() =>
      dragEnd({
        active: { id: thread.threadId, data: { current: { colId: 'not_analysed' } } },
        over: { id: 'spam' },
      } as unknown as DragEndEvent)
    );

  it('a colleague writing ⇒ asks; nothing moves, and cancel leaves the card in its lane', async () => {
    writing(true);
    wrap(<Board />);
    await drop();
    expect(screen.getByText('Anna is writing a reply — mark as spam anyway?')).toBeInTheDocument();
    expect(lanes().not_analysed.threads).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(service.classify).not.toHaveBeenCalled();
    expect(lanes().not_analysed.threads).toHaveLength(1);
    expect(lanes().spam.threads).toHaveLength(0);
  });

  it('a colleague writing ⇒ "Mark as spam anyway" moves and classifies', async () => {
    writing(true);
    wrap(<Board />);
    await drop();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as spam anyway' }));
    await waitFor(() => expect(service.classify).toHaveBeenCalledTimes(1));
    expect(lanes().spam.threads).toHaveLength(1);
  });

  it('nobody writing ⇒ classifies at once', async () => {
    writing(false);
    wrap(<Board />);
    await drop();
    expect(service.classify).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/is writing a reply/)).toBeNull();
  });
});

describe('header More menu: "Not a lead — close"', () => {
  const items = (guard?: Parameters<typeof buildMoreMenuItems>[0]['guard']) =>
    buildMoreMenuItems({
      message: { id: CONV, isLead: true } as Message,
      isActive: true,
      setMoreOpen: () => {},
      tickets: { list: [] },
      merges: [],
      threadMute: { muted: false },
      guard,
    } as unknown as Parameters<typeof buildMoreMenuItems>[0]);
  const notALead = (list: ReturnType<typeof buildMoreMenuItems>) => {
    const item = list.find((entry) => entry.label === 'Not a lead — close');
    if (!item) throw new Error('no "Not a lead — close" item');
    return item;
  };

  it('asks with the verb "close"; nothing is written until the guard runs it', async () => {
    let pending: (() => void) | null = null;
    const guard = vi.fn((_label: string, run: () => void) => {
      pending = run;
    });
    notALead(items(guard)).action();
    expect(guard).toHaveBeenCalledWith('close', expect.any(Function));
    expect(service.markAsLead).not.toHaveBeenCalled();
    (pending as unknown as () => void)();
    await waitFor(() => expect(service.close).toHaveBeenCalledWith(CONV));
  });

  it('no presence wired (default) ⇒ closes at once', async () => {
    notALead(items()).action();
    expect(service.markAsLead).toHaveBeenCalledWith(CONV, false);
    await waitFor(() => expect(service.close).toHaveBeenCalledWith(CONV));
  });
});
