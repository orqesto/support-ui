/**
 * The ghost bubble pre-fills the composer's suggestion from `metadata.suggestedAnswer` — a reply a
 * model wrote for this message. Once a workspace switches AI drafts off, a reply written BEFORE the
 * switch is still stored there and nothing server-side can take it back, so the page must not
 * offer it (nor while the setting is still unknown).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
  useDepartments: () => ({ departments: [] }),
  useDepartmentById: () => null,
}));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ configured: true }) }));
const aiDrafts = vi.hoisted(() => ({ off: false, resolved: true }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: aiDrafts.resolved }),
  useRefreshAiDrafts: () => () => undefined,
}));
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
  MessagePanelTabs: ({ variant }: { variant?: string }) => (
    <div data-testid="panel-tabs" data-variant={variant ?? 'rail'} />
  ),
}));
vi.mock('../ThreadMessageItem', () => ({ ThreadMessageItem: () => null }));
vi.mock('../MessageGhostBubble', () => ({
  MessageGhostBubble: ({ ghostOption }: { ghostOption: { answer?: string } | null }) => (
    <div data-testid="ghost">{ghostOption?.answer ?? ''}</div>
  ),
}));
vi.mock('@/components/contacts/ContactProfilePanel', () => ({ ContactProfilePanel: () => null }));
vi.mock('@/components/modals/SimilarMessagesDialog', () => ({ SimilarMessagesDialog: () => null }));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));

import { MessageDetail } from '../MessageDetail';

const STORED = 'Your refund was approved yesterday.';

const message = {
  id: 202,
  subject: 'Refund?',
  content: 'Hello',
  fromEmail: 'cust@example.com',
  fromName: 'Cust',
  sender: 'Cust <cust@example.com>',
  status: 'open',
  lastReplyFromClient: null,
  assigneeId: null,
  metadata: { suggestedAnswer: { answer: STORED, source: 'ai', confidence: 0.9 } },
  createdAt: '2026-09-24T10:00:00Z',
} as unknown as Message;

const renderDetail = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <MessageDetail message={message} onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  aiDrafts.off = false;
  aiDrafts.resolved = true;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MessageDetail ghost — AI drafts off', () => {
  it('does not pre-fill a stored AI reply with drafts off', () => {
    aiDrafts.off = true;
    renderDetail();
    expect(screen.queryByText(STORED)).not.toBeInTheDocument();
  });

  it('does not pre-fill it while the setting is unknown', () => {
    aiDrafts.resolved = false;
    renderDetail();
    expect(screen.queryByText(STORED)).not.toBeInTheDocument();
  });

  it('pre-fills it with drafts on (control)', () => {
    renderDetail();
    expect(screen.getByText(STORED)).toBeInTheDocument();
  });
});
