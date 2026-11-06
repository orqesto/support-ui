/**
 * MessageDetail wiring: an attachment chip in the thread opens the FILE VIEWER over the thread.
 * It used to switch the side panel to the Files tab and highlight the row, leaving the agent to
 * find and open the file from there (owner request 2026-11-04). Everything else on the page is
 * real; the rows and the panel are stubbed to what this wiring touches.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
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
vi.mock('@/services/category.service', () => ({ categoryService: serviceMock() }));
vi.mock('@/services/settings.service', () => ({ labelService: serviceMock() }));
vi.mock('@/services/assignment.service', () => ({ assignmentService: serviceMock() }));
const apiGetOverride = vi.hoisted(() => ({
  fn: (_path: string): Promise<unknown> => Promise.resolve({ data: [] }),
}));
vi.mock('@/lib/api-client', () => {
  const client = serviceMock();
  client.get = vi.fn((path: string) => apiGetOverride.fn(path));
  return { apiClient: client };
});
vi.mock('@/lib/socketManager', () => ({
  getSocket: vi.fn(() => null),
  releaseSocket: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isGlobalAdmin: false }),
}));
const depts = vi.hoisted(() => ({
  list: [] as Array<{ id: number; name: string; active: boolean }>,
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ departments: [], data: depts.list, teamsEnabled: true }),
  useDepartmentById: () => null,
}));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ configured: true }) }));
const media = vi.hoisted(() => ({ wide: false }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => media.wide }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'acme' }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (store: unknown) => unknown) => select({ user: { id: 7 } }),
}));

vi.mock('../MessageComposer', () => ({
  MessageComposer: ({
    shortcutHint,
    decisions,
    setComposer,
    onSend,
  }: {
    shortcutHint?: string;
    decisions?: React.ReactNode;
    setComposer: (value: string) => void;
    onSend: () => void;
  }) => (
    <div data-testid="composer">
      {shortcutHint}
      <button type="button" onClick={() => setComposer('<p>Label is on its way</p>')}>
        type draft
      </button>
      <button type="button" onClick={onSend}>
        send draft
      </button>
      {decisions}
    </div>
  ),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}));
vi.mock('../MessagePanelTabs', () => ({
  MessagePanelTabs: ({ tab, panelOpen }: { tab?: string; panelOpen?: boolean }) => (
    <div data-testid="panel-tabs" data-tab={tab} data-open={String(panelOpen)} />
  ),
}));
vi.mock('../ThreadMessageItem', () => ({
  ThreadMessageItem: ({
    attachments,
    onOpenAttachment,
  }: {
    attachments?: Array<{ id: number; originalFilename: string }>;
    onOpenAttachment?: (id: number) => void;
  }) => (
    <div>
      {(attachments ?? []).map((att) => (
        <button key={att.id} type="button" onClick={() => onOpenAttachment?.(att.id)}>
          chip {att.originalFilename}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('../MessageGhostBubble', () => ({ MessageGhostBubble: () => null }));
vi.mock('@/features/contacts/components/ContactProfilePanel', () => ({
  ContactProfilePanel: () => null,
}));
vi.mock('@/components/modals/SimilarMessagesDialog', () => ({ SimilarMessagesDialog: () => null }));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));

const note = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/lib/routingCopy', () => ({ showRouteLearningNote: note.show }));

import { MessageDetail } from '../MessageDetail';

const baseMessage = {
  id: 101,
  subject: 'Where is my order?',
  content: 'Hello',
  fromEmail: 'cust@example.com',
  fromName: 'Cust',
  sender: 'Cust <cust@example.com>',
  status: 'open',
  lastReplyFromClient: null,
  assigneeId: null,
  metadata: {},
  createdAt: '2026-09-22T10:00:00Z',
} as unknown as Message;

const thread = [
  {
    id: 501,
    conversationId: 101,
    type: 'inbound',
    content: 'Photo attached',
    createdAt: '2026-11-01T10:00:00Z',
    metadata: null,
  },
];
const files = [
  {
    id: 77,
    messageEventId: 501,
    originalFilename: 'parcel.jpg',
    mimeType: 'image/jpeg',
    size: 1234,
  },
];

const renderDetail = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MessageDetail message={baseMessage} onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  svc.message.getThreadMessages = vi.fn().mockResolvedValue({ success: true, data: thread });
  apiGetOverride.fn = (path: string) =>
    Promise.resolve(
      path === '/api/messages/101/attachments'
        ? { data: { success: true, data: files } }
        : { data: [] }
    );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MessageDetail — a file in the thread opens the viewer', () => {
  it('pressing an attachment chip opens the viewer, NOT the Files tab', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'chip parcel.jpg' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('file-viewer').textContent).toContain('parcel.jpg');
    const panel = screen.getByTestId('panel-tabs');
    expect(panel.getAttribute('data-tab')).not.toBe('attachments');
    expect(panel.getAttribute('data-open')).toBe('false');
  });

  it("a message's files follow the email's order (id), whatever order the API sends", async () => {
    const shuffled = [
      {
        id: 80,
        messageEventId: 501,
        originalFilename: 'third.jpg',
        mimeType: 'image/jpeg',
        size: 9,
      },
      {
        id: 78,
        messageEventId: 501,
        originalFilename: 'first.jpg',
        mimeType: 'image/jpeg',
        size: 9,
      },
      {
        id: 79,
        messageEventId: 501,
        originalFilename: 'second.jpg',
        mimeType: 'image/jpeg',
        size: 9,
      },
    ];
    apiGetOverride.fn = (path: string) =>
      Promise.resolve(
        path === '/api/messages/101/attachments'
          ? { data: { success: true, data: shuffled } }
          : { data: [] }
      );
    renderDetail();
    await screen.findByRole('button', { name: 'chip first.jpg' });
    const chips = screen.getAllByRole('button', { name: /^chip / }).map((chip) => chip.textContent);
    expect(chips).toEqual(['chip first.jpg', 'chip second.jpg', 'chip third.jpg']);
    fireEvent.click(screen.getByRole('button', { name: 'chip first.jpg' }));
    expect(within(screen.getByRole('dialog')).getByText('1 of 3')).toBeTruthy();
  });

  it('closing the viewer leaves the thread where it was', async () => {
    renderDetail();
    const chip = await screen.findByRole('button', { name: 'chip parcel.jpg' });
    const scroller = screen.getByTestId('thread-scroller');
    scroller.scrollTop = 240;
    fireEvent.click(chip);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('thread-scroller')).toBe(scroller);
    expect(scroller.scrollTop).toBe(240);
    expect(chip.isConnected).toBe(true);
  });
});
