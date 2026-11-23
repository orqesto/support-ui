/**
 * Chat widgets (backend 2026-11-23): a widget's AI answers can be switched off — in its form and
 * on its card — and each widget has a read-only "Chats" view: who wrote, whether the bot
 * answered, what was said, and the inbox thread when the chat was handed over. A chat the bot
 * answered and never handed over can be read nowhere else. The real settings section, form and
 * view; invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ChatWidget } from '@/features/settings/services/chatWidget.service';

const state = vi.hoisted(() => ({
  widgets: [] as unknown[],
  updates: [] as Array<[number, Record<string, unknown>]>,
  creates: [] as Array<Record<string, unknown>>,
  /** What the server answers a save with (it may not know the switch). */
  saved: {} as Record<string, unknown>,
  sessionsAsked: [] as Array<[number, number, number]>,
  sessionAsked: [] as Array<[number, number]>,
  sessionsFail: false,
  sessionFail: false,
}));

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
const session = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  startedAt: '2026-11-22T10:00:00Z',
  lastMessageAt: '2026-11-22T10:05:00Z',
  messageCount: 4,
  visitorName: null,
  visitorEmail: null,
  conversationId: null,
  botAnswered: false,
  ...over,
});
const SESSIONS = [
  session(31, { visitorName: 'Ada', visitorEmail: 'ada@example.com', conversationId: 640 }),
  session(32, { botAnswered: true, messageCount: 1 }),
  session(33, { visitorEmail: 'anonymous@chat-widget.local', visitorName: 'Dana' }),
];
vi.mock('@/features/settings/services/chatWidget.service', () => ({
  chatWidgetService: {
    getAll: () => Promise.resolve({ success: true, data: state.widgets }),
    update: (id: number, data: Record<string, unknown>) => {
      state.updates.push([id, data]);
      state.widgets = (state.widgets as ChatWidget[]).map((row) =>
        row.id === id && 'aiAnswersEnabled' in row ? { ...row, ...data } : row
      );
      return Promise.resolve({ success: true, data: state.saved });
    },
    create: (data: Record<string, unknown>) => {
      state.creates.push(data);
      return Promise.resolve({ success: true, data: state.saved });
    },
    delete: vi.fn(),
    getSessions: (id: number, page: number, limit: number) => {
      state.sessionsAsked.push([id, page, limit]);
      if (state.sessionsFail)
        return Promise.reject(
          Object.assign(new Error('Chat widget not found'), {
            status: 404,
            response: { status: 404, data: { success: false, error: 'Chat widget not found' } },
          })
        );
      return Promise.resolve({
        sessions: page === 1 ? SESSIONS : [session(40, { visitorEmail: 'bo@example.com' })],
        pagination: { page, limit, total: 26, totalPages: 2 },
      });
    },
    getSession: (id: number, sessionId: number) => {
      state.sessionAsked.push([id, sessionId]);
      if (state.sessionFail)
        return Promise.reject(
          Object.assign(new Error('Chat session not found'), {
            status: 404,
            response: { status: 404, data: { success: false, error: 'Chat session not found' } },
          })
        );
      return Promise.resolve({
        session: SESSIONS.find((row) => row.id === sessionId) ?? session(sessionId),
        messages: [
          {
            id: 1,
            role: 'user',
            author: 'visitor',
            content: 'Do you ship abroad?',
            createdAt: '2026-11-22T10:00:00Z',
            confidence: null,
          },
          {
            id: 2,
            role: 'assistant',
            author: 'bot',
            content: 'Yes, to most countries.',
            createdAt: '2026-11-22T10:00:05Z',
            confidence: 91,
          },
          {
            id: 3,
            role: 'assistant',
            author: 'notice',
            content: 'Please leave your email address.',
            createdAt: '2026-11-22T10:01:00Z',
            confidence: null,
          },
        ],
        truncated: sessionId === 32,
      });
    },
  },
}));
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => Promise.resolve([]) },
}));
vi.mock('@/services/message.service', () => ({
  messageService: { getMessageSourcesForFilter: () => Promise.resolve([]) },
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { ChatWidgetSettings } from '../ChatWidgetSettings';

const widget = (extra: Partial<ChatWidget> = {}): ChatWidget => ({
  id: 5,
  organizationId: 1,
  name: 'Site chat',
  departmentId: null,
  departmentIds: [],
  enabled: true,
  welcomeMessage: 'Hi',
  placeholder: 'Type…',
  collectUserInfo: true,
  primaryColor: '#0070F3',
  position: 'bottom-right',
  widgetKey: 'cw_x',
  messagesPerSession: 20,
  allowedDomains: [],
  metadata: {},
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  aiAnswersEnabled: true,
  ...extra,
});
const HELP =
  'Off: the widget asks for an address and hands every chat to your team; no AI answers.';

const show = async () => {
  render(
    <MemoryRouter>
      <ChatWidgetSettings />
    </MemoryRouter>
  );
  await screen.findByText('Site chat');
};

beforeEach(() => {
  Object.assign(state, {
    widgets: [widget()],
    updates: [],
    creates: [],
    saved: { aiAnswersEnabled: false },
    sessionsAsked: [],
    sessionAsked: [],
    sessionsFail: false,
    sessionFail: false,
  });
  window.location.hash = '';
});
afterEach(cleanup);

describe('a widget’s AI answers', () => {
  it('the card has the switch, says what off means, and saves it at once', async () => {
    await show();
    expect(screen.getByText(HELP)).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'AI answers for Site chat' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => expect(state.updates).toEqual([[5, { aiAnswersEnabled: false }]]));
    // Shown as stored after the re-read, and marked on the card.
    await waitFor(() =>
      expect(
        screen
          .getByRole('switch', { name: 'AI answers for Site chat' })
          .getAttribute('aria-checked')
      ).toBe('false')
    );
    expect(screen.getByText('AI answers off')).toBeInTheDocument();
  });

  it('CONTROL: a backend that does not send the field gets no switch on the card', async () => {
    state.widgets = [widget({ aiAnswersEnabled: undefined })];
    await show();
    expect(screen.queryByRole('switch', { name: 'AI answers for Site chat' })).toBeNull();
    expect(screen.queryByText('AI answers off')).toBeNull();
  });

  it('the form: switched off, the save carries it, and the contact-form texts are offered', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit widget' }));
    const form = within(
      (await screen.findByRole('switch', { name: 'AI answers' })).closest('form') as HTMLElement
    );
    const toggle = form.getByRole('switch', { name: 'AI answers' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(form.queryByLabelText('Asking for an email')).toBeNull();
    fireEvent.click(toggle);
    expect(form.getByText(/AI answers are off for this widget/)).toBeInTheDocument();
    expect(form.getByLabelText('Asking for an email')).toBeInTheDocument();
    fireEvent.click(form.getByRole('button', { name: /Update|Save/ }));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0][1]).toMatchObject({ aiAnswersEnabled: false });
    expect(screen.queryByText('AI answers are still on')).toBeNull();
  });

  it('the form does not re-send the switch it did not change (its copy is from when it opened)', async () => {
    state.widgets = [widget({ aiAnswersEnabled: false })];
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit widget' }));
    const form = within(
      (await screen.findByRole('switch', { name: 'AI answers' })).closest('form') as HTMLElement
    );
    fireEvent.click(form.getByRole('button', { name: /Update Widget/ }));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0][1].aiAnswersEnabled).toBeUndefined();
    expect('aiAnswersEnabled' in JSON.parse(JSON.stringify(state.updates[0][1]))).toBe(false);
    expect(screen.queryByText('AI answers are still on')).toBeNull();
  });

  it('a server that did not confirm the switch is said plainly: the widget still answers with AI', async () => {
    state.saved = {};
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit widget' }));
    const form = within(
      (await screen.findByRole('switch', { name: 'AI answers' })).closest('form') as HTMLElement
    );
    fireEvent.click(form.getByRole('switch', { name: 'AI answers' }));
    fireEvent.click(form.getByRole('button', { name: /Update|Save/ }));
    expect(await screen.findByText('AI answers are still on')).toBeInTheDocument();
    expect(screen.getByText(/it still answers visitors with AI/)).toBeInTheDocument();
  });
});

