/**
 * Templates in "Compose new message" (owner 2026-11-24): the thread reply box's Templates menu, in
 * the new-message dialog. Picking one puts its body in the editor (in place of a blank draft, after
 * the agent's words otherwise) and attaches its files; a file that cannot be attached is named; a
 * file that arrives after the dialog was closed is not attached to the next message. The backend
 * fills the placeholders at send and refuses one it cannot fill — that reason reaches the agent.
 */
import { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReplyTemplate } from '@/services/replyTemplates.service';
import { handleResponseError } from '@/lib/api-client';

const svc = vi.hoisted(() => ({
  composeNew: vi.fn(),
  composePolish: vi.fn(),
  getComposeSources: vi.fn(),
  getAll: vi.fn(),
  list: vi.fn(),
  downloadAttachment: vi.fn(),
}));

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
vi.mock('@/services/replyTemplates.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  replyTemplatesService: { list: svc.list, downloadAttachment: svc.downloadAttachment },
}));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: true, isLoading: false }),
}));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/shared/TranslateButton', () => ({
  TranslateButton: () => null,
}));
// The editor as a controlled textarea: what the agent types is the modal's content.
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: forwardRef(
    (props: { content?: string; onChange?: (html: string) => void; locked?: boolean }, ref) => {
      useImperativeHandle(ref, () => ({ focus: () => undefined }));
      return (
        <textarea
          aria-label="Message"
          readOnly={props.locked === true}
          value={props.content ?? ''}
          onChange={(event) => props.onChange?.(event.target.value)}
        />
      );
    }
  ),
}));

const { ComposeNewModal } = await import('../ComposeNewModal');

const template = (over: Partial<ReplyTemplate> = {}): ReplyTemplate => ({
  id: 1,
  name: 'Welcome',
  body: '<p>Hi {first_name|there}, thanks for your order.</p>',
  use: 'thread',
  departmentId: null,
  attachments: [],
  updatedAt: '2026-11-24T10:00:00Z',
  canEdit: false,
  ...over,
});
const attachment = { id: 7, filename: 'terms.pdf', contentType: 'application/pdf', size: 3 };

const ui = (open: boolean) => (
  <MemoryRouter>
    <ComposeNewModal open={open} onClose={vi.fn()} />
  </MemoryRouter>
);
const renderModal = async () => {
  const result = render(ui(true));
  await screen.findByLabelText('From');
  return result;
};
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pick = async (name: string) => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Templates' }));
  await user.click(await screen.findByRole('option', { name }));
};
const editor = () => screen.getByLabelText<HTMLTextAreaElement>('Message');

