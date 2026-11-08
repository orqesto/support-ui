/**
 * Send ▾ (2026-10-29): what happens to the conversation once the reply is out, chosen on the Send
 * button as in Zendesk's submit-as. Through MessageDetail, as the app calls the services.
 */
import { renderDetail, setViewport, svc } from './md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createRef } from 'react';
import { flushSync } from 'react-dom';
import type { Message } from '@/types';
import { MessageComposer } from '../MessageComposer';
import { readSendAction } from '../ComposerSendButton';
import { toast } from '@/lib/toast';

vi.mock('@/lib/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

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

  it('the reply is out but resolving fails: a toast says so — not the "Send failed" bar', async () => {
    svc.message.close = vi.fn().mockRejectedValue(new Error('500'));
    renderDetail();
    type('<p>Done.</p>');
    pick('Send and resolve');
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Reply sent — but resolving failed. Resolve it from the Resolve row.'
      )
    );
    expect(screen.queryByText(/Send failed/)).toBeNull();
  });

  it('a menu pick becomes the face, and pressing the face sends with it', async () => {
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

describe('Send ▾ — what is remembered', () => {
  it('cancelling the hold dialog does not make hold the face', async () => {
    renderDetail();
    type('<p>Hi.</p>');
    pick('Send and put on hold');
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(window.localStorage.getItem('odly.sendAction.7')).toBeNull();
    expect(screen.getByRole('button', { name: 'SEND' })).toBeInTheDocument();
  });

  it('CONTROL: a confirmed hold IS remembered', async () => {
    renderDetail();
    type('<p>Hi.</p>');
    pick('Send and put on hold');
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Courier' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send and put on hold' }));
    await waitFor(() => expect(svc.message.setStatus).toHaveBeenCalled());
    expect(window.localStorage.getItem('odly.sendAction.7')).toBe('hold');
  });

  it('pressing the fallback face on a thread that cannot be resolved keeps the stored choice', async () => {
    window.localStorage.setItem('odly.sendAction.7', 'resolve');
    // A resolved thread: replying reopens it, resolving is not on offer (resolveMode null).
    renderDetail({ status: 'resolved' });
    type('<p>Hello.</p>');
    fireEvent.click(screen.getByRole('button', { name: 'SEND' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalled());
    expect(window.localStorage.getItem('odly.sendAction.7')).toBe('resolve');
    expect(svc.message.close).not.toHaveBeenCalled();
  });

  it('a stored value that is not a choice ("constructor", "toString") reads as plain Send', () => {
    window.localStorage.setItem('odly.sendAction.7', 'constructor');
    expect(readSendAction(7)).toBe('send');
    window.localStorage.setItem('odly.sendAction.7', 'toString');
    expect(readSendAction(7)).toBe('send');
    // CONTROL: a real choice reads back.
    window.localStorage.setItem('odly.sendAction.7', 'resolve_kb');
    expect(readSendAction(7)).toBe('resolve_kb');
  });
});

describe('Send ▾ elsewhere', () => {
  it('a new thread (open, customer has not written again) offers all four — the send IS the reply', () => {
    // Owner 2026-11-03: the Resolve row hides while a reply is typed, so leaving resolve out of
    // Send ▾ here left a new thread with a draft no way to resolve at all.
    window.localStorage.setItem('odly.sendAction.7', 'resolve');
    renderDetail({ status: 'open', lastReplyFromClient: false });
    type('<p>Hello.</p>');
    // …but the FACE is plain Send whatever was remembered (owner 2026-11-03): one habit click must
    // not resolve a first contact. The remembered choice is kept for the next active thread.
    expect(screen.getByRole('button', { name: 'SEND' })).toBeInTheDocument();
    expect(window.localStorage.getItem('odly.sendAction.7')).toBe('resolve');
    openSendMenu();
    expect(screen.getAllByRole('menuitemcheckbox').map((item) => item.textContent)).toEqual([
      'Send',
      'Send and resolve',
      'Send, resolve & save to KB',
      'Send and put on hold',
    ]);
  });

  it('Send and resolve on a new thread: the reply goes out, then the thread is resolved', async () => {
    renderDetail({ status: 'open', lastReplyFromClient: false });
    type('<p>Hello.</p>');
    openSendMenu();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Send and resolve' }));
    await waitFor(() => expect(svc.message.close).toHaveBeenCalled());
    expect(svc.message.reply).toHaveBeenCalled();
    expect(svc.message.reply.mock.invocationCallOrder[0]).toBeLessThan(
      svc.message.close.mock.invocationCallOrder[0]
    );
  });

  it('CONTROL: a resolved thread offers Send and hold only, and a remembered "resolve" falls back to Send', () => {
    window.localStorage.setItem('odly.sendAction.7', 'resolve');
    renderDetail({ status: 'resolved' });
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

  it('the header stays whole while the reply box is open', () => {
    renderDetail();
    type('<p>Hello.</p>');
    expect(screen.getByTestId('detail-top-row')).not.toHaveAttribute('data-compact');
    expect(screen.getByTestId('header-chips').className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });
});

describe('folding the reply box with a draft', () => {
  it("the editor's Collapse folds the box with a draft and keeps the text", () => {
    renderDetail();
    type('<p>Half-written answer</p>');
    // A real press: pointerdown INSIDE the box, then the click. The page-wide listener reads that
    // as a press into the composer — it reopened the box within the same click (staging, #820).
    // ⚠️ A browser runs a microtask checkpoint between listeners, so React has re-rendered the
    // fold before that document listener runs; jsdom re-renders only after the whole dispatch,
    // which hid the bug. Flushing React on <body> — between React's root and the document — puts
    // the browser's order back.
    const flushOnBody = () => flushSync(() => {});
    document.body.addEventListener('click', flushOnBody);
    const collapse = screen.getByTestId('rte-collapse');
    fireEvent.pointerDown(collapse);
    fireEvent.click(collapse);
    document.body.removeEventListener('click', flushOnBody);
    expect(screen.getByTestId('message-composer')).toHaveAttribute('data-state', 'rest');
    // The draft is kept — the folded editor still holds it (the real editor shows its first line:
    // RichTextEditor.collapsedDraft.test) — and pressing into the pill opens the box with it.
    expect(screen.getByTestId('rich-text-editor')).toHaveValue('<p>Half-written answer</p>');
    // The next press into the pill is NOT swallowed by the fold's guard.
    fireEvent.pointerDown(screen.getByTestId('composer-field'));
    fireEvent.click(screen.getByTestId('composer-field'));
    expect(screen.getByTestId('message-composer')).toHaveAttribute('data-state', 'open');
    expect(screen.getByTestId('rich-text-editor')).toHaveValue('<p>Half-written answer</p>');
  });

  it('CONTROL: an outside press still never folds a draft away', () => {
    renderDetail();
    type('<p>Half-written answer</p>');
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    expect(screen.getByTestId('message-composer')).toHaveAttribute('data-state', 'open');
  });
});

describe('the Resolve row when sending is blocked', () => {
  const composerWith = (sendBlockedReason: string | null) =>
    render(
      <MemoryRouter>
        <MessageComposer
          message={{ id: 5, channel: 'whatsapp' } as unknown as Message}
          composer="<p>A typed reply.</p>"
          setComposer={vi.fn()}
          composerMode="reply"
          setComposerMode={vi.fn()}
          submitting={false}
          onSend={vi.fn()}
          richEditorRef={createRef()}
          noteEditorRef={createRef()}
          onOpenSimilarMessages={vi.fn()}
          selectedFiles={[]}
          onFilesChange={vi.fn()}
          sendBlockedReason={sendBlockedReason}
          decisions={<div data-testid="decisions-row" />}
        />
      </MemoryRouter>
    );

  it('a typed reply on a shut WhatsApp window keeps the Resolve row (Send is off too)', () => {
    composerWith('The 24-hour window is closed.');
    expect(screen.getByTestId('decisions-row')).toBeInTheDocument();
  });

  it('CONTROL: a typed reply that can be sent hides it', () => {
    composerWith(null);
    expect(screen.queryByTestId('decisions-row')).toBeNull();
  });
});

describe('the header never hides on scroll', () => {
  const scrollThread = (top: number) => {
    const scroller = screen.getByTestId('thread-scroller');
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 300 });
    fireEvent.wheel(scroller);
    scroller.scrollTop = top;
    fireEvent.scroll(scroller);
  };

  it('a long thread: scrolling down keeps the full header', () => {
    renderDetail();
    scrollThread(900);
    expect(screen.getByTestId('detail-top-row')).not.toHaveAttribute('data-compact');
    expect(screen.getByTestId('header-chips').className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('scrolling down while writing keeps the full header too', () => {
    renderDetail();
    type('<p>Half-written answer</p>');
    scrollThread(900);
    expect(screen.getByTestId('detail-top-row')).not.toHaveAttribute('data-compact');
  });
});

describe('opening a thread lands on its newest message', () => {
  const events = [1, 2, 3].map((num) => ({
    id: 600 + num,
    type: 'inbound',
    content: `Message ${num}`,
    authorEmail: 'ada@example.com',
    createdAt: `2026-09-2${num}T10:00:00Z`,
  }));
  const withScrollSize = () => {
    const scroller = screen.getByTestId('thread-scroller');
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2400 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 300 });
    return scroller;
  };

  it('scrolls to the bottom once the thread has loaded, keeping the full header', async () => {
    svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: events });
    renderDetail();
    const scroller = withScrollSize();
    await screen.findByText('Message 3');
    await waitFor(() => expect(scroller.scrollTop).toBe(2400));
    expect(screen.getByTestId('detail-top-row')).not.toHaveAttribute('data-compact');
  });

  it("CONTROL: the reader's own scroll before it settles is never overridden", async () => {
    svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: events });
    renderDetail();
    const scroller = withScrollSize();
    fireEvent.wheel(scroller);
    scroller.scrollTop = 120;
    await screen.findByText('Message 3');
    expect(scroller.scrollTop).toBe(120);
  });
});

