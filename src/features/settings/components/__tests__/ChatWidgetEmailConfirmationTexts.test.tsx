import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChatWidget } from '@/services/chatWidget.service';

/**
 * The email confirmation (one-time code) texts the widget shows, edited in the widget settings
 * and stored in `metadata.emailVerification`. Saving must keep the other metadata keys (the whole
 * column is replaced) and must not send an email text the backend would refuse (no {code}).
 */

vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
const update = vi.fn((_id: number, _data: Record<string, unknown>) =>
  Promise.resolve({ success: true, data: {} })
);
vi.mock('@/services/chatWidget.service', () => ({
  chatWidgetService: {
    getAll: () => Promise.resolve({ success: true, data: [] }),
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
      ]),
  },
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { ChatWidgetModal } from '../modals/ChatWidgetModal';

const widget = (metadata: Record<string, unknown>): ChatWidget => ({
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
  metadata,
  createdAt: '2026-10-15T00:00:00Z',
  updatedAt: '2026-10-15T00:00:00Z',
  escalationSourceId: 11,
  handoffMessage: null,
  emailRequestMessage: null,
});

const onShowAlert = vi.fn();
const renderModal = (target: ChatWidget) =>
  render(
    <ChatWidgetModal
      open
      widget={target}
      onClose={() => {}}
      onSuccess={() => {}}
      onShowAlert={onShowAlert}
    />
  );
const save = () => fireEvent.click(screen.getByRole('button', { name: /update|save/i }));

beforeEach(() => vi.clearAllMocks());

describe('ChatWidgetModal — email confirmation texts', () => {
  it('shows the stored texts and saves edits beside the other metadata keys', async () => {
    renderModal(
      widget({
        theme: { borderRadius: 'square' },
        emailVerification: { sendLabel: 'Code senden' },
        extra: 1,
      })
    );
    const send = await screen.findByLabelText<HTMLTextAreaElement>('Send button');
    expect(send.value).toBe('Code senden');
    fireEvent.change(screen.getByLabelText('Email subject'), {
      target: { value: '  Ihr Code: {code}  ' },
    });
    fireEvent.change(send, { target: { value: '' } });
    save();
    await waitFor(() => expect(update).toHaveBeenCalled());
    const { metadata } = update.mock.calls[0][1] as { metadata: Record<string, unknown> };
    expect(metadata.extra).toBe(1);
    expect(metadata.theme).toMatchObject({ borderRadius: 'square' });
    // Trimmed; an emptied box is left out, so the default applies.
    expect(metadata.emailVerification).toEqual({ emailSubject: 'Ihr Code: {code}' });
  });

  it('refuses an email text without {code} instead of sending it', async () => {
    renderModal(widget({}));
    fireEvent.change(await screen.findByLabelText('Email text'), {
      target: { value: 'No code here' },
    });
    save();
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(update).not.toHaveBeenCalled();
    expect(onShowAlert.mock.calls[0][0]).toMatchObject({ variant: 'error' });
  });
});
