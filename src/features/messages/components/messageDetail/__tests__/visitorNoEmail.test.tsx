/**
 * A website chat handed to the inbox for a visitor who left no email address, through
 * MessageDetail as the app renders it (the real header, composer and send path):
 * - the stored placeholder is never shown — "Website visitor (no email)" is;
 * - the reply box says a reply cannot be sent BEFORE anything is written, and every way of
 *   sending is off; notes and the resolve row keep working;
 * - when the conversation is read again with the address the visitor left, the block lifts
 *   without a reload — and a later visitor message is what triggers that re-read;
 * - the backend's own refusal (a client that had not caught up) is shown as its plain sentence,
 *   with no Retry.
 */
import { baseMessage, decisions, event, renderDetail, svc } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { subscribeToEvent } from '@/lib/socketManager';
import { VISITOR_NO_EMAIL_NOTICE, WEBSITE_VISITOR_NO_EMAIL } from '@/lib/visitorEmail';
import type { Message } from '@/types';
import { MessageDetail } from '../../MessageDetail';
import { VISITOR_EMAIL_REFRESH_MS } from '../useVisitorEmailArrival';

const PLACEHOLDER = 'anonymous@chat-widget.local';
const REFUSAL =
  'The visitor did not leave a valid email address in this chat, so there is no way to send them a reply.';
const visitorChat = { channel: 'chat', sender: PLACEHOLDER } as Partial<Message>;

const editor = () => screen.getByTestId('rich-text-editor');
const type = (html: string) => fireEvent.change(editor(), { target: { value: html } });
const sendButton = () => screen.getByRole('button', { name: /^SEND/ });
const ready = async () => {
  await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
};
const isOff = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';

/** The handlers the detail subscribed for one socket event (socketManager is mocked). */
const fire = (name: string, data: unknown) => {
  const calls = vi.mocked(subscribeToEvent).mock.calls.filter(([event]) => event === name);
  calls.forEach(([, handler]) => (handler as (data: unknown) => void)(data));
  return calls.length;
};

