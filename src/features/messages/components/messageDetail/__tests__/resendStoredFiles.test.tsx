/**
 * Files on a resend (release audit, round 2). The backend now keeps an undelivered reply's files
 * and a resend that carries none sends them again; files in the request replace them; a stored
 * file it cannot read refuses the resend with a 409 and a sentence. So:
 *  - Resend never asks for the files again — the notice names the stored ones (as the bubble
 *    lists them) and the Send carries no files;
 *  - the "Send this reply again?" confirm names them too;
 *  - the 409's sentence is shown and the reply stays the resend target;
 *  - a 502 whose reply was saved WITHOUT its files says to attach them again.
 * Through MessageDetail, as the app calls the services. Invented data.
 */
import { renderDetail, svc, event } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { resendFilesText } from '../../ResendNotice';

/** The thread's files list: its rows, and how its read ends ('pending' = it never answers). */
const files = vi.hoisted(() => ({
  list: [] as Record<string, unknown>[],
  read: 'ok' as 'ok' | 'pending' | 'fail',
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) => {
      if (url.endsWith('/attachments') && files.read === 'pending') return new Promise(() => {});
      if (url.endsWith('/attachments') && files.read === 'fail')
        return Promise.reject(Object.assign(new Error('boom'), { status: 500 }));
      return Promise.resolve({
        data: { success: true, data: url.endsWith('/attachments') ? files.list : [] },
      });
    },
    post: () => Promise.resolve({ data: { success: true } }),
  },
}));

const pressSend = () => fireEvent.click(screen.getByRole('button', { name: /^SEND$/ }));
const editor = () => screen.getByTestId('rich-text-editor');
const stored = (id: number, name: string) => ({
  id,
  messageEventId: 942,
  originalFilename: name,
  filename: `${id}.bin`,
  mimeType: 'application/pdf',
  size: 10,
  createdAt: '2026-09-22T10:00:00Z',
});
const failed = (metadata: Record<string, unknown>) =>
  event({
    id: 942,
    type: 'agent_reply',
    content: 'Your invoice is attached.',
    authorEmail: 'support@shop.example',
    authorId: 7,
    metadata,
  });
const open = async (metadata: Record<string, unknown> = { delivered: false }) => {
  svc.message.getThreadMessages = vi
    .fn()
    .mockResolvedValue({ data: [event({ id: 900 }), failed(metadata)] });
  renderDetail();
  await screen.findByText(/Not delivered|May not have been delivered/);
};
const resend = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
  await waitFor(() => expect(editor()).toHaveValue('<p>Your invoice is attached.</p>'));
};

beforeEach(() => {
  window.localStorage.clear();
  files.list = [];
  files.read = 'ok';
  svc.message.reply = vi.fn().mockResolvedValue({ success: true });
  svc.message.replyWithAttachments = vi.fn().mockResolvedValue({ success: true });
});

