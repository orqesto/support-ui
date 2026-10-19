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
  TranslateButton: ({ label, disabled }: { label?: string; disabled?: boolean }) => (
    <button type="button" aria-label="Translate" disabled={disabled}>
      {label}
    </button>
  ),
}));
// The editor as a controlled textarea: what the agent types is the modal's content.
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: forwardRef(
    (
      props: {
        content?: string;
        onChange?: (html: string) => void;
        placeholder?: string;
        editable?: boolean;
        locked?: boolean;
      },
      ref
    ) => {
      useImperativeHandle(ref, () => ({ focus: () => undefined }));
      return (
        <textarea
          aria-label="Message"
          placeholder={props.placeholder}
          readOnly={props.editable === false || props.locked === true}
          // A non-editable RichTextEditor drops its formatting row (the field shrinks); locked does not.
          data-editable={String(props.editable !== false)}
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
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
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

  it('🔴 a backend without the route (404): the button STAYS, says why, and can be pressed again', async () => {
    svc.composePolish.mockRejectedValueOnce({ response: { status: 404 } });
    await renderModal();
    type('Message', '<p>hello</p>');
    fireEvent.click(aiDraft());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'isn’t available on this server yet'
    );
    expect(aiDraft()).toBeEnabled();
    expect(screen.getByLabelText('Message')).toHaveValue('<p>hello</p>');
    // Once the backend has the route, the same button works.
    svc.composePolish.mockResolvedValueOnce({ success: true, data: { text: 'Hello.' } });
    fireEvent.click(aiDraft());
    await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue('<p>Hello.</p>'));
  });

  it('after a draft: edit it by hand, press again — the edited text is rewritten; Undo is still the original', async () => {
    svc.composePolish
      .mockResolvedValueOnce({ success: true, data: { text: 'Invoice 12 is paid.' } })
      .mockResolvedValueOnce({
        success: true,
        data: { text: 'Invoice 12 is paid. Receipt attached.' },
      });
    await renderModal();
    type('Message', '<p>invoice 12 paid</p>');
    fireEvent.click(aiDraft());
    await waitFor(() =>
      expect(screen.getByLabelText('Message')).toHaveValue('<p>Invoice 12 is paid.</p>')
    );
    type('Message', '<p>Invoice 12 is paid. receipt attached</p>');
    expect(aiDraft()).toBeEnabled();
    fireEvent.click(aiDraft());
    await waitFor(() =>
      expect(screen.getByLabelText('Message')).toHaveValue(
        '<p>Invoice 12 is paid. Receipt attached.</p>'
      )
    );
    expect(svc.composePolish).toHaveBeenLastCalledWith(
      '<p>Invoice 12 is paid. receipt attached</p>'
    );
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.getByLabelText('Message')).toHaveValue('<p>invoice 12 paid</p>');
  });

  it('AI drafts off: no button, and the placeholder does not mention it', async () => {
    ai.draftsOff = true;
    await renderModal();
    expect(screen.queryByRole('button', { name: /AI draft/ })).toBeNull();
    expect(screen.getByLabelText('Message')).toHaveAttribute('placeholder', 'Write your message…');
  });
});

describe('Compose new — Translate', () => {
  it('the reply-box layout: Attach, AI draft, Translate and SEND in one tool row of the framed field', async () => {
    await renderModal();
    const tools = screen.getByTestId('compose-tools');
    expect(screen.getByTestId('compose-field')).toContainElement(tools);
    expect(tools).toContainElement(screen.getByRole('button', { name: /Attach/ }));
    expect(tools).toContainElement(aiDraft());
    expect(tools).toContainElement(screen.getByRole('button', { name: 'Translate' }));
    expect(tools).toContainElement(screen.getByRole('button', { name: /^send$/i }));
    expect(screen.getByRole('button', { name: 'Translate' })).toHaveTextContent('Translate');
  });

  it('🔴 no jumping: Undo keeps its slot while there is nothing to undo', async () => {
    svc.composePolish.mockResolvedValue({ success: true, data: { text: 'Hello.' } });
    await renderModal();
    const tools = screen.getByTestId('compose-tools');
    const before = tools.querySelectorAll('button').length;
    // The slot is there, hidden from assistive tech and the tab order, before any draft…
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    type('Message', '<p>hello</p>');
    fireEvent.click(aiDraft());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
    // …and taking a draft adds no element to the row, so nothing beside it moves.
    expect(tools.querySelectorAll('button').length).toBe(before);
    // The label does not change while drafting either.
    expect(aiDraft()).toHaveTextContent('AI draft');
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
    expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
  });
});

describe('Compose new — an AI draft in flight', () => {
  it('🔴 closing mid-draft and reopening leaves the editor editable (busy flag cleared)', async () => {
    svc.composePolish.mockReturnValue(new Promise(() => undefined)); // never lands
    const { rerender } = render(
      <MemoryRouter>
        <ComposeNewModal open onClose={vi.fn()} />
      </MemoryRouter>
    );
    await screen.findByLabelText('From');
    type('Message', '<p>hello</p>');
    fireEvent.click(aiDraft());
    await waitFor(() => expect(screen.getByLabelText('Message')).toHaveAttribute('readonly'));
    rerender(
      <MemoryRouter>
        <ComposeNewModal open={false} onClose={vi.fn()} />
      </MemoryRouter>
    );
    rerender(
      <MemoryRouter>
        <ComposeNewModal open onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Message')).not.toHaveAttribute('readonly');
  });

  it('Translate is held while the draft is being written', async () => {
    svc.composePolish.mockReturnValue(new Promise(() => undefined));
    await renderModal();
    expect(screen.getByRole('button', { name: 'Translate' })).toBeEnabled();
    type('Message', '<p>hello</p>');
    fireEvent.click(aiDraft());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Translate' })).toBeDisabled());
  });
});

describe('Compose new — the field keeps its size while drafting', () => {
  it('🔴 the editor is LOCKED, never made non-editable (that dropped its formatting row and the tools jumped)', async () => {
    svc.composePolish.mockReturnValue(new Promise(() => undefined));
    await renderModal();
    type('Message', '<p>hello</p>');
    fireEvent.click(aiDraft());
    await waitFor(() => expect(screen.getByLabelText('Message')).toHaveAttribute('readonly'));
    expect(screen.getByLabelText('Message')).toHaveAttribute('data-editable', 'true');
  });
});
