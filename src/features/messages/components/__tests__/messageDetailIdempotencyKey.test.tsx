/**
 * The kept idempotency key belongs to WHAT was sent (MessageDetail, rendered for real).
 *
 * The BE dedups a reply on (workspace, idempotency key): a repeated key returns the send already
 * accepted and sends nothing. A failed reply keeps its key so a true retry dedups a
 * success-but-timeout. That key used to be reused by ANY next reply — an edited text after a
 * timeout went out with the old key, the BE answered with the first send, the edited reply was
 * never sent and the composer cleared as if it had been. Same for a WhatsApp template with another
 * template or other parameters. Now: same payload → same key; any other payload → a new key.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';

// Any service method: a mock resolving to an empty list unless a test overrides it.
const { serviceMock, svc } = vi.hoisted(() => {
  const serviceMock = () => {
    const fns: Record<string, ReturnType<typeof vi.fn>> = {};
    return new Proxy(fns, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
        return target[key];
      },
    });
  };
  return {
    serviceMock,
    svc: { message: null as unknown as Record<string, ReturnType<typeof vi.fn>> },
  };
});

vi.mock('@/services/message.service', () => {
  svc.message = serviceMock();
  return { messageService: svc.message };
});
vi.mock('@/services/organization.service', () => ({ organizationService: serviceMock() }));
vi.mock('@/features/tickets/services/category.service', () => ({ categoryService: serviceMock() }));
vi.mock('@/services/settings.service', () => ({ labelService: serviceMock() }));
vi.mock('@/services/assignment.service', () => ({ assignmentService: serviceMock() }));
vi.mock('@/lib/api-client', () => ({ apiClient: serviceMock() }));
vi.mock('@/lib/socketManager', () => ({
  getSocket: vi.fn(() => null),
  releaseSocket: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isGlobalAdmin: false }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ departments: [], data: [], teamsEnabled: true }),
  useDepartmentById: () => null,
}));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ configured: true }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'acme' }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (store: unknown) => unknown) => select({ user: { id: 7 } }),
}));

// The composer reduced to two drafts and Send; the template picker to three sends.
vi.mock('../MessageComposer', () => ({
  MessageComposer: ({
    setComposer,
    onSend,
  }: {
    setComposer: (value: string) => void;
    onSend: () => void;
  }) => (
    <div data-testid="composer">
      <button type="button" onClick={() => setComposer('<p>Label is on its way</p>')}>
        type draft
      </button>
      <button type="button" onClick={() => setComposer('<p>Label is on its way, tracking 42</p>')}>
        edit draft
      </button>
      <button type="button" onClick={onSend}>
        send draft
      </button>
    </div>
  ),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}));
vi.mock('../MessagePanelTabs', () => ({ MessagePanelTabs: () => null }));
vi.mock('../ThreadMessageItem', () => ({ ThreadMessageItem: () => null }));
vi.mock('../MessageGhostBubble', () => ({ MessageGhostBubble: () => null }));
vi.mock('@/features/contacts/components/ContactProfilePanel', () => ({
  ContactProfilePanel: () => null,
}));
vi.mock('@/features/messages/components/SimilarMessagesDialog', () => ({
  SimilarMessagesDialog: () => null,
}));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));
vi.mock('@/features/messages/components/WhatsAppTemplatePicker', () => ({
  WhatsAppTemplatePicker: ({
    onSend,
  }: {
    onSend: (templateId: number, parameters: string[]) => void;
  }) => (
    <>
      <button type="button" onClick={() => onSend(5, ['Ann'])}>
        template 5 Ann
      </button>
      <button type="button" onClick={() => onSend(5, ['Bob'])}>
        template 5 Bob
      </button>
      <button type="button" onClick={() => onSend(6, ['Ann'])}>
        template 6 Ann
      </button>
    </>
  ),
}));
vi.mock('@/lib/routingCopy', () => ({ showRouteLearningNote: vi.fn() }));

import { MessageDetail } from '../MessageDetail';

// In progress and already mine: no "assign on reply?" prompt stands between Send and the call.
const thread = {
  id: 101,
  subject: 'Where is my order?',
  content: 'Hello',
  fromEmail: 'cust@example.com',
  fromName: 'Cust',
  sender: 'Cust <cust@example.com>',
  status: 'in_progress',
  lastReplyFromClient: true,
  assigneeId: 7,
  metadata: {},
  createdAt: '2026-09-22T10:00:00Z',
} as unknown as Message;

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const tree = (message: Message) => (
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <MessageDetail message={message} onClose={vi.fn()} />
    </MemoryRouter>
  </QueryClientProvider>
);
const renderDetail = (overrides: Partial<Message> = {}) =>
  render(tree({ ...thread, ...overrides }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const press = (key: string) => fireEvent.keyDown(document.body, { key });
// A timeout: the request may well have landed — exactly the case the kept key exists for.
const timeout = () =>
  Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });
const replies = () => svc.message.reply.mock.calls;

describe('a failed reply’s key is reused only by the SAME reply', () => {
  it('control: the identical reply sent again reuses the key (the BE dedups it)', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce({ success: true });
    renderDetail();
    click('type draft');
    click('send draft');
    await screen.findByRole('alert');
    click('send draft');
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = replies();
    expect(typeof first[5]).toBe('string');
    expect(second[1]).toBe(first[1]);
    expect(second[5]).toBe(first[5]);
  });

  it('🔴 an EDITED reply after a timeout gets a new key — the old one would return the first send', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce({ success: true });
    renderDetail();
    click('type draft');
    click('send draft');
    await screen.findByRole('alert');
    click('edit draft');
    click('send draft');
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = replies();
    expect(second[1]).toBe('<p>Label is on its way, tracking 42</p>');
    expect(typeof second[5]).toBe('string');
    expect(second[5]).not.toBe(first[5]);
  });

  it('control: a send that landed despite the error made the thread mine — re-pressing Send (no assign answer now) still reuses the key', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce({ success: true });
    const { rerender } = renderDetail({ assigneeId: null });
    click('type draft');
    click('send draft');
    fireEvent.click(await screen.findByTestId('assign-on-reply-me'));
    await screen.findByRole('alert');
    // The failure re-reads the thread: the first send did land, so it is assigned to me now.
    rerender(tree(thread));
    click('send draft');
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = replies();
    expect(first[9]).toBe('me');
    expect(second[9]).toBeUndefined();
    expect(second[5]).toBe(first[5]);
  });

  it('a note in between neither takes nor resets the key: the same reply still reuses it', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce({ success: true });
    svc.message.addNote = vi.fn().mockResolvedValue({ success: true });
    renderDetail();
    click('type draft');
    click('send draft');
    await screen.findByRole('alert');
    press('n');
    click('edit draft');
    click('send draft');
    await waitFor(() => expect(svc.message.addNote).toHaveBeenCalledTimes(1));
    press('r');
    click('type draft');
    click('send draft');
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = replies();
    expect(second[5]).toBe(first[5]);
  });
});

describe('a failed template’s key is reused only by the SAME template and parameters', () => {
  const failFirst = () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce({ success: true });
  };
  const sendTwice = async (first: string, second: string) => {
    renderDetail();
    click(first);
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    click(second);
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    return replies();
  };

  it('control: the same template and parameters again reuse the key', async () => {
    failFirst();
    const [failed, next] = await sendTwice('template 5 Ann', 'template 5 Ann');
    expect(typeof failed[5]).toBe('string');
    expect(next[5]).toBe(failed[5]);
  });

  it('🔴 a DIFFERENT template after a failed one gets a new key', async () => {
    failFirst();
    const [failed, next] = await sendTwice('template 5 Ann', 'template 6 Ann');
    expect(next[7]).toEqual({ templateId: 6, parameters: ['Ann'] });
    expect(typeof next[5]).toBe('string');
    expect(next[5]).not.toBe(failed[5]);
  });

  it('🔴 the same template with DIFFERENT parameters gets a new key', async () => {
    failFirst();
    const [failed, next] = await sendTwice('template 5 Ann', 'template 5 Bob');
    expect(next[7]).toEqual({ templateId: 5, parameters: ['Bob'] });
    expect(next[5]).not.toBe(failed[5]);
  });
});
