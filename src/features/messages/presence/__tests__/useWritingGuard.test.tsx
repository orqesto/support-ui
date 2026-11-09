import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import {
  useListWritingGuard,
  useWritingGuard,
  type ConfirmIfWriting,
  type ConfirmIfWritingOn,
  type GuardLabel,
} from '../useWritingGuard';
import { usePresenceSummaryStore } from '../presenceSummaryStore';
import { countWritingThreads, bulkWritingNote } from '../bulkWriting';
import type { PresenceViewer } from '../presence.types';

vi.mock('@/services/organization.service', () => ({
  organizationService: { getMembers: () => Promise.resolve([]) },
}));

const MEMBERS = [
  { id: 1, userId: 7, firstName: 'Anna', lastName: 'Kim', email: 'a@x.io' },
  { id: 2, userId: 8, firstName: 'Ben', lastName: null, email: 'b@x.io' },
];
const viewer = (userId: number, state: PresenceViewer['state']): PresenceViewer => ({
  userId,
  state,
  since: '2026-11-09T12:00:00Z',
});

let guard: ConfirmIfWriting = () => {};
function Host({ viewers }: { viewers: PresenceViewer[] }) {
  const { confirmIfWriting, dialog } = useWritingGuard(viewers);
  guard = confirmIfWriting;
  return <>{dialog}</>;
}
const mount = (viewers: PresenceViewer[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['organization-members', 1], MEMBERS);
  return render(
    <QueryClientProvider client={client}>
      <Host viewers={viewers} />
    </QueryClientProvider>
  );
};
const press = (label: GuardLabel, run: () => void, onCancel?: () => void) =>
  act(() => guard(label, run, onCancel));

beforeEach(() => {
  useAuthStore.setState({ user: { id: 1 } as User, selectedOrganizationId: 1 });
});

