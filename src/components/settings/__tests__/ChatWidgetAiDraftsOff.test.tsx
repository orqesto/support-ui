import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChatWidget } from '@/services/chatWidget.service';

/**
 * With AI drafts off the chat widget is a contact form: it asks for an email, hands the chat to
 * the team, and agents answer by email from the widget's account (`escalationSourceId`). Without
 * an account nobody can answer the visitor — the admin must see that, and be able to fix it here.
 */

const aiDrafts = { off: true };
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
const update = vi.fn((_id: number, _data: Record<string, unknown>) =>
  Promise.resolve({ success: true, data: {} })
);
const getAll = vi.fn(() => Promise.resolve({ success: true, data: [] as ChatWidget[] }));
vi.mock('@/services/chatWidget.service', () => ({
  chatWidgetService: {
    getAll: () => getAll(),
    update: (id: number, data: Record<string, unknown>) => update(id, data),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => Promise.resolve([]) },
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getMessageSourcesForFilter: () =>
      Promise.resolve([
        { id: 11, name: 'support@acme.test', type: 'email', departmentId: null, enabled: true },
        { id: 12, name: 'Telegram bot', type: 'telegram', departmentId: null, enabled: true },
        { id: 13, name: 'old@acme.test', type: 'gmail', departmentId: null, enabled: false },
      ]),
  },
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { ChatWidgetModal } from '../modals/ChatWidgetModal';
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
  createdAt: '2026-09-24T00:00:00Z',
  updatedAt: '2026-09-24T00:00:00Z',
  escalationSourceId: null,
  handoffMessage: null,
  emailRequestMessage: null,
  ...extra,
});

const renderModal = (target: ChatWidget) =>
  render(
    <ChatWidgetModal
      open
      widget={target}
      onClose={() => {}}
      onSuccess={() => {}}
      onShowAlert={() => {}}
    />
  );

const save = () => fireEvent.click(screen.getByRole('button', { name: /update|save/i }));

beforeEach(() => {
  vi.clearAllMocks();
  aiDrafts.off = true;
});

describe('ChatWidgetModal — AI drafts off', () => {
  it('warns when no email account is selected', () => {
    renderModal(widget());
    expect(screen.getByText(/cannot reply to visitors by email/i)).toBeInTheDocument();
  });

  it('no warning once the widget has an email account (control)', () => {
    renderModal(widget({ escalationSourceId: 11 }));
    expect(screen.queryByText(/cannot reply to visitors by email/i)).not.toBeInTheDocument();
  });

  it('offers only email accounts, and saves the one picked', async () => {
    renderModal(widget());
    const picker = screen.getByLabelText('Email account for replies');
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    const option = await screen.findByText('support@acme.test');
    expect(screen.queryByText('Telegram bot')).not.toBeInTheDocument();
    // A disabled account is listed (a stored choice must stay visible) and says it is disabled.
    expect(screen.getByText('old@acme.test (disabled)')).toBeInTheDocument();
    fireEvent.click(option);
    // The warning goes as soon as there is an account to reply from.
    expect(screen.queryByText(/cannot reply to visitors by email/i)).not.toBeInTheDocument();
    save();

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1].escalationSourceId).toBe(11);
  });

  it('saves typed texts trimmed, and an emptied box as null (the default)', async () => {
    renderModal(widget({ handoffMessage: 'Old text', escalationSourceId: 11 }));
    fireEvent.change(screen.getByLabelText('Asking for an email'), {
      target: { value: '  What is your email?  ' },
    });
    fireEvent.change(screen.getByLabelText('After handing the chat to your team'), {
      target: { value: '   ' },
    });
    save();

    await waitFor(() => expect(update).toHaveBeenCalled());
    const payload = update.mock.calls[0][1];
    expect(payload.emailRequestMessage).toBe('What is your email?');
    expect(payload.handoffMessage).toBeNull();
    expect(payload.escalationSourceId).toBe(11);
  });

  it('with drafts on the texts are not shown, and stored ones are sent back unchanged', async () => {
    aiDrafts.off = false;
    renderModal(widget({ handoffMessage: 'Kept', escalationSourceId: 11 }));
    expect(screen.queryByLabelText('After handing the chat to your team')).not.toBeInTheDocument();
    save();

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1].handoffMessage).toBe('Kept');
  });

  it('a widget from an older backend (no such fields) does not overwrite them', async () => {
    const old = widget();
    delete old.escalationSourceId;
    delete old.handoffMessage;
    delete old.emailRequestMessage;
    renderModal(old);
    save();

    await waitFor(() => expect(update).toHaveBeenCalled());
    const payload = update.mock.calls[0][1];
    expect(payload.escalationSourceId).toBeUndefined();
    expect(payload.handoffMessage).toBeUndefined();
    expect(payload.emailRequestMessage).toBeUndefined();
  });
});

describe('ChatWidgetSettings list — AI drafts off', () => {
  it('flags a widget with no email account', async () => {
    getAll.mockResolvedValue({ success: true, data: [widget()] });
    render(<ChatWidgetSettings />);
    expect(await screen.findByText('No email account for replies')).toBeInTheDocument();
  });

  it('does not flag an older backend that did not say (field absent)', async () => {
    const old = widget();
    delete old.escalationSourceId;
    getAll.mockResolvedValue({ success: true, data: [old] });
    render(<ChatWidgetSettings />);
    expect(await screen.findByText('Site chat')).toBeInTheDocument();
    expect(screen.queryByText('No email account for replies')).not.toBeInTheDocument();
  });

  it('does not flag anything with drafts on (control)', async () => {
    aiDrafts.off = false;
    getAll.mockResolvedValue({ success: true, data: [widget()] });
    render(<ChatWidgetSettings />);
    expect(await screen.findByText('Site chat')).toBeInTheDocument();
    expect(screen.queryByText('No email account for replies')).not.toBeInTheDocument();
  });

  // The page header must not call the widgets "AI-powered" when no model answers in them.
  it('does not describe the widgets as AI-powered with drafts off', async () => {
    getAll.mockResolvedValue({ success: true, data: [widget()] });
    render(<ChatWidgetSettings />);
    expect(await screen.findByText('Site chat')).toBeInTheDocument();
    expect(screen.queryByText(/AI-powered/)).not.toBeInTheDocument();
    expect(screen.getByText(/collect the visitor’s email/)).toBeInTheDocument();
  });

  it('still says AI-powered with drafts on (control)', async () => {
    aiDrafts.off = false;
    getAll.mockResolvedValue({ success: true, data: [widget()] });
    render(<ChatWidgetSettings />);
    expect(await screen.findByText('Site chat')).toBeInTheDocument();
    expect(screen.getByText(/AI-powered/)).toBeInTheDocument();
  });
});