describe('Resend sends the stored files again, and says so', () => {
  it('the notice names them; Send carries no files and names the reply it replaces', async () => {
    files.list = [stored(1, 'invoice-42.pdf'), stored(2, 'terms.pdf')];
    await open();
    await resend();
    expect(
      await screen.findByText(/Its attachments are sent again: invoice-42\.pdf, terms\.pdf\./)
    ).toBeTruthy();
    expect(screen.queryByText(/Attach any files again/)).toBeNull();
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(svc.message.replyWithAttachments).not.toHaveBeenCalled();
    expect((svc.message.reply.mock.calls[0] as unknown[])[10]).toMatchObject({
      resendOfEventId: 942,
    });
  });

  it('CONTROL — a reply with no stored files: the notice says so', async () => {
    await open();
    await resend();
    expect(
      await screen.findByText(/No attachments are stored with it: attach any it needs\./)
    ).toBeTruthy();
  });

  it('files attached in the composer go instead of the stored ones', () => {
    expect(resendFilesText(['invoice-42.pdf'], 1)).toBe(
      'The files attached here are sent instead of its own.'
    );
    expect(resendFilesText([], 2)).toBe('');
  });

  it('the files list not read yet: "Checking its attachments…", never "none stored", no choice', async () => {
    files.read = 'pending';
    await open();
    await resend();
    expect(await screen.findByText(/Checking its attachments…/)).toBeTruthy();
    expect(screen.queryByText(/No attachments are stored/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send without its attachments' })).toBeNull();
  });

  it('the files list could not be read: says so, and that any stored ones go again — dropping them is offered', async () => {
    files.read = 'fail';
    await open();
    await resend();
    expect(
      await screen.findByText(
        /Its attachments could not be listed: any stored with it are sent again\./
      )
    ).toBeTruthy();
    expect(screen.queryByText(/No attachments are stored/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send without its attachments' }));
    expect(
      screen.getByText(
        /Its attachments could not be listed: it is sent without any stored with it\./
      )
    ).toBeTruthy();
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect((svc.message.reply.mock.calls[0] as unknown[])[10]).toMatchObject({
      keepStoredFiles: false,
    });
  });

  it('the "Send this reply again?" confirm names the files that go again', async () => {
    files.list = [stored(1, 'invoice-42.pdf')];
    await open({ delivered: false, sendUncertain: true });
    fireEvent.change(editor(), { target: { value: '<p>Your invoice is attached.</p>' } });
    pressSend();
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Its attachments are sent again: invoice-42\.pdf\./)
    ).toBeTruthy();
  });
});

describe('a stored file that cannot be read (409)', () => {
  const SENTENCE =
    'The files of the reply you are sending again could not be read — attach them again and send.';

  it('the server’s sentence is shown, no Send again, and the reply stays the resend target', async () => {
    files.list = [stored(1, 'invoice-42.pdf')];
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error(SENTENCE), {
          status: 409,
          data: { success: false, error: SENTENCE },
        })
      )
      .mockResolvedValueOnce({ success: true });
    await open();
    await resend();
    pressSend();
    expect(await screen.findByText(SENTENCE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
    expect(screen.getByText(/Resending a reply that was not delivered/)).toBeTruthy();
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    expect((svc.message.reply.mock.calls[1] as unknown[])[10]).toMatchObject({
      resendOfEventId: 942,
    });
  });

  it('another codeless 409 is not "files unreadable": its sentence is shown and the resend ends', async () => {
    const said = 'Message has no sender information';
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error(said), { status: 409, data: { success: false, error: said } })
      );
    await open();
    await resend();
    pressSend();
    expect(await screen.findByText(said)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Resending a reply/)).toBeNull());
  });

  it('CONTROL — a resend refusal with its own code (resent already) ends the resend', async () => {
    const said = 'This reply was already sent again — reload the thread';
    svc.message.reply = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error(said), {
        status: 409,
        data: { success: false, error: said, code: 'REPLY_RESEND_SUPERSEDED' },
      })
    );
    await open();
    await resend();
    pressSend();
    expect(await screen.findByText(said)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Resending a reply/)).toBeNull());
  });
});

describe('a 502 whose reply was saved without its files', () => {
  const bar = () => screen.getByRole('alert');
  const notDelivered = (warnings?: string[]) =>
    Object.assign(new Error('A server error occurred. Please try again later.'), {
      status: 502,
      data: {
        success: false,
        error: '',
        eventId: 955,
        uncertain: false,
        ...(warnings ? { warnings } : {}),
      },
    });

  it('says to attach them again when it is resent', async () => {
    svc.message.reply = vi.fn().mockRejectedValueOnce(notDelivered(['files_not_stored']));
    await open();
    fireEvent.change(editor(), { target: { value: '<p>Hello</p>' } });
    pressSend();
    await screen.findByText('Send failed');
    expect(bar().textContent).toContain(
      'Its attachments were not saved with it: attach them again when you resend it.'
    );
  });

  it('CONTROL — no warnings: no word about files', async () => {
    svc.message.reply = vi.fn().mockRejectedValueOnce(notDelivered());
    await open();
    fireEvent.change(editor(), { target: { value: '<p>Hello</p>' } });
    pressSend();
    await screen.findByText('Send failed');
    expect(bar().textContent).not.toContain('attachments');
  });
});