describe('useWritingGuard — confirm an action while someone writes a reply (spec §5.5)', () => {
  it('only viewers: the action runs at once, no dialog', () => {
    mount([viewer(7, 'viewing'), viewer(8, 'writing_note')]);
    const run = vi.fn();
    press('close', run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('no presence (empty viewers): the action runs at once', () => {
    mount([]);
    const run = vi.fn();
    press('resolve', run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a colleague writing a reply: asks first with the copy; confirm runs the action', () => {
    mount([viewer(8, 'viewing'), viewer(7, 'writing_reply')]);
    const run = vi.fn();
    press('close', run);
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText('Anna Kim is writing a reply — close anyway?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirm runs the action exactly once and never reports a cancel (fix round 1)', () => {
    mount([viewer(7, 'writing_reply')]);
    const run = vi.fn();
    const cancelled = vi.fn();
    press('move', run, cancelled);
    fireEvent.click(screen.getByRole('button', { name: 'Move anyway' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalledTimes(0);
  });

  it('a second ask while the question is open is refused at once: its onCancel runs, not its action', () => {
    mount([viewer(7, 'writing_reply')]);
    const first = vi.fn();
    const second = vi.fn();
    const secondCancelled = vi.fn();
    press('close', first);
    press('assign', second, secondCancelled);
    expect(second).not.toHaveBeenCalled();
    expect(secondCancelled).toHaveBeenCalledTimes(1);
    // The first question is still the one on screen, and still works.
    expect(screen.getByText('Anna Kim is writing a reply — close anyway?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }));
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('Escape on a focused dialog button closes it, reports the cancel, and never runs (fix round 3)', async () => {
    const user = userEvent.setup();
    mount([viewer(7, 'writing_reply')]);
    const run = vi.fn();
    const cancelled = vi.fn();
    press('close', run, cancelled);
    screen.getByRole('button', { name: 'Close anyway' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it('Tab from the last dialog button stays inside the dialog (focus trap, fix round 3)', async () => {
    const user = userEvent.setup();
    mount([viewer(7, 'writing_reply')]);
    press('close', vi.fn());
    const dialog = screen.getByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('cancel does not run the action and tells the caller', () => {
    mount([viewer(7, 'writing_reply')]);
    const run = vi.fn();
    const cancelled = vi.fn();
    press('mark as spam', run, cancelled);
    expect(
      screen.getByText('Anna Kim is writing a reply — mark as spam anyway?')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(run).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('an away writer does not count', () => {
    mount([viewer(7, 'away')]);
    const run = vi.fn();
    press('assign', run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a writer missing from the member list is "Another agent"', () => {
    mount([viewer(99, 'writing_reply')]);
    press('merge', vi.fn());
    expect(
      screen.getByText('Another agent is writing a reply — merge anyway?')
    ).toBeInTheDocument();
  });

  it('ignores my own entry even if it reached the list', () => {
    mount([viewer(1, 'writing_reply')]);
    const run = vi.fn();
    press('move', run);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

let listGuard: ConfirmIfWritingOn = () => {};
function ListHost({ conversationId }: { conversationId?: number }) {
  const { confirmIfWriting, dialog } = useListWritingGuard(conversationId);
  listGuard = confirmIfWriting;
  return <>{dialog}</>;
}
const mountList = (conversationId?: number) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['organization-members', 1], MEMBERS);
  return render(
    <QueryClientProvider client={client}>
      <ListHost conversationId={conversationId} />
    </QueryClientProvider>
  );
};

describe('useListWritingGuard — a list row, card or page, from the presence summary', () => {
  beforeEach(() => {
    usePresenceSummaryStore.getState().reset();
    usePresenceSummaryStore.getState().applySnapshot({
      41: [{ userId: 7, state: 'writing_reply' }],
      42: [
        { userId: 8, state: 'viewing' },
        { userId: 1, state: 'writing_reply' },
      ],
      43: [{ userId: 7, state: 'away' }],
    });
    usePresenceSummaryStore.getState().setAvailable(true);
  });

  it("a colleague writing a reply on the row's thread: asks with the same copy", () => {
    mountList(41);
    const run = vi.fn();
    act(() => listGuard('assign', run));
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText('Anna Kim is writing a reply — assign anyway?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Assign anyway' }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('nobody else writing (only me, a viewer, or away): runs at once', () => {
    for (const id of [42, 43, 44]) {
      const { unmount } = mountList(id);
      const run = vi.fn();
      act(() => listGuard('assign', run));
      expect(run).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('a board passes the thread with the ask', () => {
    mountList();
    const run = vi.fn();
    act(() => listGuard('mark as spam', run, undefined, 41));
    expect(
      screen.getByText('Anna Kim is writing a reply — mark as spam anyway?')
    ).toBeInTheDocument();
    const other = vi.fn();
    cleanup();
    mountList();
    act(() => listGuard('mark as spam', other, undefined, 43));
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('presence summary down: runs at once, never asks', () => {
    usePresenceSummaryStore.getState().setAvailable(false);
    mountList(41);
    const run = vi.fn();
    act(() => listGuard('assign', run));
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('bulk: how many selected threads have someone writing a reply', () => {
  const byConversation = {
    10: [{ userId: 7, state: 'writing_reply' as const }],
    11: [{ userId: 1, state: 'writing_reply' as const }], // me — not counted
    12: [{ userId: 8, state: 'away' as const }],
    13: [
      { userId: 8, state: 'viewing' as const },
      { userId: 7, state: 'writing_reply' as const },
    ],
    99: [{ userId: 7, state: 'writing_reply' as const }], // not selected
  };

  it('counts selected threads with another non-away agent writing a reply', () => {
    expect(countWritingThreads([10, 11, 12, 13, 14], byConversation, 1)).toBe(2);
  });

  it('the note for a state-changing action', () => {
    expect(bulkWritingNote('resolve', [10, 11, 12, 13, 14, 15, 16, 17], byConversation, 1)).toBe(
      '2 of 8 threads have someone writing a reply — continue?'
    );
  });

  it('no note for read/unread or ticket creation, nor when nobody writes', () => {
    expect(bulkWritingNote('mark_read', [10, 13], byConversation, 1)).toBeNull();
    expect(bulkWritingNote('mark_unread', [10, 13], byConversation, 1)).toBeNull();
    expect(bulkWritingNote('create_ticket', [10, 13], byConversation, 1)).toBeNull();
    expect(bulkWritingNote('spam', [11, 12, 14], byConversation, 1)).toBeNull();
  });
});
