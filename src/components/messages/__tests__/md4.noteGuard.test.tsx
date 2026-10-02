/**
 * The composer holds ONE text for both Reply and Internal note. "Reply to this message" on a
 * thread bubble and the R shortcut both switch it to Reply — with an internal note being written,
 * that turned words for the team into the customer reply draft, one Send away. Both now refuse
 * (the lookup / KB inserts' toast, nothing switched, recipients untouched); a BLANK note still
 * switches exactly as before. Real MessageDetail, MessageComposer and MessagePanelTabs.
 *
 * Self-contained rather than on md4.mobile.utils.tsx: that file's editor stand-in takes no ref, so
 * R's focus of the reply editor could not be seen; its mocks would override this file's.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as ReactModule from 'react';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message, MessageEvent } from '@/types';
import { MessageDetail } from '../MessageDetail';
import { PHONE_QUERY } from '../useIsPhone';

const { serviceMock, svc, aiDrafts } = vi.hoisted(() => {
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
    aiDrafts: { off: false, configured: true },
  };
});

vi.mock('@/services/message.service', () => {
  svc.message = serviceMock();
  return { messageService: svc.message };
});
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: {
    availability: () => Promise.resolve(false),
    lookupOptions: () => Promise.resolve([]),
    run: vi.fn(),
  },
}));
vi.mock('@/services/organization.service', () => ({ organizationService: serviceMock() }));
vi.mock('@/services/category.service', () => ({ categoryService: serviceMock() }));
vi.mock('@/services/settings.service', () => ({ labelService: serviceMock() }));
vi.mock('@/services/assignment.service', () => ({ assignmentService: serviceMock() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: vi.fn(() => null),
  releaseSocket: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isGlobalAdmin: false, isOrgAdmin: true }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [], departments: [] }),
  useDepartmentById: () => null,
}));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: aiDrafts.configured, isLoading: false }),
}));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true }),
  useRefreshAiDrafts: () => () => {},
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'acme' }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (store: unknown) => unknown) =>
    select({ user: { id: 7, organizationId: 3, firstName: 'Dana' }, selectedOrganizationId: 3 }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
vi.mock('@/components/contacts/ContactProfilePanel', () => ({ ContactProfilePanel: () => null }));
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));
vi.mock('@/components/modals/SimilarMessagesDialog', () => ({ SimilarMessagesDialog: () => null }));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: ReactModule.ReactNode }) => <div>{children}</div>,
}));

// In each test file, not the shared utils (servicePathsCarryApiPrefix.test.ts reads non-tests).
vi.mock('@/lib/api-client', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    apiClient: new Proxy(fns, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
        return target[key];
      },
    }),
  };
});
const toastSpy = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: toastSpy }));
// Forwards focus() as the real editor's handle does, so R's focus can be checked.
vi.mock('@/components/shared/RichTextEditor', async () => {
  const { forwardRef, useImperativeHandle, useRef } =
    await vi.importActual<typeof ReactModule>('react');
  const Editor = forwardRef<
    { focus: () => void },
    { content?: string; onChange?: (val: string) => void; placeholder?: string }
  >(({ content, onChange, placeholder }, ref) => {
    const area = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));
    return (
      <textarea
        ref={area}
        data-testid="rich-text-editor"
        placeholder={placeholder}
        value={content ?? ''}
        onChange={(change) => onChange?.(change.target.value)}
      />
    );
  });
  return { default: Editor, extractImageFiles: () => [] };
});

const setViewport = (phone: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: phone && query === PHONE_QUERY,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
};

const baseMessage = {
  id: 101,
  publicId: 'SUP-101',
  subject: 'Wrong size delivered, need exchange before Friday',
  content: 'Hello',
  channel: 'email',
  sender: 'Ada Lovelace <ada@example.com>',
  status: 'in_progress',
  lastReplyFromClient: true,
  assigneeId: 7,
  metadata: { analysis: { category: 'other' } },
  recipients: { to: ['support@acme.test'], cc: ['billing@acme.test'], bcc: [] },
  createdAt: '2026-09-22T10:00:00Z',
} as unknown as Message;

const renderDetail = (
  overrides: Partial<Message> = {},
  props: Partial<React.ComponentProps<typeof MessageDetail>> = {}
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = props.onClose ?? vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MessageDetail message={{ ...baseMessage, ...overrides }} {...props} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, onClose };
};

const event = (over: Partial<MessageEvent>): MessageEvent =>
  ({
    id: 501,
    type: 'inbound',
    content: 'Hi there',
    authorEmail: 'ada@example.com',
    createdAt: '2026-09-22T10:00:00Z',
    ...over,
  }) as unknown as MessageEvent;

const composer = () => screen.getByTestId('message-composer');
const NOTE = '<p>for the team only</p>';
const WRITER = 'ada@example.com';
const NOTICE = 'Post or clear your internal note first';
const railTab = (name: string) =>
  within(screen.getByTestId('panel-tabs-root')).getByRole('button', {
    name: new RegExp(`^${name}`),
  });
const editor = () => within(composer()).getByTestId<HTMLTextAreaElement>('rich-text-editor');
const mode = () =>
  within(composer()).getByRole('button', { name: 'Internal note' }).getAttribute('aria-pressed') ===
  'true'
    ? 'note'
    : 'reply';
const toNote = () => {
  fireEvent.click(railTab('Notes'));
  expect(mode()).toBe('note');
};
const writeNote = () => {
  toNote();
  fireEvent.change(editor(), { target: { value: NOTE } });
};
const replyToThisMessage = async () =>
  fireEvent.click(await screen.findByRole('button', { name: 'Reply to this message' }));
const pressR = () => fireEvent.keyDown(document.body, { key: 'r' });
const pressN = () => fireEvent.keyDown(document.body, { key: 'n' });
const writeReply = (text = REPLY) => {
  expect(mode()).toBe('reply');
  fireEvent.change(editor(), { target: { value: text } });
};
const REPLY = '<p>words for the customer</p>';
/** The reply's To field, as the agent would see it (expanding the summary if folded). */
const toField = () => {
  const expand = within(composer()).queryByRole('button', { name: 'Edit recipients' });
  if (expand) fireEvent.click(expand);
  return within(composer()).getByLabelText<HTMLInputElement>('To');
};

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  toastSpy.info.mockClear();
  svc.message.markRead = vi.fn().mockResolvedValue({ success: true });
  svc.message.getSimilarResolvedMessages = vi.fn().mockResolvedValue({ success: true, data: [] });
  svc.message.getKBReferences = vi.fn().mockResolvedValue({ success: true, data: [] });
  svc.message.getThreadMessages = vi
    .fn()
    .mockResolvedValue({ data: [event({ replyTarget: [WRITER] } as never)] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe.each([
  ['phone', true],
  ['slide-over', false],
])('%s: an unsent internal note is never switched to Reply', (_where, phone) => {
  beforeEach(() => setViewport(phone));

  it('note typed → "Reply to this message": still a note, text kept, recipients unchanged, toast', async () => {
    renderDetail();
    writeNote();
    await replyToThisMessage();
    expect(mode()).toBe('note');
    expect(editor().value).toBe(NOTE);
    expect(toastSpy.info).toHaveBeenCalledWith(NOTICE);
    // Recipients: clear the note, go to Reply by hand — the To field was never set.
    fireEvent.change(editor(), { target: { value: '' } });
    fireEvent.click(within(composer()).getByRole('button', { name: 'Reply' }));
    expect(mode()).toBe('reply');
    expect(toField().value).toBe('');
  });

  it('CONTROL: blank note → "Reply to this message" switches to Reply, addressed to the writer', async () => {
    renderDetail();
    toNote();
    await replyToThisMessage();
    expect(mode()).toBe('reply');
    expect(toField().value).toBe(WRITER);
    expect(toastSpy.info).not.toHaveBeenCalled();
  });

  it('note typed → R: still a note, text kept, toast', () => {
    renderDetail();
    writeNote();
    pressR();
    expect(mode()).toBe('note');
    expect(editor().value).toBe(NOTE);
    expect(toastSpy.info).toHaveBeenCalledWith(NOTICE);
  });

  it('CONTROL: blank note → R switches to Reply and focuses the reply editor', () => {
    vi.useFakeTimers();
    try {
      renderDetail();
      toNote();
      pressR();
      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(mode()).toBe('reply');
      expect(document.activeElement).toBe(editor());
      expect(toastSpy.info).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

/*
  The rule keys on the mode the words were last EDITED in, not the mode on screen: a reply carried
  into note mode by N is still a reply (the failed-send bar's Retry relies on N → R coming back).
*/
describe.each([
  ['phone', true],
  ['slide-over', false],
])('%s: the mode the words were written in decides', (_where, phone) => {
  beforeEach(() => setViewport(phone));

  it('(1) reply typed → N → R: back to Reply, text kept, no toast', () => {
    renderDetail();
    writeReply();
    pressN();
    expect(mode()).toBe('note');
    pressR();
    expect(mode()).toBe('reply');
    expect(editor().value).toBe(REPLY);
    expect(toastSpy.info).not.toHaveBeenCalled();
  });

  it('(1) reply typed → Notes tab → Customer tab: the rail flips it back to Reply', () => {
    renderDetail();
    writeReply();
    fireEvent.click(railTab('Notes'));
    expect(mode()).toBe('note');
    fireEvent.click(railTab('Customer'));
    expect(mode()).toBe('reply');
  });

  it('(1) the note editor re-normalising the same words (TipTap on mount) is not a note edit', () => {
    renderDetail();
    writeReply('words for the customer');
    pressN();
    fireEvent.change(editor(), { target: { value: '<p>words for the customer</p>' } });
    pressR();
    expect(mode()).toBe('reply');
    expect(toastSpy.info).not.toHaveBeenCalled();
  });

  it('(3) reply typed → N → more typed as a note → R: refused, the latest words are a note', () => {
    renderDetail();
    writeReply();
    pressN();
    fireEvent.change(editor(), { target: { value: `${REPLY}<p>internal: VIP</p>` } });
    pressR();
    expect(mode()).toBe('note');
    expect(toastSpy.info).toHaveBeenCalledWith(NOTICE);
  });
});

describe('slide-over: (4) a programmatic insert counts as an edit in the mode it lands in', () => {
  // Desktop only: on a phone N goes back to the Thread tab, so the AI tab is not on screen.
  beforeEach(() => setViewport(false));

  it('blank note → AI tab "Use in reply" lands as a reply → N → R: back to Reply', async () => {
    renderDetail({
      metadata: {
        analysis: { category: 'other' },
        suggestedAnswer: { answer: 'Thanks for waiting', source: 'ai' },
      },
    } as never);
    fireEvent.click(railTab('AI'));
    pressN();
    expect(mode()).toBe('note');
    fireEvent.click(await screen.findByRole('button', { name: 'Use in reply' }));
    expect(mode()).toBe('reply');
    expect(editor().value).toContain('Thanks for waiting');
    pressN();
    pressR();
    expect(mode()).toBe('reply');
    expect(toastSpy.info).not.toHaveBeenCalled();
  });
});
