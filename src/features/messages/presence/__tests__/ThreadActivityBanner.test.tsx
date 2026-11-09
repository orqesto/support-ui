import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { User } from '@/types';
import { useAuthStore } from '@/stores/authStore';

const handlers = vi.hoisted(() => new Map<string, (data: unknown) => void>());
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: (data: unknown) => void) => {
    handlers.set(event, handler);
  },
  unsubscribeFromEvent: (event: string) => {
    handlers.delete(event);
  },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getMembers: () => Promise.resolve(MEMBERS) },
}));
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => Promise.resolve(DEPARTMENTS) },
}));

const MEMBERS = [
  { id: 1, userId: 7, firstName: 'Anna', lastName: null, email: 'a@x.io' },
  { id: 2, userId: 8, firstName: 'Ben', lastName: null, email: 'b@x.io' },
];
const DEPARTMENTS = [{ id: 3, name: 'Billing' }];

const { useThreadActivity } = await import('../useThreadActivity');
const { ThreadActivityBanner, activityText } = await import('../ThreadActivityBanner');
const { AssignedNote, showAssignedNote } = await import('../AssignedNote');

const ME = 1;
const CONV = 41;
const fire = (event: string, data: unknown) => act(() => handlers.get(event)?.(data));
const names = (userId: number) => ({ 7: 'Anna', 8: 'Ben', 1: 'Me' })[userId] ?? 'Another agent';
const dept = (id: number) => (id === 3 ? 'Billing' : undefined);

beforeEach(() => {
  handlers.clear();
  useAuthStore.setState({ user: { id: ME } as User, selectedOrganizationId: 1 });
});

const text = (result: { current: ReturnType<typeof useThreadActivity> }) =>
  result.current.activity ? activityText(result.current.activity, names, dept) : null;

describe('useThreadActivity — what a colleague just did to the open thread (spec §5.3)', () => {
  it('my own action shows no banner', () => {
    const { result } = renderHook(() => useThreadActivity(CONV));
    fire('conversation:updated', { conversationId: CONV, action: 'close', actorUserId: ME });
    fire('message:replied', { messageId: CONV, repliedBy: ME });
    expect(result.current.activity).toBeNull();
  });

  it('an event with no actor (the system) shows no banner', () => {
    const { result } = renderHook(() => useThreadActivity(CONV));
    fire('conversation:updated', { conversationId: CONV, action: 'close' });
    fire('message:replied', { messageId: CONV, repliedBy: null });
    fire('conv:status_changed', { conversationId: CONV, status: 'resolved', actorUserId: null });
    expect(result.current.activity).toBeNull();
  });

  it('a colleague\'s close: "Anna closed this thread"', () => {
    const { result } = renderHook(() => useThreadActivity(CONV));
    fire('conversation:updated', { conversationId: CONV, action: 'close', actorUserId: 7 });
    expect(text(result)).toBe('Anna closed this thread');
  });

  it('CONTROL: another thread changes nothing', () => {
    const { result } = renderHook(() => useThreadActivity(CONV));
    fire('conversation:updated', { conversationId: 42, action: 'close', actorUserId: 7 });
    fire('message:replied', { messageId: 42, repliedBy: 7 });
    fire('conversation:routed', { conversationId: 42, departmentId: 3, routedBy: 7 });
    expect(result.current.activity).toBeNull();
  });

  it('assign / unassign name the new owner', () => {
    const { result } = renderHook(() => useThreadActivity(CONV));
    fire('conversation:updated', {
      conversationId: CONV,
      action: 'assign',
      assigneeId: 8,
      actorUserId: 7,
    });
    expect(text(result)).toBe('Anna assigned it to Ben');
    fire('conversation:updated', {
      conversationId: CONV,
      action: 'assign',
      assigneeId: null,
      actorUserId: 7,
    });
    expect(text(result)).toBe('Anna unassigned it');
  });

  it('a move names the team, or "another team" when unknown', () => {
    const { result } = renderHook(() => useThreadActivity(CONV));
    fire('conversation:routed', { conversationId: CONV, departmentId: 3, routedBy: 7 });
    expect(text(result)).toBe('Anna moved it to Billing');
    fire('conversation:routed', { conversationId: CONV, departmentId: 77, routedBy: 7 });
    expect(text(result)).toBe('Anna moved it to another team');
  });

  it('a merge into another thread names it; a merge into this one does not', () => {
    const { result } = renderHook(() => useThreadActivity(CONV));
    fire('conversation:updated', {
      conversationId: 12,
      conversationIds: [12, CONV],
      publicId: 'SUP-12',
      action: 'merge',
      actorUserId: 7,
    });
    expect(text(result)).toBe('Anna merged it into SUP-12');
    fire('conversation:updated', {
      conversationId: CONV,
      conversationIds: [CONV, 50],
      publicId: 'SUP-41',
      action: 'merge',
      actorUserId: 7,
    });
    expect(text(result)).toBe('Anna merged this thread');
  });

  it('spam (single and bulk) and status changes', () => {
    const { result } = renderHook(() => useThreadActivity(CONV));
    fire('conversation:updated', { conversationId: CONV, action: 'move_to_spam', actorUserId: 7 });
    expect(text(result)).toBe('Anna marked it spam');
    fire('conversation:updated', {
      conversationId: 1,
      conversationIds: [1, CONV],
      action: 'bulk_spam',
      actorUserId: 8,
    });
    expect(text(result)).toBe('Ben marked it spam');
    fire('conversation:updated', {
      conversationId: CONV,
      action: 'status_change',
      status: 'closed',
      actorUserId: 7,
    });
    expect(text(result)).toBe('Anna closed this thread');
  });

  it('actions it cannot name (reopen, unmerge, approve) are ignored', () => {
    const { result } = renderHook(() => useThreadActivity(CONV));
    for (const action of ['reopen', 'unmerge', 'approve', 'mark_suspicious']) {
      fire('conversation:updated', { conversationId: CONV, action, actorUserId: 7 });
    }
    expect(result.current.activity).toBeNull();
  });

  it('the newest replaces the previous; dismiss clears it', () => {
    const { result } = renderHook(() => useThreadActivity(CONV));
    fire('message:replied', { messageId: CONV, repliedBy: 7 });
    expect(text(result)).toBe('Anna just replied');
    fire('conversation:updated', { conversationId: CONV, action: 'close', actorUserId: 8 });
    expect(text(result)).toBe('Ben closed this thread');
    act(() => result.current.dismiss());
    expect(result.current.activity).toBeNull();
  });
});

