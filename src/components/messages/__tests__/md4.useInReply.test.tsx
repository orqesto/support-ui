/**
 * A lookup record's "Use in reply" is offered always: a record is plain data an agent can state to
 * the customer as it stands. While the AI note can be used (AI drafts on AND a provider configured
 * — the composer's own two predicates) it adds to that note, unchanged.
 * When it cannot, the exact sentence goes into the REPLY: a new paragraph at its end, the composer
 * switched to Reply, shown (phone: back on the Thread tab) and focused — and not stamped as AI.
 *
 * The real side panel is stubbed: the control's own copy is CustomApiRecordInsert.test.tsx; this
 * file is what the HOST does with the sentence.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  forwardRef,
  useContext,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';

const { serviceMock, svc, aiDrafts, focusCalls } = vi.hoisted(() => {
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
    focusCalls: [] as (string | undefined)[],
  };
});
const toastSpy = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  failure: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: toastSpy }));

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
vi.mock('@/lib/api-client', () => ({ apiClient: serviceMock() }));
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
// TipTap does not run here; the stand-in reports what the composer asked of it.
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: forwardRef(
    (
      {
        content,
        onChange,
        placeholder,
      }: { content?: string; onChange?: (val: string) => void; placeholder?: string },
      ref
    ) => {
      const area = useRef<HTMLTextAreaElement>(null);
      useImperativeHandle(ref, () => ({
        focus: (position?: string) => {
          focusCalls.push(position);
          area.current?.focus();
        },
        insertText: () => {},
        setContent: () => {},
      }));
      return (
        <textarea
          ref={area}
          data-testid="rich-text-editor"
          placeholder={placeholder}
          value={content ?? ''}
          onChange={(event) => onChange?.(event.target.value)}
        />
      );
    }
  ),
  extractImageFiles: () => [],
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
vi.mock('@/components/contacts/ContactProfilePanel', () => ({ ContactProfilePanel: () => null }));
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));
vi.mock('@/components/modals/SimilarMessagesDialog', () => ({
  SimilarMessagesDialog: ({
    open,
    onSelectAnswer,
  }: {
    open: boolean;
    onSelectAnswer: (answer: string, source?: string) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onSelectAnswer('A similar answer', 'message')}>
        pick similar answer
      </button>
    ) : null,
}));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const SENTENCE = 'Their records: order 137416, status On its way, placed 2026-09-01.';
const SECOND_SENTENCE = 'Their records: order 137417, status Delivered.';

// The side panel: a Lookups tab whose record control calls the host's onUseInReply.
vi.mock('../MessagePanelTabs', () => ({
  MessagePanelTabs: function PanelStub(props: MessagePanelTabsProps) {
    const [outcome, setOutcome] = useState('');
    // What the real record control reads to word its hint, button and outcome.
    const target = useContext(RecordInsertTargetContext);
    return (
      <div
        data-testid="panel-tabs"
        data-tab={props.tab}
        data-open={String(props.panelOpen)}
        data-target={target}
        data-has-insert={String(props.onUseInReply !== undefined)}
        data-has-ghost={String(props.onGhostClick !== undefined)}
      >
        <button
          type="button"
          onClick={() => {
            props.setTab('lookups');
            props.setPanelOpen(true);
          }}
        >
          open Lookups tab
        </button>
        {/* What the REAL rail tab does on a phone / slide-over (MessagePanelTabs): it also asks
            for Reply mode — md4.panelModeGuard.test.tsx proves the real one goes through here. */}
        <button
          type="button"
          onClick={() => {
            props.setTab('lookups');
            props.setPanelOpen(true);
            props.setComposerMode('reply');
          }}
        >
          rail Lookups tab
        </button>
        <button type="button" onClick={() => setOutcome(props.onUseInReply?.(SENTENCE) ?? '')}>
          use record
        </button>
        {/* Two adds in ONE handler: one render batch, so the second cannot read the state. */}
        <button
          type="button"
          onClick={() => {
            const first = props.onUseInReply?.(SENTENCE) ?? '';
            setOutcome(`${first},${props.onUseInReply?.(SECOND_SENTENCE) ?? ''}`);
          }}
        >
          use two records
        </button>
        <button
          type="button"
          onClick={() => {
            props.setTab('kb');
            props.setPanelOpen(true);
          }}
        >
          open KB tab
        </button>
        {/* The KB tab's "Use in reply" (and the AI tab's sources) call the host's onGhostClick. */}
        <button type="button" onClick={() => props.onGhostClick?.('Thanks for waiting', 'kb')}>
          use KB answer
        </button>
        <output data-testid="outcome">{outcome}</output>
      </div>
    );
  },
}));