describe('a widget’s chats', () => {
  const open = async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));
    return within(await screen.findByRole('dialog'));
  };

  it('lists the chats a page at a time: who, whether the bot answered, and the inbox thread', async () => {
    const view = await open();
    const rows = within(
      await view.findByRole('list', { name: 'Chats of this widget' })
    ).getAllByRole('listitem');
    expect(state.sessionsAsked).toEqual([[5, 1, 25]]);
    expect(rows[0].textContent).toContain('Ada · ada@example.com');
    expect(rows[0].textContent).toContain('No bot answer');
    expect(within(rows[0]).getByRole('link', { name: 'Open thread' })).toHaveAttribute(
      'href',
      '/threads/640'
    );
    // No name, no address: the label — and never the stored placeholder.
    expect(rows[1].textContent).toContain('Website visitor (no email)');
    expect(rows[1].textContent).toContain('Bot answered');
    expect(rows[1].textContent).toContain('1 message');
    expect(rows[1].textContent).toContain('not in the inbox');
    expect(within(rows[1]).queryByRole('link')).toBeNull();
    expect(rows[2].textContent).toContain('Dana (no email)');
    expect(document.body.innerHTML).not.toContain('chat-widget.local');
    // The next page.
    expect(view.getByText('Page 1 of 2 · 26 chats')).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(await view.findByText('bo@example.com')).toBeInTheDocument();
    expect(state.sessionsAsked.at(-1)).toEqual([5, 2, 25]);
  });

  it('opens one chat: what was said, who said it, and that only the first 500 are shown', async () => {
    const view = await open();
    fireEvent.click(
      await view.findByRole('button', { name: 'Open the chat with Website visitor (no email)' })
    );
    const said = within(
      await view.findByRole('list', { name: 'What was said in this chat' })
    ).getAllByRole('listitem');
    expect(state.sessionAsked).toEqual([[5, 32]]);
    expect(said[0].textContent).toContain('Visitor');
    expect(said[0].textContent).toContain('Do you ship abroad?');
    expect(said[1].textContent).toContain('Bot — AI-written · confidence 91%');
    expect(said[2].textContent).toContain('Widget — fixed line');
    expect(view.getByText(/only its first 500 messages are shown/)).toBeInTheDocument();
    // Read-only: nothing to type into, nothing to send.
    expect(view.queryByRole('textbox')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'All chats' }));
    expect(await view.findByRole('list', { name: 'Chats of this widget' })).toBeInTheDocument();
  });

  it('a list the server refuses is said in its own words, and can be tried again', async () => {
    state.sessionsFail = true;
    const view = await open();
    expect(await view.findByRole('alert')).toHaveTextContent('Chat widget not found');
    state.sessionsFail = false;
    fireEvent.click(view.getByRole('button', { name: 'Try again' }));
    expect(await view.findByRole('list', { name: 'Chats of this widget' })).toBeInTheDocument();
    expect(view.queryByRole('alert')).toBeNull();
  });

  it('a chat that could not be loaded does not leave its error on the list', async () => {
    const view = await open();
    state.sessionFail = true;
    fireEvent.click(
      await view.findByRole('button', { name: 'Open the chat with Website visitor (no email)' })
    );
    expect(await view.findByRole('alert')).toHaveTextContent('Chat session not found');
    fireEvent.click(view.getByRole('button', { name: 'All chats' }));
    expect(view.queryByRole('alert')).toBeNull();
    expect(view.getByRole('list', { name: 'Chats of this widget' })).toBeInTheDocument();
  });

  it('a link to one chat opens that widget’s Chats on it', async () => {
    window.location.hash = '#integrations/chat-widgets?widget=5&chat=32';
    await show();
    const view = within(await screen.findByRole('dialog'));
    expect(
      await view.findByRole('list', { name: 'What was said in this chat' })
    ).toBeInTheDocument();
    expect(state.sessionAsked).toEqual([[5, 32]]);
  });

  it('CONTROL: a link that names no widget of this workspace opens nothing', async () => {
    window.location.hash = '#integrations/chat-widgets?widget=77&chat=32';
    await show();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