/** The page around the detail: it re-reads the conversation and hands the new record down. */
const pageRead = { next: null as Partial<Message> | null, count: 0 };
function Page({ first }: { first: Partial<Message> }) {
  const [message, setMessage] = useState({ ...baseMessage, ...first } as Message);
  return (
    <MessageDetail
      message={message}
      onClose={() => {}}
      onStatusChanged={() => {
        pageRead.count += 1;
        if (pageRead.next) setMessage((was) => ({ ...was, ...pageRead.next }) as Message);
      }}
    />
  );
}
const renderPage = (first: Partial<Message>) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <Page first={first} />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  window.localStorage.clear();
  pageRead.next = null;
  pageRead.count = 0;
  svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: [event({ id: 900 })] });
  svc.message.reply = vi.fn().mockResolvedValue({ success: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a website chat whose visitor left no email', () => {
  it('names the visitor "Website visitor (no email)" and never shows the placeholder', async () => {
    renderDetail(visitorChat);
    await ready();
    expect(screen.getAllByText(WEBSITE_VISITOR_NO_EMAIL).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('chat-widget.local');
    expect(document.body.innerHTML).not.toContain('mailto:');
    // No contact profile to open: the placeholder is not one customer.
    expect(screen.queryByTitle('View contact profile')).toBeNull();
  });

  it('CONTROL: a visitor with an email is shown by it, with the profile link', async () => {
    renderDetail({ channel: 'chat', sender: 'ada@example.com' } as Partial<Message>);
    await ready();
    expect(screen.getByTitle('View contact profile').textContent).toContain('ada@example.com');
    expect(screen.queryByText(WEBSITE_VISITOR_NO_EMAIL)).toBeNull();
  });

  it('says a reply cannot be sent before anything is written, and Send is off', async () => {
    renderDetail(visitorChat);
    await ready();
    const notice = screen.getByText(VISITOR_NO_EMAIL_NOTICE);
    expect(notice).toBeTruthy();
    expect(isOff(sendButton())).toBe(true);
    expect(sendButton().getAttribute('aria-describedby')).toBe(notice.id);
  });

  it('with a reply typed: Send, its menu and the shortcut all send nothing', async () => {
    renderDetail(visitorChat);
    await ready();
    type('<p>Hello</p>');
    const send = sendButton();
    const notice = screen.getByText(VISITOR_NO_EMAIL_NOTICE);
    expect(isOff(send)).toBe(true);
    expect(send.getAttribute('aria-describedby')).toBe(notice.id);
    const menu = screen.getByRole('button', { name: 'Choose what happens after sending' });
    expect(isOff(menu)).toBe(true);
    expect(menu.getAttribute('aria-describedby')).toBe(notice.id);
    fireEvent.click(send);
    fireEvent.click(menu);
    fireEvent.click(screen.getByTestId('rte-submit'));
    await act(async () => {});
    expect(svc.message.reply).not.toHaveBeenCalled();
    // Resolving without sending stays: the row is still under the blocked reply.
    expect(decisions()).not.toBeNull();
  });

  it.each([
    ['nobody owns the thread', { assigneeId: null }],
    ['a colleague owns the thread', { assigneeId: 99, assigneeName: 'Robin' }],
  ])('the send shortcut asks nothing about ownership when %s', async (_name, owner) => {
    renderDetail({ ...visitorChat, ...owner } as Partial<Message>);
    await ready();
    type('<p>Hello</p>');
    fireEvent.click(screen.getByTestId('rte-submit'));
    fireEvent.click(sendButton());
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/Assign this thread to you\?|Take over this thread/)).toBeNull();
    expect(svc.message.reply).not.toHaveBeenCalled();
  });

  it.each([
    ['nobody owns the thread', { assigneeId: null }, 'Assign this thread to you?'],
    [
      'a colleague owns the thread',
      { assigneeId: 99, assigneeName: 'Robin' },
      'Take over this thread from Robin?',
    ],
  ])('CONTROL: with an email, the shortcut does ask when %s', async (_name, owner, title) => {
    renderDetail({ channel: 'chat', sender: 'ada@example.com', ...owner } as Partial<Message>);
    await ready();
    type('<p>Hello</p>');
    fireEvent.click(screen.getByTestId('rte-submit'));
    expect(await screen.findByText(title)).toBeTruthy();
  });

  it('an internal note is not blocked: no notice, and it posts', async () => {
    svc.message.addNote = vi.fn().mockResolvedValue({ id: 1, content: 'Called them.' });
    renderDetail(visitorChat);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Internal note' }));
    expect(screen.queryByText(VISITOR_NO_EMAIL_NOTICE)).toBeNull();
    type('<p>Called them.</p>');
    const post = screen.getByRole('button', { name: 'POST NOTE' });
    expect(isOff(post)).toBe(false);
    fireEvent.click(post);
    await waitFor(() => expect(svc.message.addNote).toHaveBeenCalledTimes(1));
  });

  it('CONTROL: a chat whose visitor left an email has no notice and sends', async () => {
    renderDetail({ channel: 'chat', sender: 'ada@example.com' } as Partial<Message>);
    await ready();
    expect(screen.queryByText(VISITOR_NO_EMAIL_NOTICE)).toBeNull();
    type('<p>Hello</p>');
    expect(isOff(sendButton())).toBe(false);
    fireEvent.click(sendButton());
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
  });
});