import { MessageDetail } from '../MessageDetail';
import { MessageGhostBubble } from '../MessageGhostBubble';
import type { MessagePanelTabsProps } from '../MessagePanelTabs';
import { RecordInsertTargetContext } from '../useAiRecordNote';
import { PHONE_QUERY } from '../useIsPhone';

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
  subject: 'Where is my order?',
  content: 'Hello',
  channel: 'email',
  sender: 'Ada Lovelace <ada@example.com>',
  status: 'in_progress',
  lastReplyFromClient: true,
  assigneeId: 7,
  metadata: { analysis: { category: 'other' } },
  createdAt: '2026-09-22T10:00:00Z',
} as unknown as Message;

const renderDetail = (overrides: Partial<Message> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MessageDetail message={{ ...baseMessage, ...overrides }} onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const composer = () => screen.getByTestId('message-composer');
const editor = () => within(composer()).getByTestId<HTMLTextAreaElement>('rich-text-editor');
const modeTab = (name: 'Reply' | 'Internal note') =>
  within(composer()).getByRole('button', { name });
const useRecord = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'use record' }));
  // The focus is deferred a task (the reply editor may only mount with this render).
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};
const outcome = () => screen.getByTestId('outcome').textContent;

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  aiDrafts.off = false;
  aiDrafts.configured = true;
  focusCalls.length = 0;
  setViewport(false);
  svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: [] });
  svc.message.markRead = vi.fn().mockResolvedValue({ success: true });
  svc.message.reply = vi.fn().mockResolvedValue({ success: true, data: {} });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('"Use in reply" when the AI note is usable: the note, unchanged', () => {
  it('drafts on + a provider: the sentence goes to the AI note, the reply is untouched', async () => {
    renderDetail();
    await useRecord();
    expect(screen.getByTestId('panel-tabs').getAttribute('data-target')).toBe('note');
    expect(outcome()).toBe('added');
    expect(editor().value).toBe('');
    // The AI panel opens on the note holding the sentence (ComposerAiActions' reveal).
    expect(screen.getByDisplayValue(SENTENCE)).toBeTruthy();
    expect(focusCalls).toEqual([]);
  });
});