beforeEach(() => {
  svc.getComposeSources.mockResolvedValue([{ id: 3, name: 'Support', type: 'email' }]);
  svc.composeNew.mockResolvedValue({ success: true, data: { conversationId: 9, messageEventId: 1 } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Compose new — Templates', () => {
  it('offers the THREAD box’s templates', async () => {
    svc.list.mockResolvedValue({ unavailable: false, templates: [template()] });
    await renderModal();
    expect(await screen.findByRole('button', { name: 'Templates' })).toBeInTheDocument();
    expect(svc.list).toHaveBeenCalledWith('thread');
  });

  it('control: a backend without templates (404 ⇒ unavailable) shows no menu', async () => {
    svc.list.mockResolvedValue({ unavailable: true });
    await renderModal();
    await waitFor(() => expect(svc.list).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: 'Templates' })).toBeNull();
  });

  it('a blank message gets the body in place; placeholders stay as tokens for the send', async () => {
    svc.list.mockResolvedValue({ unavailable: false, templates: [template()] });
    await renderModal();
    type('Message', '<p></p>');
    await pick('Welcome');
    await waitFor(() =>
      expect(editor().value).toBe('<p>Hi {first_name|there}, thanks for your order.</p>')
    );
  });

  it('text already written is kept and the body goes after it', async () => {
    svc.list.mockResolvedValue({ unavailable: false, templates: [template()] });
    await renderModal();
    type('Message', '<p>Good morning.</p>');
    await pick('Welcome');
    await waitFor(() =>
      expect(editor().value).toBe(
        '<p>Good morning.</p><p>Hi {first_name|there}, thanks for your order.</p>'
      )
    );
  });

  it('the template’s files are attached and go out with the message', async () => {
    svc.list.mockResolvedValue({
      unavailable: false,
      templates: [template({ attachments: [attachment] })],
    });
    svc.downloadAttachment.mockResolvedValue(new File(['pdf'], 'terms.pdf'));
    await renderModal();
    await pick('Welcome');
    expect(await screen.findByText('terms.pdf')).toBeInTheDocument();
    expect(svc.downloadAttachment).toHaveBeenCalledWith(1, attachment);

    type('To', 'someone@example.com');
    type('Subject', 'Your order');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(svc.composeNew).toHaveBeenCalled());
    const sent = svc.composeNew.mock.calls[0][0] as { attachments?: File[]; content: string };
    expect(sent.attachments?.map((file) => file.name)).toEqual(['terms.pdf']);
    expect(sent.content).toContain('{first_name|there}');
  });

  it('a file that cannot be attached is named', async () => {
    svc.list.mockResolvedValue({
      unavailable: false,
      templates: [template({ attachments: [attachment] })],
    });
    svc.downloadAttachment.mockRejectedValue(new Error('gone'));
    await renderModal();
    await pick('Welcome');
    expect(
      await screen.findByText('Could not attach terms.pdf from “Welcome”.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove attachment' })).toBeNull();
  });

  it('⛔ files that arrive after the dialog was closed are NOT attached to the next message', async () => {
    svc.list.mockResolvedValue({
      unavailable: false,
      templates: [template({ attachments: [attachment] })],
    });
    let release: (file: File) => void = () => undefined;
    svc.downloadAttachment.mockReturnValue(
      new Promise<File>((resolve) => {
        release = resolve;
      })
    );
    const { rerender } = await renderModal();
    await pick('Welcome');
    await waitFor(() => expect(svc.downloadAttachment).toHaveBeenCalled());
    rerender(ui(false));
    rerender(ui(true));
    await screen.findByLabelText('From');
    release(new File(['pdf'], 'terms.pdf'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('terms.pdf')).toBeNull();
  });

  it('control: files that arrive while the same message is open ARE attached', async () => {
    svc.list.mockResolvedValue({
      unavailable: false,
      templates: [template({ attachments: [attachment] })],
    });
    let release: (file: File) => void = () => undefined;
    svc.downloadAttachment.mockReturnValue(
      new Promise<File>((resolve) => {
        release = resolve;
      })
    );
    await renderModal();
    await pick('Welcome');
    await waitFor(() => expect(svc.downloadAttachment).toHaveBeenCalled());
    release(new File(['pdf'], 'terms.pdf'));
    expect(await screen.findByText('terms.pdf')).toBeInTheDocument();
  });
});

describe('Compose new — a placeholder the server cannot fill', () => {
  it('shows the server’s reason (400) and keeps the dialog open', async () => {
    svc.list.mockResolvedValue({ unavailable: false, templates: [] });
    const reason =
      'The template needs {customer_name}, and the recipient has no name on file. Add a fallback or write the name.';
    // The REAL interceptor turns the 400 into the error the modal catches.
    const refusal = await handleResponseError(
      new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', undefined, null, {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { success: false, error: reason },
      })
    ).catch((err: unknown) => err);
    svc.composeNew.mockRejectedValue(refusal);
    await renderModal();
    type('To', 'someone@example.com');
    type('Subject', 'Hello');
    type('Message', '<p>Dear {customer_name},</p>');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(editor().value).toBe('<p>Dear {customer_name},</p>');
  });
});