/*
  The agent's choice about the stored files (`keepStoredFiles`, the backend's rule): the notice's
  one button drops them, or adds them beside the composer's files; its other label undoes it. The
  notice always says what the Send will carry, and the Send carries the choice — nothing when none.
*/
describe('the stored files: send them or not', () => {
  const choose = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
  const attach = (name: string) =>
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(['x'], name, { type: 'application/pdf' })] },
    });

  it('"Send without its attachments": the notice says so and the Send carries keepStoredFiles: false', async () => {
    files.list = [stored(1, 'invoice-42.pdf'), stored(2, 'terms.pdf')];
    await open();
    await resend();
    await screen.findByText(/Its attachments are sent again/);
    choose('Send without its attachments');
    expect(
      screen.getByText(/It is sent without its attachments \(invoice-42\.pdf, terms\.pdf\)\./)
    ).toBeTruthy();
    expect(screen.queryByText(/Its attachments are sent again/)).toBeNull();
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect((svc.message.reply.mock.calls[0] as unknown[])[10]).toEqual({
      seenLastEventId: 942,
      resendOfEventId: 942,
      keepStoredFiles: false,
    });
  });

  it('CONTROL — undone ("Send its attachments again"): the default again, nothing extra sent', async () => {
    files.list = [stored(1, 'invoice-42.pdf')];
    await open();
    await resend();
    await screen.findByText(/Its attachments are sent again/);
    choose('Send without its attachments');
    choose('Send its attachments again');
    expect(screen.getByText(/Its attachments are sent again: invoice-42\.pdf\./)).toBeTruthy();
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect((svc.message.reply.mock.calls[0] as unknown[])[10]).toEqual({
      seenLastEventId: 942,
      resendOfEventId: 942,
    });
  });

  it('files attached here: "Also send its own attachments" sends both (keepStoredFiles: true)', async () => {
    files.list = [stored(1, 'invoice-42.pdf')];
    await open();
    await resend();
    attach('label.pdf');
    await screen.findByText(/The files attached here are sent instead of its own\./);
    choose('Also send its own attachments');
    expect(
      screen.getByText(
        /Its attachments are sent again with the files attached here: invoice-42\.pdf\./
      )
    ).toBeTruthy();
    pressSend();
    await waitFor(() => expect(svc.message.replyWithAttachments).toHaveBeenCalledTimes(1));
    expect(svc.message.reply).not.toHaveBeenCalled();
    const call = svc.message.replyWithAttachments.mock.calls[0] as unknown[];
    expect((call[2] as File[]).map((file) => file.name)).toEqual(['label.pdf']);
    expect(call[10]).toEqual({ seenLastEventId: 942, resendOfEventId: 942, keepStoredFiles: true });
  });

  it('CONTROL — files attached here, no choice: only they go, nothing extra sent', async () => {
    files.list = [stored(1, 'invoice-42.pdf')];
    await open();
    await resend();
    attach('label.pdf');
    await screen.findByText(/The files attached here are sent instead of its own\./);
    pressSend();
    await waitFor(() => expect(svc.message.replyWithAttachments).toHaveBeenCalledTimes(1));
    expect((svc.message.replyWithAttachments.mock.calls[0] as unknown[])[10]).toEqual({
      seenLastEventId: 942,
      resendOfEventId: 942,
    });
  });

  it('CONTROL — no stored files: no choice is offered', async () => {
    await open();
    await resend();
    await screen.findByText(/No attachments are stored with it/);
    expect(screen.queryByRole('button', { name: 'Send without its attachments' })).toBeNull();
  });
});

describe('a resend the transport refused for good (`retryable: false`)', () => {
  it('ends the resend: the next Send is a new reply', async () => {
    svc.message.reply = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('A server error occurred. Please try again later.'), {
        status: 502,
        data: {
          success: false,
          error: 'The mail server refused this address.',
          eventId: 955,
          uncertain: false,
          retryable: false,
        },
      })
    );
    await open();
    await resend();
    pressSend();
    await screen.findByText(/The mail server refused this address\./);
    await waitFor(() => expect(screen.queryByText(/Resending a reply/)).toBeNull());
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
  });
});

describe('the resend notice while a send is out, and what it says it is', () => {
  const notice = () => screen.getByRole('status', { name: 'Resending a reply' });

  it('a labelled status (not an alert); the file choice is a toggle', async () => {
    files.list = [stored(1, 'invoice-42.pdf')];
    await open();
    await resend();
    await screen.findByText(/Its attachments are sent again/);
    expect(within(notice()).getByText(/Resending a reply that was not delivered/)).toBeTruthy();
    const toggle = within(notice()).getByRole('button', { name: 'Send without its attachments' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(
      within(notice())
        .getByRole('button', { name: 'Send its attachments again' })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('while the send is out, its buttons do nothing', async () => {
    files.list = [stored(1, 'invoice-42.pdf')];
    svc.message.reply = vi.fn().mockReturnValue(new Promise(() => {}));
    await open();
    await resend();
    await screen.findByText(/Its attachments are sent again/);
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    // (The design-system Button stays focusable when out of use: aria-disabled, clicks ignored.)
    for (const name of ['Send without its attachments', 'Not a resend']) {
      const button = within(notice()).getByRole('button', { name });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(button);
    }
    expect(screen.getByText(/Its attachments are sent again: invoice-42\.pdf\./)).toBeTruthy();
    expect(notice()).toBeTruthy();
  });

  it('"Not a resend" on an uncertain reply: the same text goes as a NEW reply, unasked', async () => {
    await open({ delivered: false, sendUncertain: true });
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resend anyway' }));
    await waitFor(() => expect(editor()).toHaveValue('<p>Your invoice is attached.</p>'));
    fireEvent.click(within(notice()).getByRole('button', { name: 'Not a resend' }));
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Send this reply again?')).toBeNull();
    expect((svc.message.reply.mock.calls[0] as unknown[])[10]).not.toHaveProperty(
      'resendOfEventId'
    );
  });

  it('CONTROL — without "Not a resend" said, the same text of that reply asks first', async () => {
    await open({ delivered: false, sendUncertain: true });
    fireEvent.change(editor(), { target: { value: '<p>Your invoice is attached.</p>' } });
    pressSend();
    expect(await screen.findByText('Send this reply again?')).toBeTruthy();
    expect(svc.message.reply).not.toHaveBeenCalled();
  });
});