describe('No usable AI note: the sentence goes into the REPLY', () => {
  it.each([
    [
      'AI drafts off',
      () => {
        aiDrafts.off = true;
      },
    ],
    [
      'no AI provider',
      () => {
        aiDrafts.configured = false;
      },
    ],
  ] as const)('%s: appended to the reply, which is focused at its end', async (_name, setup) => {
    setup();
    renderDetail();
    await useRecord();
    // The record control is told, so its words say "reply".
    expect(screen.getByTestId('panel-tabs').getAttribute('data-target')).toBe('reply');
    expect(outcome()).toBe('added');
    expect(editor().value).toBe(`<p>${SENTENCE}</p>`);
    expect(modeTab('Reply').getAttribute('aria-pressed')).toBe('true');
    expect(focusCalls).toEqual(['end']);
    expect(document.activeElement).toBe(editor());
  });

  it('a reply already being written: the sentence is a NEW paragraph after it', async () => {
    aiDrafts.off = true;
    renderDetail();
    fireEvent.change(editor(), { target: { value: '<p>Hi Ada,</p>' } });
    await useRecord();
    expect(editor().value).toBe(`<p>Hi Ada,</p><p>${SENTENCE}</p>`);
  });

  it('the exact sentence is already in the reply: not added twice', async () => {
    aiDrafts.off = true;
    renderDetail();
    await useRecord();
    await useRecord();
    expect(outcome()).toBe('duplicate');
    expect(editor().value).toBe(`<p>${SENTENCE}</p>`);
  });

  it('two adds in one batch: both sentences land, the second on top of the first', async () => {
    aiDrafts.off = true;
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'use two records' }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(outcome()).toBe('added,added');
    expect(editor().value).toBe(`<p>${SENTENCE}</p><p>${SECOND_SENTENCE}</p>`);
  });

  it('CONTROL: part of the sentence in the reply is not the sentence — still added', async () => {
    aiDrafts.off = true;
    renderDetail();
    fireEvent.change(editor(), { target: { value: '<p>order 137416</p>' } });
    await useRecord();
    expect(outcome()).toBe('added');
    expect(editor().value).toContain(`<p>${SENTENCE}</p>`);
  });

  it('from Internal note mode with nothing typed: switches to Reply and inserts', async () => {
    aiDrafts.off = true;
    renderDetail();
    fireEvent.click(modeTab('Internal note'));
    await useRecord();
    expect(modeTab('Reply').getAttribute('aria-pressed')).toBe('true');
    expect(editor().value).toBe(`<p>${SENTENCE}</p>`);
  });

  it('an internal note being written is NOT carried into the reply', async () => {
    aiDrafts.off = true;
    renderDetail();
    fireEvent.click(modeTab('Internal note'));
    fireEvent.change(editor(), { target: { value: '<p>for the team only</p>' } });
    await useRecord();
    expect(outcome()).toBe('note_in_progress');
    expect(modeTab('Internal note').getAttribute('aria-pressed')).toBe('true');
    expect(editor().value).toBe('<p>for the team only</p>');
  });

  it('a note being written, then a rail tab: still a note, so Use in reply refuses', async () => {
    aiDrafts.off = true;
    renderDetail();
    fireEvent.click(modeTab('Internal note'));
    fireEvent.change(editor(), { target: { value: '<p>for the team only</p>' } });
    fireEvent.click(screen.getByRole('button', { name: 'rail Lookups tab' }));
    expect(modeTab('Internal note').getAttribute('aria-pressed')).toBe('true');
    await useRecord();
    expect(outcome()).toBe('note_in_progress');
    expect(editor().value).toBe('<p>for the team only</p>');
  });

  it('the send is the agent’s own text — not stamped as AI-drafted', async () => {
    aiDrafts.off = true;
    renderDetail();
    await useRecord();
    fireEvent.click(within(composer()).getByRole('button', { name: /SEND/ }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(svc.message.reply).toHaveBeenCalledTimes(1);
    const args = svc.message.reply.mock.calls[0];
    expect(args[1]).toBe(`<p>${SENTENCE}</p>`);
    expect(args[3]).toBe(false); // aiDrafted
    expect(args[4]).toBeUndefined(); // aiSource
  });

  it('WhatsApp window shut: inserting still works; Send stays blocked', async () => {
    aiDrafts.off = true;
    renderDetail({
      channel: 'whatsapp',
      whatsappWindow: { open: false, expiresAt: null, reason: 'expired' },
    } as Partial<Message>);
    await useRecord();
    expect(editor().value).toBe(`<p>${SENTENCE}</p>`);
    expect(within(composer()).getByRole('button', { name: /SEND/ })).toBeDisabled();
  });

  it('phone: from the Lookups tab it goes back to Thread with the composer open', async () => {
    aiDrafts.off = true;
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'open Lookups tab' }));
    expect(screen.getByTestId('panel-tabs').getAttribute('data-open')).toBe('true');
    // Under the Lookups tab a phone hides the composer.
    expect(composer().className).toMatch(/(^|\s)hidden(\s|$)/);
    await useRecord();
    expect(screen.getByTestId('panel-tabs').getAttribute('data-open')).toBe('false');
    expect(composer().className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(composer().getAttribute('data-phone-state')).toBe('open');
    expect(editor().value).toBe(`<p>${SENTENCE}</p>`);
    expect(focusCalls).toEqual(['end']);
  });
});

describe('A KB / AI-sources answer used from a panel', () => {
  const useKbAnswer = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'use KB answer' }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  };

  it('phone: from the KB tab it goes back to Thread, the composer open with the answer, focused', async () => {
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'open KB tab' }));
    expect(screen.getByTestId('panel-tabs').getAttribute('data-open')).toBe('true');
    expect(composer().className).toMatch(/(^|\s)hidden(\s|$)/);
    await useKbAnswer();
    expect(screen.getByTestId('panel-tabs').getAttribute('data-open')).toBe('false');
    expect(composer().className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(composer().getAttribute('data-phone-state')).toBe('open');
    expect(editor().value).toContain('Thanks for waiting');
    expect(focusCalls).toHaveLength(1);
  });

  it('CONTROL desktop: the panel stays where it is; the answer lands in the composer, focused', async () => {
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'open KB tab' }));
    await useKbAnswer();
    expect(screen.getByTestId('panel-tabs').getAttribute('data-open')).toBe('true');
    expect(screen.getByTestId('panel-tabs').getAttribute('data-tab')).toBe('kb');
    expect(editor().value).toContain('Thanks for waiting');
    expect(focusCalls).toHaveLength(1);
  });
});

