/**
 * Reply templates in a thread's reply box (build spec B, TemplatePicker 1): the Templates menu
 * lists the box's templates; picking one puts its body in the editor (in place of a blank draft,
 * after the agent's words otherwise) and attaches its files — never to a different conversation.
 * A backend without templates (404) shows no menu.
 */
import { forwardRef, useImperativeHandle, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '@/types';
import type { ReplyTemplate } from '@/services/replyTemplates.service';

const list = vi.fn();
const downloadAttachment = vi.fn();
vi.mock('@/services/replyTemplates.service', () => ({
  replyTemplatesService: { list, downloadAttachment },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../ComposerAiActions', () => ({ ComposerAiActions: () => null }));
vi.mock('../useIsPhone', () => ({ useIsPhone: () => false }));
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: forwardRef((props: { content?: string; onChange?: (html: string) => void }, ref) => {
    useImperativeHandle(ref, () => ({ focus: () => undefined }));
    return (
      <textarea
        aria-label="Reply text"
        value={props.content ?? ''}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    );
  }),
  extractImageFiles: () => [],
}));

const { MessageComposer } = await import('../MessageComposer');

const template = (over: Partial<ReplyTemplate> = {}): ReplyTemplate => ({
  id: 1,
  name: 'Refund approved',
  body: '<p>Hi {first_name|there}, your refund is on its way.</p>',
  use: 'thread',
  departmentId: null,
  attachments: [],
  updatedAt: '2026-10-09T10:00:00Z',
  canEdit: false,
  ...over,
});

const message = (id: number) => ({ id, subject: 'Order', channel: 'email' }) as unknown as Message;

let latest = { composer: '', files: [] as File[] };
const Host = ({ messageId, initial = '' }: { messageId: number; initial?: string }) => {
  const [composer, setComposer] = useState(initial);
  const [files, setFiles] = useState<File[]>([]);
  latest = { composer, files };
  return (
    <MessageComposer
      message={message(messageId)}
      composer={composer}
      setComposer={setComposer}
      composerMode="reply"
      setComposerMode={vi.fn()}
      submitting={false}
      onSend={vi.fn()}
      richEditorRef={{ current: null }}
      noteEditorRef={{ current: null }}
      onOpenSimilarMessages={vi.fn()}
      selectedFiles={files}
      onFilesChange={setFiles}
    />
  );
};

const pick = async (name: string) => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Templates' }));
  await user.click(await screen.findByRole('option', { name }));
};

beforeEach(() => {
  vi.clearAllMocks();
  latest = { composer: '', files: [] };
});

describe('MessageComposer — reply templates', () => {
  it('asks for the THREAD box’s templates', async () => {
    list.mockResolvedValue({ unavailable: false, templates: [template()] });
    render(<Host messageId={1} />);
    expect(await screen.findByRole('button', { name: 'Templates' })).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith('thread');
  });

  it('an older backend (404 ⇒ unavailable) shows no Templates menu', async () => {
    list.mockResolvedValue({ unavailable: true });
    render(<Host messageId={1} />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: 'Templates' })).toBeNull();
  });

  it('no templates for this box ⇒ no menu (a menu that opens empty is a dead control)', async () => {
    list.mockResolvedValue({ unavailable: false, templates: [] });
    render(<Host messageId={1} />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: 'Templates' })).toBeNull();
  });

  it('a blank box gets the body in place; placeholders stay as tokens', async () => {
    list.mockResolvedValue({ unavailable: false, templates: [template()] });
    render(<Host messageId={1} initial="<p></p>" />);
    await pick('Refund approved');
    await waitFor(() =>
      expect(latest.composer).toBe('<p>Hi {first_name|there}, your refund is on its way.</p>')
    );
  });

  it('text already written is kept and the body goes after it', async () => {
    list.mockResolvedValue({ unavailable: false, templates: [template()] });
    render(<Host messageId={1} initial="<p>Thanks for waiting.</p>" />);
    await pick('Refund approved');
    await waitFor(() =>
      expect(latest.composer).toBe(
        '<p>Thanks for waiting.</p><p>Hi {first_name|there}, your refund is on its way.</p>'
      )
    );
  });

  it('the template’s files are downloaded and attached to the reply', async () => {
    const attachment = { id: 7, filename: 'policy.pdf', contentType: 'application/pdf', size: 3 };
    list.mockResolvedValue({
      unavailable: false,
      templates: [template({ attachments: [attachment] })],
    });
    downloadAttachment.mockResolvedValue(new File(['pdf'], 'policy.pdf'));
    render(<Host messageId={1} />);
    await pick('Refund approved');
    await waitFor(() => expect(latest.files.map((file) => file.name)).toEqual(['policy.pdf']));
    expect(downloadAttachment).toHaveBeenCalledWith(1, attachment);
    expect(screen.getByText('policy.pdf')).toBeInTheDocument();
  });

  it('a file that fails to download is named; the others are still attached', async () => {
    const first = { id: 7, filename: 'policy.pdf', contentType: 'application/pdf', size: 3 };
    const second = { id: 8, filename: 'form.pdf', contentType: 'application/pdf', size: 3 };
    list.mockResolvedValue({
      unavailable: false,
      templates: [template({ attachments: [first, second] })],
    });
    downloadAttachment.mockImplementation((_id: number, file: { id: number }) =>
      file.id === 8
        ? Promise.reject(new Error('gone'))
        : Promise.resolve(new File(['pdf'], 'policy.pdf'))
    );
    render(<Host messageId={1} />);
    await pick('Refund approved');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not attach form.pdf from “Refund approved”.'
    );
    expect(latest.files.map((file) => file.name)).toEqual(['policy.pdf']);
  });

  it('⛔ files that arrive after the agent switched conversation are NOT attached there', async () => {
    const attachment = { id: 7, filename: 'policy.pdf', contentType: 'application/pdf', size: 3 };
    list.mockResolvedValue({
      unavailable: false,
      templates: [template({ attachments: [attachment] })],
    });
    let release: (file: File) => void = () => undefined;
    downloadAttachment.mockReturnValue(
      new Promise<File>((resolve) => {
        release = resolve;
      })
    );
    const { rerender } = render(<Host messageId={1} />);
    await pick('Refund approved');
    await waitFor(() => expect(downloadAttachment).toHaveBeenCalled());
    rerender(<Host messageId={2} />);
    release(new File(['pdf'], 'policy.pdf'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(latest.files).toEqual([]);
  });
});