describe('a folded draft (review of #819–#822)', () => {
  const press = (el: Element) => {
    fireEvent.pointerDown(el);
    fireEvent.click(el);
  };
  const foldWithFlush = () => {
    const flushOnBody = () => flushSync(() => {});
    document.body.addEventListener('click', flushOnBody);
    press(screen.getByTestId('rte-collapse'));
    document.body.removeEventListener('click', flushOnBody);
  };

  it("the folded box's round Send opens the box instead of sending what it hides", () => {
    renderDetail();
    type('<p>Half-written answer</p>');
    foldWithFlush();
    expect(screen.getByTestId('message-composer')).toHaveAttribute('data-state', 'rest');
    const roundSend = within(screen.getByTestId('message-composer')).getByRole('button', {
      name: /send/i,
    });
    fireEvent.click(roundSend);
    expect(svc.message.reply).not.toHaveBeenCalled();
    expect(screen.getByTestId('message-composer')).toHaveAttribute('data-state', 'open');
  });

  it("CONTROL: an empty folded box's round Send stays disabled", () => {
    renderDetail();
    const roundSend = within(screen.getByTestId('message-composer')).getByRole('button', {
      name: /send/i,
    });
    expect(roundSend).toBeInactive();
  });

  it('an address arriving onto a folded draft opens the box; the reset to empty does not', () => {
    const view = (to: string) => (
      <MemoryRouter>
        <MessageComposer
          message={
            {
              id: 5,
              channel: 'email',
              sender: 'Customer <customer@example.com>',
              from: 'Customer <customer@example.com>',
              recipients: [],
            } as unknown as Message
          }
          composer="<p>Half-written answer</p>"
          setComposer={vi.fn()}
          composerMode="reply"
          setComposerMode={vi.fn()}
          submitting={false}
          onSend={vi.fn()}
          richEditorRef={createRef()}
          noteEditorRef={createRef()}
          onOpenSimilarMessages={vi.fn()}
          selectedFiles={[]}
          onFilesChange={vi.fn()}
          recipientDraft={{ to, cc: '', bcc: '' }}
          onRecipientDraftChange={vi.fn()}
        />
      </MemoryRouter>
    );
    const { rerender } = render(view(''));
    // A draft arrived (non-empty text) → the box opened; fold it on purpose.
    expect(screen.getByTestId('message-composer')).toHaveAttribute('data-state', 'open');
    const flushOnBody = () => flushSync(() => {});
    document.body.addEventListener('click', flushOnBody);
    press(screen.getByTestId('rte-collapse'));
    document.body.removeEventListener('click', flushOnBody);
    expect(screen.getByTestId('message-composer')).toHaveAttribute('data-state', 'rest');
    // "Reply to this message" sets the To line.
    rerender(view('someone@example.com'));
    expect(screen.getByTestId('message-composer')).toHaveAttribute('data-state', 'open');
  });
});

describe('phones open at the newest message too', () => {
  it('scrolls the document to its bottom once the thread has loaded', async () => {
    setViewport(true);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 3200,
    });
    svc.message.getThreadMessages = vi.fn().mockResolvedValue({
      data: [1, 2].map((num) => ({
        id: 700 + num,
        type: 'inbound',
        content: `Phone message ${num}`,
        authorEmail: 'ada@example.com',
        createdAt: `2026-09-2${num}T10:00:00Z`,
      })),
    });
    renderDetail();
    await screen.findByText('Phone message 2');
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 3200 }));
  });
});