describe('A suggested answer never silently replaces what the agent wrote', () => {
  const useKbAnswer = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'use KB answer' }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  };
  const confirmDialog = () => screen.queryByRole('dialog');
  const sendArgs = async () => {
    fireEvent.click(within(composer()).getByRole('button', { name: /SEND/ }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    return svc.message.reply.mock.calls[0] as unknown[];
  };

  it('composer blank: inserted at once, no question, stamped as the KB answer', async () => {
    renderDetail();
    await useKbAnswer();
    expect(confirmDialog()).toBeNull();
    expect(editor().value).toBe('<p>Thanks for waiting</p>');
    const args = await sendArgs();
    expect(args[3]).toBe(true); // aiDrafted
    expect(args[4]).toBe('kb'); // aiSource
  });

  it('a reply being written: asks first; Cancel keeps the reply untouched', async () => {
    renderDetail();
    fireEvent.change(editor(), { target: { value: '<p>Hi Ada, I checked</p>' } });
    await useKbAnswer();
    const dialog = confirmDialog();
    expect(dialog).toHaveTextContent('Replace your reply with this answer?');
    expect(editor().value).toBe('<p>Hi Ada, I checked</p>');
    fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Cancel' }));
    expect(confirmDialog()).toBeNull();
    expect(editor().value).toBe('<p>Hi Ada, I checked</p>');
    expect(focusCalls).toEqual([]);
    // The agent's own text: not stamped as AI.
    const args = await sendArgs();
    expect(args[3]).toBe(false);
    expect(args[4]).toBeUndefined();
  });

  it('a reply being written: Replace puts the answer in, stamped as before', async () => {
    renderDetail();
    fireEvent.change(editor(), { target: { value: '<p>Hi Ada, I checked</p>' } });
    await useKbAnswer();
    fireEvent.click(
      within(confirmDialog() as HTMLElement).getByRole('button', { name: 'Replace' })
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(confirmDialog()).toBeNull();
    expect(editor().value).toBe('<p>Thanks for waiting</p>');
    expect(focusCalls).toHaveLength(1);
    const args = await sendArgs();
    expect(args[3]).toBe(true);
    expect(args[4]).toBe('kb');
  });

  it('an internal note being written: untouched, still a note, and the agent is told why', async () => {
    renderDetail();
    fireEvent.click(modeTab('Internal note'));
    fireEvent.change(editor(), { target: { value: '<p>for the team only</p>' } });
    await useKbAnswer();
    expect(confirmDialog()).toBeNull();
    expect(editor().value).toBe('<p>for the team only</p>');
    expect(modeTab('Internal note').getAttribute('aria-pressed')).toBe('true');
    expect(toastSpy.info).toHaveBeenCalledWith('Post or clear your internal note first');
  });

  it('a note being written, then a rail tab: no "Replace your reply" over the note', async () => {
    renderDetail();
    fireEvent.click(modeTab('Internal note'));
    fireEvent.change(editor(), { target: { value: '<p>for the team only</p>' } });
    fireEvent.click(screen.getByRole('button', { name: 'rail Lookups tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'use KB answer' }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(confirmDialog()).toBeNull();
    expect(editor().value).toBe('<p>for the team only</p>');
    expect(toastSpy.info).toHaveBeenCalledWith('Post or clear your internal note first');
  });

  it('CONTROL: an EMPTY internal note still switches to Reply and inserts (as before)', async () => {
    renderDetail();
    fireEvent.click(modeTab('Internal note'));
    await useKbAnswer();
    expect(confirmDialog()).toBeNull();
    expect(modeTab('Reply').getAttribute('aria-pressed')).toBe('true');
    expect(editor().value).toBe('<p>Thanks for waiting</p>');
    expect(toastSpy.info).not.toHaveBeenCalled();
  });

  it('the similar-messages dialog asks the same question over a reply being written', () => {
    renderDetail();
    fireEvent.change(editor(), { target: { value: '<p>Hi Ada</p>' } });
    fireEvent.click(within(composer()).getByTitle('Search knowledge base'));
    fireEvent.click(screen.getByRole('button', { name: 'pick similar answer' }));
    expect(confirmDialog()).toHaveTextContent('Replace your reply with this answer?');
    expect(editor().value).toBe('<p>Hi Ada</p>');
  });

  it('phone: the question shows over the KB tab; Cancel stays there, Replace goes back to Thread', async () => {
    setViewport(true);
    renderDetail();
    fireEvent.change(editor(), { target: { value: '<p>Hi Ada</p>' } });
    fireEvent.click(screen.getByRole('button', { name: 'open KB tab' }));
    await useKbAnswer();
    expect(confirmDialog()).toHaveTextContent('Replace your reply with this answer?');
    expect(screen.getByTestId('panel-tabs').getAttribute('data-open')).toBe('true');
    fireEvent.click(within(confirmDialog() as HTMLElement).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('panel-tabs').getAttribute('data-open')).toBe('true');
    expect(editor().value).toBe('<p>Hi Ada</p>');
    await useKbAnswer();
    fireEvent.click(
      within(confirmDialog() as HTMLElement).getByRole('button', { name: 'Replace' })
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByTestId('panel-tabs').getAttribute('data-open')).toBe('false');
    expect(composer().className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(editor().value).toBe('<p>Thanks for waiting</p>');
  });
});

describe('The ghost bubble only offers itself over an EMPTY reply, so it never needs to ask', () => {
  const ghost = (composerText: string, mode: 'reply' | 'note' = 'reply') =>
    render(
      <MessageGhostBubble
        aiLoading={false}
        ghostVisible
        ghostOption={{ answer: 'Thanks for waiting', label: 'Docs', type: 'documentation' }}
        autoReply={undefined}
        composer={composerText}
        composerMode={mode}
        resolved={false}
        alternativeCount={1}
        onGhostClick={vi.fn()}
        onShowAlternatives={vi.fn()}
      />
    );

  it.each([[''], ['<p></p>']])('composer %j: the bubble is offered', (text) => {
    ghost(text);
    expect(screen.getByText('Tap to insert into reply')).toBeInTheDocument();
  });

  it.each([
    ['a reply being written', '<p>Hi Ada</p>', 'reply'],
    ['an internal note being written', '<p>for the team</p>', 'note'],
    ['an empty internal note', '', 'note'],
  ] as const)('%s: no bubble', (_name, text, mode) => {
    ghost(text, mode);
    expect(screen.queryByText('Tap to insert into reply')).toBeNull();
  });
});

describe('"Use in reply" only where the composer exists', () => {
  const hasInsert = () => screen.getByTestId('panel-tabs').getAttribute('data-has-insert');

  it.each([
    ['closed', { status: 'closed' }],
    ['filtered', { status: 'filtered' }],
    ['suspicious', { metadata: { spamCheck: { category: 'suspicious' } } }],
    ['flagged spam outside triage', { metadata: { spamCheck: { isSpam: true } } }],
  ] as const)(
    '%s thread: no composer, so no insert control — for the reply AND the AI note',
    (_name, overrides) => {
      for (const configured of [true, false]) {
        aiDrafts.configured = configured;
        renderDetail(overrides as Partial<Message>);
        expect(screen.queryByTestId('message-composer')).toBeNull();
        expect(hasInsert()).toBe('false');
        cleanup();
      }
    }
  );

  it.each([true, false])(
    'CONTROL: an active thread offers it (AI note usable: %s)',
    (configured) => {
      aiDrafts.configured = configured;
      renderDetail();
      expect(composer()).toBeInTheDocument();
      expect(hasInsert()).toBe('true');
    }
  );
});

describe('Delete message is offered only when the host passes onDelete', () => {
  const renderWith = (onDelete?: () => void) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MessageDetail message={baseMessage} onClose={vi.fn()} onDelete={onDelete} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    return screen.getByRole('menu');
  };

  it('no onDelete (a viewer the backend would refuse): no Delete message item', () => {
    expect(within(renderWith()).queryByText('Delete message')).toBeNull();
  });

  it('CONTROL: with onDelete the item is there and calls it', () => {
    const onDelete = vi.fn();
    fireEvent.click(within(renderWith(onDelete)).getByText('Delete message'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('A KB / AI-sources answer is offered only where the composer exists', () => {
  const hasGhost = () => screen.getByTestId('panel-tabs').getAttribute('data-has-ghost');

  it.each([
    ['closed', { status: 'closed' }],
    ['filtered', { status: 'filtered' }],
    ['suspicious', { metadata: { spamCheck: { category: 'suspicious' } } }],
    ['flagged spam outside triage', { metadata: { spamCheck: { isSpam: true } } }],
  ] as const)(
    '%s thread: no answer handler for the panel, and no ghost bubble',
    (_name, overrides) => {
      renderDetail(overrides as Partial<Message>);
      expect(screen.queryByTestId('message-composer')).toBeNull();
      expect(hasGhost()).toBe('false');
      expect(screen.queryByText(/No suggestion found/)).toBeNull();
    }
  );

  it('CONTROL: an active thread hands the panel the handler and shows the ghost bubble', () => {
    renderDetail();
    expect(composer()).toBeInTheDocument();
    expect(hasGhost()).toBe('true');
    expect(screen.getByText(/No suggestion found/)).toBeInTheDocument();
  });
});
