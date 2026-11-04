import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

type ToastOptions = { action?: { label: string; onClick: () => void } } | undefined;
const toastFn = vi.hoisted(() => vi.fn<(message: string, options?: ToastOptions) => void>());
vi.mock('sonner', () => ({ toast: toastFn }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
const handlers = vi.hoisted(() => new Map<string, (data?: unknown) => void>());
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: (data?: unknown) => void) => {
    handlers.set(event, handler);
  },
  unsubscribeFromEvent: (event: string) => {
    handlers.delete(event);
  },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 21, user: { organizationId: 21 } }),
}));

const { useNotificationToast, resetNotificationToastDedupe } = await import('../NotificationToast');

const fire = (data: unknown) => act(() => handlers.get('notification:new')?.(data));
const setVisibility = (state: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

describe('useNotificationToast', () => {
  beforeEach(() => {
    toastFn.mockClear();
    navigate.mockClear();
    handlers.clear();
    resetNotificationToastDedupe();
    setVisibility('visible');
    renderHook(() => useNotificationToast());
  });
  afterEach(() => setVisibility('visible'));

  it.each([
    ['conversation_assigned', 'Assigned to you: Refund'],
    ['customer_message_on_assigned', 'Customer replied: Refund'],
    ['conversation_reopened', 'Thread reopened: Refund'],
    ['hold_recheck_due', 'Time to recheck: Refund'],
  ])('shows a toast for %s with an Open action', (kind, text) => {
    fire({ kind, organizationId: 21, id: 5, conversationId: 50, title: 'Refund' });
    expect(toastFn).toHaveBeenCalledTimes(1);
    const [message, options] = toastFn.mock.calls[0];
    expect(message).toBe(text);
    options?.action?.onClick();
    expect(navigate).toHaveBeenCalledWith('/threads/50');
  });

  it('uses the kind label alone without a title', () => {
    fire({ kind: 'conversation_assigned', organizationId: 21, id: 6, conversationId: 50 });
    expect(toastFn.mock.calls[0][0]).toBe('Assigned to you');
  });

  it('shows no Open action from an older backend without conversationId', () => {
    fire({ kind: 'conversation_assigned', organizationId: 21, id: 7 });
    expect(toastFn).toHaveBeenCalledTimes(1);
    expect(toastFn.mock.calls[0][1]?.action).toBeUndefined();
  });

  it('shows no toast for the content-free workspace ping', () => {
    fire({ kind: 'conversation_assigned', organizationId: 21 });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('shows no toast for team/admin kinds', () => {
    fire({ kind: 'sla_breach', organizationId: 21, id: 8, conversationId: 50, title: 'x' });
    fire({ kind: 'new_unassigned_message', organizationId: 21, id: 9, conversationId: 50 });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('does not toast twice for the same notification id', () => {
    const event = { kind: 'conversation_assigned', organizationId: 21, id: 10, conversationId: 50 };
    fire(event);
    fire(event);
    expect(toastFn).toHaveBeenCalledTimes(1);
  });

  it('shows no toast while the tab is hidden', () => {
    setVisibility('hidden');
    fire({ kind: 'conversation_assigned', organizationId: 21, id: 11, conversationId: 50 });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('ignores another workspace', () => {
    fire({ kind: 'conversation_assigned', organizationId: 99, id: 12, conversationId: 50 });
    expect(toastFn).not.toHaveBeenCalled();
  });
});
