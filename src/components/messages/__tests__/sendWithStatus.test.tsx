/**
 * Send ▾ (2026-10-29): what happens to the conversation once the reply is out, chosen on the Send
 * button as in Zendesk's submit-as. Through MessageDetail, as the app calls the services.
 */
import { renderDetail, svc } from './md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';

const type = (text: string) =>
  fireEvent.change(screen.getByTestId('rich-text-editor'), { target: { value: text } });
const openSendMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Choose what happens after sending' }));
const pick = (name: string) => {
  openSendMenu();
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name }));
};
const replyResolveFlag = (): unknown =>
  (svc.message.reply.mock.calls[0] as unknown[] | undefined)?.[2];

beforeEach(() => {
  window.localStorage.clear();
  svc.message.reply = vi.fn().mockResolvedValue({ success: true });
  svc.message.close = vi.fn().mockResolvedValue({ success: true });
  svc.message.resolve = vi.fn().mockResolvedValue({ success: true });
  svc.message.setStatus = vi.fn().mockResolvedValue({ success: true });
});

describe('Send ▾ on an active thread', () => {
  it('offers the four choices; plain Send sends without resolving and changes no status', async () => {
    renderDetail();
    type('<p>Your exchange is on its way.</p>');
    openSendMenu();
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitemcheckbox')
        .map((item) => item.textContent)
    ).toEqual(['Send', 'Send and resolve', 'Send, resolve & save to KB', 'Send and put on hold']);
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Send' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(replyResolveFlag()).toBe(false);
    expect(svc.message.close).not.toHaveBeenCalled();
    expect(svc.message.setStatus).not.toHaveBeenCalled();
  });

  it('Send and resolve: the reply goes out FIRST, then the thread is resolved (no KB)', async () => {
    renderDetail();
    type('<p>Done.</p>');
    pick('Send and resolve');
    await waitFor(() => expect(svc.message.close).toHaveBeenCalledWith(101));
    expect(replyResolveFlag()).toBe(false);
    expect(svc.message.reply.mock.invocationCallOrder[0]).toBeLessThan(
      svc.message.close.mock.invocationCallOrder[0]
    );
    expect(svc.message.resolve).not.toHaveBeenCalled();
  });

  it('Send, resolve & save to KB rides on the reply itself (one server step, no second call)', async () => {
    renderDetail();
    type('<p>Done.</p>');
    pick('Send, resolve & save to KB');
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(replyResolveFlag()).toBe(true);
    expect(svc.message.resolve).not.toHaveBeenCalled();
    expect(svc.message.close).not.toHaveBeenCalled();
  });

  it('Send and put on hold asks for the reason BEFORE sending; cancelling sends nothing', async () => {
    renderDetail();
    type('<p>Waiting on the courier.</p>');
    pick('Send and put on hold');
    const dialog = await screen.findByRole('dialog');
    expect(svc.message.reply).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(svc.message.reply).not.toHaveBeenCalled();
  });

  it('Send and put on hold: reason given → reply, then the hold with that reason', async () => {
    renderDetail();
    type('<p>Waiting on the courier.</p>');
    pick('Send and put on hold');
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Courier answer' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send and put on hold' }));
    await waitFor(() => expect(svc.message.setStatus).toHaveBeenCalled());
    const [id, status, hold] = svc.message.setStatus.mock.calls[0] as [
      number,
      string,
      { reason: string },
    ];
    expect([id, status, hold.reason]).toEqual([101, 'pending', 'Courier answer']);
    expect(svc.message.reply.mock.invocationCallOrder[0]).toBeLessThan(
      svc.message.setStatus.mock.invocationCallOrder[0]
    );
  });

  it('a failed send runs no status step', async () => {
    svc.message.reply = vi.fn().mockRejectedValue(new Error('smtp down'));
    renderDetail();
    type('<p>Done.</p>');
    pick('Send and resolve');
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(svc.message.close).not.toHaveBeenCalled();
  });

  it('the reply is out but resolving fails: the box says so, not "send failed"', async () => {
    svc.message.close = vi.fn().mockRejectedValue(new Error('500'));
    renderDetail();
    type('<p>Done.</p>');
    pick('Send and resolve');
    expect(
      await screen.findByText('Sent — but resolving failed. Resolve it from the row below.')
    ).toBeInTheDocument();
  });

  it('the last choice becomes the face — and Ctrl+Enter-style sends use it', async () => {
    renderDetail();
    type('<p>Done.</p>');
    pick('Send and resolve');
    await waitFor(() => expect(svc.message.close).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem('odly.sendAction.7')).toBe('resolve');
    type('<p>One more thing.</p>');
    fireEvent.click(screen.getByRole('button', { name: 'SEND & RESOLVE' }));
    await waitFor(() => expect(svc.message.close).toHaveBeenCalledTimes(2));
  });
});

describe('Send ▾ elsewhere', () => {
  it('an unreviewed thread offers Send and hold only, and a remembered "resolve" falls back to Send', () => {
    window.localStorage.setItem('odly.sendAction.7', 'resolve');
    renderDetail({ status: 'open', lastReplyFromClient: false });
    type('<p>Hello.</p>');
    expect(screen.getByRole('button', { name: 'SEND' })).toBeInTheDocument();
    openSendMenu();
    expect(screen.getAllByRole('menuitemcheckbox').map((item) => item.textContent)).toEqual([
      'Send',
      'Send and put on hold',
    ]);
  });

  it('CONTROL: a remembered "resolve" IS the face on an active thread', () => {
    window.localStorage.setItem('odly.sendAction.7', 'resolve');
    renderDetail();
    type('<p>Hello.</p>');
    expect(screen.getByRole('button', { name: 'SEND & RESOLVE' })).toBeInTheDocument();
  });
});

describe('the Resolve row and the header while writing', () => {
  it('the Resolve row hides once there is text, and returns when the box is empty', () => {
    renderDetail();
    expect(screen.getByRole('button', { name: /Resolve & save to KB/ })).toBeInTheDocument();
    type('<p>Hello.</p>');
    expect(screen.queryByRole('button', { name: /Resolve & save to KB/ })).toBeNull();
    type('');
    expect(screen.getByRole('button', { name: /Resolve & save to KB/ })).toBeInTheDocument();
  });

  it('the header keeps only its top row while the reply box is open', () => {
    renderDetail();
    expect(screen.getByTestId('detail-top-row')).not.toHaveAttribute('data-compact');
    expect(screen.getByTestId('header-chips').className).not.toMatch(/(^|\s)hidden(\s|$)/);
    type('<p>Hello.</p>');
    expect(screen.getByTestId('detail-top-row')).toHaveAttribute('data-compact', 'true');
    expect(screen.getByTestId('header-chips').className).toMatch(/(^|\s)hidden(\s|$)/);
  });
});