const wrap = (node: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

describe('ThreadActivityBanner', () => {
  it('"Anna just replied — view": view refreshes the thread (the draft is not touched)', async () => {
    const onView = vi.fn();
    const onDismiss = vi.fn();
    wrap(
      <ThreadActivityBanner
        activity={{ kind: 'replied', actorId: 7 }}
        onView={onView}
        onDismiss={onDismiss}
      />
    );
    expect(await screen.findByText('Anna just replied')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'view' }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('other banners have no view, and are dismissable', async () => {
    const onDismiss = vi.fn();
    wrap(
      <ThreadActivityBanner
        activity={{ kind: 'moved', actorId: 8, departmentId: 3 }}
        onView={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    expect(await screen.findByText('Ben moved it to Billing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'view' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('nothing to show renders nothing', () => {
    const { container } = wrap(
      <ThreadActivityBanner activity={null} onView={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Assigned-to-other note (decision 6)', () => {
  const reply = '<p>Hello</p>';
  it('shown: reply draft non-blank, assigned to someone else', () => {
    expect(showAssignedNote({ assigneeId: 7, myId: ME, composer: reply, mode: 'reply' })).toBe(
      true
    );
  });
  it('hidden: blank draft, note mode, unassigned, or assigned to me', () => {
    expect(showAssignedNote({ assigneeId: 7, myId: ME, composer: '<p></p>', mode: 'reply' })).toBe(
      false
    );
    expect(showAssignedNote({ assigneeId: 7, myId: ME, composer: reply, mode: 'note' })).toBe(
      false
    );
    expect(showAssignedNote({ assigneeId: null, myId: ME, composer: reply, mode: 'reply' })).toBe(
      false
    );
    expect(
      showAssignedNote({ assigneeId: undefined, myId: ME, composer: reply, mode: 'reply' })
    ).toBe(false);
    expect(showAssignedNote({ assigneeId: ME, myId: ME, composer: reply, mode: 'reply' })).toBe(
      false
    );
  });
  it('renders "Assigned to Anna"', async () => {
    wrap(<AssignedNote assigneeId={7} />);
    expect(await screen.findByText('Assigned to Anna')).toBeInTheDocument();
  });
});