describe('the visitor leaves an email later', () => {
  it('a re-read with the address lifts the block without a reload, and Send goes out', async () => {
    renderPage(visitorChat);
    await ready();
    type('<p>Hello</p>');
    expect(isOff(sendButton())).toBe(true);
    // The visitor writes again: the backend announces it as new mail on THIS conversation.
    pageRead.next = { sender: 'ada@example.com' };
    vi.useFakeTimers();
    expect(fire('conversation:new', { conversationId: baseMessage.id })).toBeGreaterThan(0);
    const readsBefore = svc.message.getThreadMessages.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(VISITOR_EMAIL_REFRESH_MS);
    });
    vi.useRealTimers();
    expect(pageRead.count).toBe(1);
    // …and the visitor's new message is read too.
    await waitFor(() =>
      expect(svc.message.getThreadMessages.mock.calls.length).toBeGreaterThan(readsBefore)
    );
    await waitFor(() => expect(screen.queryByText(VISITOR_NO_EMAIL_NOTICE)).toBeNull());
    expect(screen.getByTitle('View contact profile').textContent).toContain('ada@example.com');
    expect(isOff(sendButton())).toBe(false);
    fireEvent.click(sendButton());
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
  });

  it('CONTROL: mail on another conversation re-reads nothing', async () => {
    renderPage(visitorChat);
    await ready();
    vi.useFakeTimers();
    fire('conversation:new', { conversationId: baseMessage.id + 1 });
    act(() => {
      vi.advanceTimersByTime(VISITOR_EMAIL_REFRESH_MS * 4);
    });
    vi.useRealTimers();
    expect(pageRead.count).toBe(0);
    expect(screen.getByText(VISITOR_NO_EMAIL_NOTICE)).toBeTruthy();
  });

  it('a chat message event re-reads the conversation as well', async () => {
    renderPage(visitorChat);
    await ready();
    vi.useFakeTimers();
    expect(fire('thread:message', { conversationId: baseMessage.id })).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(VISITOR_EMAIL_REFRESH_MS);
    });
    vi.useRealTimers();
    expect(pageRead.count).toBe(1);
  });

  it('events inside the window join ONE re-read', async () => {
    renderPage(visitorChat);
    await ready();
    const readsBefore = svc.message.getThreadMessages.mock.calls.length;
    vi.useFakeTimers();
    fire('conversation:new', { conversationId: baseMessage.id });
    fire('conversation:new', { conversationId: baseMessage.id });
    fire('conversation:new', { conversationId: baseMessage.id });
    act(() => {
      vi.advanceTimersByTime(VISITOR_EMAIL_REFRESH_MS * 4);
    });
    vi.useRealTimers();
    expect(pageRead.count).toBe(1);
    await waitFor(() =>
      expect(svc.message.getThreadMessages.mock.calls.length).toBe(readsBefore + 1)
    );
  });

  it('a thread closed with a re-read pending reads nothing afterwards', async () => {
    const view = renderPage(visitorChat);
    await ready();
    const readsBefore = svc.message.getThreadMessages.mock.calls.length;
    vi.useFakeTimers();
    fire('conversation:new', { conversationId: baseMessage.id });
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(VISITOR_EMAIL_REFRESH_MS * 4);
    });
    vi.useRealTimers();
    expect(pageRead.count).toBe(0);
    expect(svc.message.getThreadMessages.mock.calls.length).toBe(readsBefore);
  });

  it('once the address is known, new visitor messages are still read — the conversation is not', async () => {
    renderPage({ channel: 'chat', sender: 'ada@example.com' });
    await ready();
    const readsBefore = svc.message.getThreadMessages.mock.calls.length;
    vi.useFakeTimers();
    expect(fire('conversation:new', { conversationId: baseMessage.id })).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(VISITOR_EMAIL_REFRESH_MS);
    });
    vi.useRealTimers();
    await waitFor(() =>
      expect(svc.message.getThreadMessages.mock.calls.length).toBe(readsBefore + 1)
    );
    expect(pageRead.count).toBe(0);
  });

  it('CONTROL: a thread of another channel does not read on new mail', async () => {
    renderPage({ channel: 'email', sender: 'ada@example.com' });
    await ready();
    const readsBefore = svc.message.getThreadMessages.mock.calls.length;
    vi.useFakeTimers();
    fire('conversation:new', { conversationId: baseMessage.id });
    act(() => {
      vi.advanceTimersByTime(VISITOR_EMAIL_REFRESH_MS * 4);
    });
    vi.useRealTimers();
    // (The read, had one started, would have reached the service by now.)
    await act(async () => {});
    expect(pageRead.count).toBe(0);
    expect(svc.message.getThreadMessages.mock.calls.length).toBe(readsBefore);
  });
});

describe("the backend's own refusal, on a client that had not caught up", () => {
  it('is shown as its plain sentence, with no Retry, and the reply text is kept', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error(REFUSAL), { status: 409, data: { error: REFUSAL } })
      );
    // This client still holds an address for the visitor, so Send is on.
    renderDetail({ channel: 'chat', sender: 'ada@example.com' } as Partial<Message>);
    await ready();
    type('<p>Hello</p>');
    fireEvent.click(sendButton());
    await screen.findByText(REFUSAL);
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    expect(screen.queryByText(/Send this reply again/)).toBeNull();
    expect((editor() as HTMLTextAreaElement).value).toBe('<p>Hello</p>');
    expect(screen.queryByText(/please try again/i)).toBeNull();
  });
});
