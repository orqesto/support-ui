import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';

/**
 * A row's assignee picker (list row, Kanban card) by keyboard, with the REAL AssignmentSelect and
 * Select — only the network is mocked. A hand-made stand-in for the Select hid two bugs on
 * 2026-11-11: react-select marks EVERY Escape defaultPrevented (so the picker never closed from
 * the box), and nothing moved focus into the picker (so a keyboard user could not reach it).
 *
 *   Claim → focus lands in the assignee box → ArrowDown opens the list → Escape closes only the
 *   list → Escape closes the picker, focus back on Claim — and the page's own Escape never fires.
 *
 * Plus the focus timing: it lands only once the list has loaded (a disabled box takes no focus),
 * and never on a touch-first screen, where it would just pop the on-screen keyboard.
 */

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (pick: (state: { user: { id: number } }) => unknown) => pick({ user: { id: 5 } }),
}));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));
vi.mock('../../presence/useWritingGuard', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useListWritingGuard: () => ({
    confirmIfWriting: (_label: string, run: () => void) => run(),
    dialog: null,
  }),
}));
const assignment = vi.hoisted(() => ({
  getAssignableUsers: vi.fn(),
  assignThread: vi.fn(),
  assignMessage: vi.fn(),
  assignTicket: vi.fn(),
}));
vi.mock('@/services/assignment.service', () => ({ assignmentService: assignment }));

import { RowAssignee } from '../RowAssignee';
import { KanbanCard } from '../KanbanCard';

const pageEscape = vi.fn();
const onPageKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') pageEscape();
};
beforeEach(() => {
  assignment.getAssignableUsers.mockResolvedValue([
    { id: 9, firstName: 'Dana', lastName: 'Lee', email: 'dana@northwind.example', role: 'agent' },
  ]);
  document.addEventListener('keydown', onPageKey);
});
afterEach(() => {
  document.removeEventListener('keydown', onPageKey);
  cleanup();
  vi.clearAllMocks();
});

const thread = (): MessageThread =>
  ({
    threadId: 'conv_7',
    sender: 'marta@northwind.example',
    subject: 'Wrong size, need exchange',
    status: 'open',
    priority: 'high',
    lastMessageAt: new Date().toISOString(),
    messageCount: 1,
    latestMessage: {
      id: 7,
      conversationId: 7,
      publicId: 'SUP-7',
      type: 'inbound',
      status: 'open',
      priority: 'high',
      content: 'I still have not got the label.',
      subject: 'Wrong size, need exchange',
      channel: 'email',
      createdAt: new Date().toISOString(),
      assigneeId: null,
      metadata: {},
    },
  }) as unknown as MessageThread;

const surfaces = [
  ['list row', (item = thread()) => <RowAssignee thread={item} />],
  ['Kanban card', (item = thread()) => <KanbanCard thread={item} onOpen={() => {}} />],
] as const;

const picker = () => screen.queryByRole('dialog', { name: 'Assign to' });
const box = () => screen.getByRole('combobox', { name: 'Assignee' });
const listOpen = () => screen.queryByRole('listbox') !== null;
const escape = (target: Element) =>
  act(() => {
    fireEvent.keyDown(target, { key: 'Escape' });
  });

/** Claim pressed (Enter on a button is its click) → wait for the box to hold the focus. */
const openFromClaim = async () => {
  const claim = screen.getByRole('button', { name: /Claim/ });
  claim.focus();
  fireEvent.click(claim);
  expect(picker()).not.toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(box()));
  return claim;
};

describe.each(surfaces)('%s — assignee picker by keyboard', (_name, ui) => {
  it('opening it from Claim puts the focus in the assignee box', async () => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    await openFromClaim();
  });

  it('Escape with the list open closes only the list; the next one closes the picker', async () => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    const claim = await openFromClaim();
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(listOpen()).toBe(true);

    escape(box());
    expect(listOpen()).toBe(false);
    expect(picker()).not.toBeNull();

    escape(box());
    expect(picker()).toBeNull();
    expect(document.activeElement).toBe(claim);
    expect(pageEscape).not.toHaveBeenCalled();
  });

  it('Escape in the box with the list closed closes the picker at once', async () => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    const claim = await openFromClaim();
    escape(box());
    expect(picker()).toBeNull();
    expect(document.activeElement).toBe(claim);
    expect(pageEscape).not.toHaveBeenCalled();
  });

  it('Escape on Claim itself (picker open) closes it', async () => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    const claim = await openFromClaim();
    claim.focus();
    escape(claim);
    expect(picker()).toBeNull();
  });

  it('CONTROL: another key leaves the picker open', async () => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    await openFromClaim();
    fireEvent.keyDown(box(), { key: 'a' });
    expect(picker()).not.toBeNull();
  });
});

/** A list that arrives only when the test says so. */
const lateList = () => {
  let release: () => void = () => undefined;
  assignment.getAssignableUsers.mockReturnValue(
    new Promise((resolve) => {
      release = () =>
        resolve([
          {
            id: 9,
            firstName: 'Dana',
            lastName: 'Lee',
            email: 'dana@northwind.example',
            role: 'agent',
          },
        ]);
    })
  );
  return () =>
    act(async () => {
      release();
      await Promise.resolve(); // let the list's promise settle inside act
    });
};

/** `touchOnly`: no fine pointer at all (a phone); otherwise a mouse or trackpad is present too. */
const stubPointer = (touchOnly: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === '(any-pointer: fine)' ? !touchOnly : false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
  );

describe.each(surfaces)('%s — when the focus moves into the picker', (_name, ui) => {
  afterEach(() => vi.unstubAllGlobals());

  it('waits for a slow list, then focuses the box', async () => {
    const release = lateList();
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    const claim = screen.getByRole('button', { name: /Claim/ });
    claim.focus();
    fireEvent.click(claim);
    expect(picker()).not.toBeNull();
    expect(document.activeElement).toBe(claim); // the box is still disabled — nothing to focus

    await release();
    await waitFor(() => expect(document.activeElement).toBe(box()));
  });

  it('touch only (no fine pointer): the box is NOT focused — no on-screen keyboard over the list', async () => {
    stubPointer(true);
    const release = lateList();
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Claim/ }));
    await release();
    expect(box()).not.toBeInactive(); // the list has loaded
    expect(document.activeElement).not.toBe(box());
  });

  it('CONTROL: touch plus a fine pointer (tablet + trackpad), same steps — the box IS focused', async () => {
    stubPointer(false);
    const release = lateList();
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Claim/ }));
    await release();
    await waitFor(() => expect(document.activeElement).toBe(box()));
  });

  it('a later refetch (the thread changed team) does not pull the focus back', async () => {
    const { rerender } = render(<MemoryRouter>{ui()}</MemoryRouter>);
    const claim = await openFromClaim();
    claim.focus(); // the agent has moved on

    const moved = thread();
    (moved.latestMessage as { departmentId?: number }).departmentId = 3;
    rerender(<MemoryRouter>{ui(moved)}</MemoryRouter>);
    await waitFor(() => expect(assignment.getAssignableUsers).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(box()).not.toBeInactive());
    expect(picker()).not.toBeNull();
    expect(document.activeElement).toBe(claim);
  });
});
