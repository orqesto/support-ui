/**
 * "Compose new message" (2026-10-19): To takes several addresses; AI draft rewrites what the agent
 * typed (a new email has no thread, so there is nothing to draft from while the editor is empty)
 * with Undo; Translate sits beside Attach.
 */
import { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const svc = vi.hoisted(() => ({
  composeNew: vi.fn(),
  composePolish: vi.fn(),
  getComposeSources: vi.fn(),
  getAll: vi.fn(),
}));
const ai = vi.hoisted(() => ({ configured: true, draftsOff: false }));

vi.mock('@/services/message.service', () => ({
  messageService: {
    composeNew: svc.composeNew,
    composePolish: svc.composePolish,
    getComposeSources: svc.getComposeSources,
  },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: svc.getAll },
}));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: ai.configured, isLoading: false }),
}));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: ai.draftsOff, resolved: true }),
  useRefreshAiDrafts: () => vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/shared/TranslateButton', () => ({
  TranslateButton: ({ label }: { label?: string }) => (
    <button type="button" aria-label="Translate">
      {label}
    </button>
  ),
}));
// The editor as a controlled textarea: what the agent types is the modal's content.
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: forwardRef(
    (props: { content?: string; onChange?: (html: string) => void; placeholder?: string }, ref) => {
      useImperativeHandle(ref, () => ({ focus: () => undefined }));
      return (
        <textarea
          aria-label="Message"
          placeholder={props.placeholder}
          value={props.content ?? ''}
          onChange={(event) => props.onChange?.(event.target.value)}
        />
      );
    }
  ),
}));

const { ComposeNewModal } = await import('../ComposeNewModal');

const renderModal = async () => {
  render(
    <MemoryRouter>
      <ComposeNewModal open onClose={vi.fn()} />
    </MemoryRouter>
  );
  await screen.findByLabelText('From');
};

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const aiDraft = () => screen.getByRole('button', { name: /AI draft/ });

beforeEach(() => {
  // A backend without the sendable-sources list (null) — the fallback; the From block overrides.
  svc.getComposeSources.mockResolvedValue(null);
  svc.getAll.mockResolvedValue({
    success: true,
    data: [{ id: 3, name: 'Support', type: 'email', enabled: true }],
  });
  svc.composeNew.mockResolvedValue({
    success: true,
    data: { conversationId: 9, messageEventId: 1 },
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  ai.configured = true;
  ai.draftsOff = false;
});

describe('Compose new — To', () => {
  it('several addresses, comma separated, are sent as a list', async () => {
    await renderModal();
    type('To', 'one@example.com, two@example.com');
    type('Subject', 'Hello');
    type('Message', '<p>Hi both</p>');
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(svc.composeNew).toHaveBeenCalled());
    expect((svc.composeNew.mock.calls[0][0] as { to: string[] }).to).toEqual([
      'one@example.com',
      'two@example.com',
    ]);
  });
});

describe('Compose new — AI draft', () => {
  it('is disabled while the message is empty, and the editor says how it works', async () => {
    await renderModal();
    expect(aiDraft()).toBeDisabled();
    expect(screen.getByLabelText('Message')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('press AI draft')
    );
    type('Message', '<p>invoice 12 paid, thanks</p>');
    expect(aiDraft()).toBeEnabled();
  });

  it('rewrites what was typed in place, and Undo brings it back', async () => {
    svc.composePolish.mockResolvedValue({ success: true, data: { text: 'Invoice 12 is paid.' } });
    await renderModal();
    type('Message', '<p>invoice 12 paid</p>');
    fireEvent.click(aiDraft());
    await waitFor(() =>
      expect(screen.getByLabelText('Message')).toHaveValue('<p>Invoice 12 is paid.</p>')
    );
    expect(svc.composePolish).toHaveBeenCalledWith('<p>invoice 12 paid</p>');
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.getByLabelText('Message')).toHaveValue('<p>invoice 12 paid</p>');
  });

  it('a backend without the route (404) hides the button; the text is untouched', async () => {
    svc.composePolish.mockRejectedValue({ response: { status: 404 } });
    await renderModal();
    type('Message', '<p>hello</p>');
    fireEvent.click(aiDraft());
    await waitFor(() => expect(screen.queryByRole('button', { name: /AI draft/ })).toBeNull());
    expect(screen.getByLabelText('Message')).toHaveValue('<p>hello</p>');
  });

  it('AI drafts off: no button, and the placeholder does not mention it', async () => {
    ai.draftsOff = true;
    await renderModal();
    expect(screen.queryByRole('button', { name: /AI draft/ })).toBeNull();
    expect(screen.getByLabelText('Message')).toHaveAttribute('placeholder', 'Write your message…');
  });
});

describe('Compose new — Translate', () => {
  it('a labelled Translate sits in the footer with Attach', async () => {
    await renderModal();
    const translate = screen.getByRole('button', { name: 'Translate' });
    expect(translate).toHaveTextContent('Translate');
    expect(translate.closest('[data-dialog-footer]')).toContainElement(
      screen.getByRole('button', { name: /Attach/ })
    );
  });
});

describe('Compose new — From', () => {
  it('lists only the sources this agent may send from', async () => {
    svc.getComposeSources.mockResolvedValue([{ id: 4, name: 'Billing', type: 'gmail' }]);
    await renderModal();
    expect(await screen.findByText('Billing (gmail)')).toBeInTheDocument();
    expect(svc.getAll).not.toHaveBeenCalled();
  });

  it('an older backend (null): every enabled email source, disabled and non-email ones left out', async () => {
    svc.getAll.mockResolvedValue({
      success: true,
      data: [
        { id: 3, name: 'Support', type: 'email', enabled: true },
        { id: 5, name: 'Old box', type: 'email', enabled: false },
        { id: 6, name: 'Chat', type: 'telegram', enabled: true },
      ],
    });
    await renderModal();
    expect(await screen.findByText('Support (email)')).toBeInTheDocument();
    expect(screen.queryByText('Old box (email)')).toBeNull();
    expect(svc.getAll).toHaveBeenCalled();
  });

  it('nothing to send from: says why, and Send stays off', async () => {
    svc.getComposeSources.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <ComposeNewModal open onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(await screen.findByText(/No email source you can send from/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send/ })).toBeDisabled();
  });
});
