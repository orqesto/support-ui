/**
 * Message detail v4 — the phone layout: the composer — pill, open, fold, controls that remove
 * themselves, AI draft (M7). Shared mocks and render helpers: md4.mobile.utils.tsx. Every phone
 * test has a desktop CONTROL.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  setViewport,
  renderDetail,
  composer,
  classOf,
  flushBetweenRootAndDocument,
  tap,
  phoneState,
  svc,
  aiDrafts,
  baseMessage,
} from './md4.mobile.utils';
import { createRef } from 'react';
import { render, screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react';
import type { Message } from '@/types';
import { MessageComposer } from '../MessageComposer';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => {
  // The services' auto-stub (md4.mobile.utils.tsx): each method a vi.fn resolving [].
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    apiClient: new Proxy(fns, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
        return target[key];
      },
    }),
  };
});

describe('M7 — the composer on a phone', () => {
  it('at rest: a pill — editor, AI draft and a round Send; tabs, recipients, Attach hidden', () => {
    setViewport(true);
    renderDetail();
    const box = composer();
    expect(box.getAttribute('data-phone-state')).toBe('rest');
    expect(classOf(box)).toContain('max-sm:sticky');
    expect(classOf(box)).toContain('max-sm:bottom-0');
    expect(classOf(box)).toContain('env(safe-area-inset-bottom)');
    expect(classOf(within(box).getByRole('group', { name: 'Composer mode' }))).toContain('hidden');
    expect(within(box).queryByRole('button', { name: 'Edit recipients' })).toBeNull();
    expect(classOf(within(box).getByTestId('composer-attach'))).toContain('hidden');
    expect(classOf(within(box).getByRole('button', { name: 'KB' }))).toContain('hidden');
    expect(classOf(within(box).getByRole('button', { name: /AI draft/ }).parentElement)).toContain(
      '[&>button]:!h-10'
    );
    const send = within(box).getByRole('button', { name: 'SEND' });
    expect(classOf(send)).toContain('!rounded-full');
    expect(classOf(send)).toContain('!w-10');
    expect(classOf(screen.getByTestId('composer-field'))).toContain('!rounded-[24px]');
    expect(classOf(screen.getByTestId('rich-text-editor'))).toContain('h-10');
  });

  it('opens on a press, focus or typing; full editor at 96px', () => {
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByTestId('rich-text-editor'));
    const box = composer();
    expect(box.getAttribute('data-phone-state')).toBe('open');
    expect(classOf(within(box).getByRole('group', { name: 'Composer mode' }))).not.toContain(
      'hidden'
    );
    expect(within(box).getByRole('button', { name: 'Edit recipients' })).toBeTruthy();
    expect(classOf(within(box).getByTestId('composer-attach'))).not.toContain('hidden');
    expect(screen.getByTestId('rich-text-editor').getAttribute('data-min-height')).toBe('96px');
    cleanup();
    renderDetail();
    fireEvent.focus(screen.getByTestId('rich-text-editor'));
    expect(composer().getAttribute('data-phone-state')).toBe('open');
  });

  it('folds back on an outside press only while empty', () => {
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByTestId('rich-text-editor'));
    fireEvent.click(document.body);
    expect(composer().getAttribute('data-phone-state')).toBe('rest');
    fireEvent.change(screen.getByTestId('rich-text-editor'), {
      target: { value: '<p>On its way</p>' },
    });
    expect(composer().getAttribute('data-phone-state')).toBe('open');
    fireEvent.click(document.body);
    expect(composer().getAttribute('data-phone-state')).toBe('open');
  });

  it('note mode opens at 134px, and the composer shows on the Notes tab', () => {
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'open Notes tab' }));
    expect(classOf(composer())).not.toMatch(/(^|\s)hidden(\s|$)/);
    fireEvent.click(screen.getByTestId('rich-text-editor'));
    expect(screen.getByTestId('rich-text-editor').getAttribute('data-min-height')).toBe('134px');
  });

  it('hidden (still mounted) under any other tab', () => {
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'open AI tab' }));
    expect(classOf(composer())).toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('AI drafts off: the off note waits for the open composer', () => {
    setViewport(true);
    aiDrafts.off = true;
    renderDetail();
    expect(classOf(screen.getByTestId('ai-drafts-off-note').parentElement)).toContain(
      '[&>span]:hidden'
    );
  });

  it('a blocked WhatsApp window still shows its notice at rest', () => {
    setViewport(true);
    renderDetail({
      channel: 'whatsapp',
      whatsappWindow: { reason: 'no_inbound' },
    } as Partial<Message>);
    expect(composer().getAttribute('data-phone-state')).toBe('rest');
    expect(within(composer()).getByRole('alert').textContent).toContain('WhatsApp only allows');
  });

  it('inputs and the editor are 16px on a phone (no iOS focus zoom)', () => {
    setViewport(true);
    renderDetail();
    const cls = classOf(screen.getByTestId('message-detail-root'));
    expect(cls).toContain('max-sm:[&_input]:text-base');
    expect(cls).toContain('max-sm:[&_textarea]:text-base');
    expect(cls).toContain('max-sm:[&_.ProseMirror]:text-base');
  });

  it('desktop: no phone state; folded while empty, open = 44px editor and tabs; folds on an outside press', () => {
    setViewport(false);
    renderDetail();
    const box = composer();
    expect(box.getAttribute('data-phone-state')).toBeNull();
    expect(box.getAttribute('data-state')).toBe('rest');
    fireEvent.click(screen.getByTestId('composer-field'));
    expect(box.getAttribute('data-state')).toBe('open');
    expect(screen.getByTestId('rich-text-editor').getAttribute('data-min-height')).toBe('44px');
    expect(classOf(within(box).getByRole('group', { name: 'Composer mode' }))).not.toContain(
      'hidden'
    );
    expect(within(box).getByRole('button', { name: 'SEND' }).textContent).toContain('SEND');
    fireEvent.click(screen.getByRole('button', { name: 'open AI tab' }));
    expect(classOf(composer())).not.toMatch(/(^|\s)hidden(\s|$)/);
    fireEvent.click(document.body);
    expect(composer().getAttribute('data-state')).toBe('rest');
  });
});

describe('M7 — the phone composer stays open when a tapped control removes itself', () => {
  let stopFlushing: () => void = () => {};
  beforeEach(() => {
    setViewport(true);
    stopFlushing = flushBetweenRootAndDocument();
    // An AI draft that is still being written.
    svc.message.composeReply = vi.fn(() => new Promise(() => {}));
  });
  afterEach(() => stopFlushing());

  const openComposer = () => {
    renderDetail();
    tap(screen.getByTestId('rich-text-editor'));
    expect(phoneState()).toBe('open');
  };

  it('AI draft: the composer stays open and the button says the draft is being written', () => {
    openComposer();
    tap(within(composer()).getByRole('button', { name: /AI draft/ }));
    expect(phoneState()).toBe('open');
    expect(within(composer()).getByRole('button', { name: /Drafting/ })).toBeTruthy();
  });

  it('Edit recipients keeps it open, with the fields expanded', () => {
    openComposer();
    tap(within(composer()).getByRole('button', { name: 'Edit recipients' }));
    expect(phoneState()).toBe('open');
    expect(within(composer()).getByLabelText('To')).toBeTruthy();
  });

  it('removing the last file keeps it open', () => {
    renderDetail();
    const input = composer().querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['x'], 'receipt.pdf')] } });
    expect(phoneState()).toBe('open');
    tap(within(composer()).getByRole('button', { name: 'Remove file' }));
    expect(phoneState()).toBe('open');
  });

  it('a real outside press still folds an empty composer; a non-empty one never folds', () => {
    openComposer();
    tap(document.body);
    expect(phoneState()).toBe('rest');
    fireEvent.change(screen.getByTestId('rich-text-editor'), {
      target: { value: '<p>On its way</p>' },
    });
    expect(phoneState()).toBe('open');
    tap(document.body);
    expect(phoneState()).toBe('open');
  });

  it('never folds while an AI request is in flight, even on an outside press', () => {
    openComposer();
    tap(within(composer()).getByRole('button', { name: /AI draft/ }));
    tap(document.body);
    expect(phoneState()).toBe('open');
    expect(within(composer()).getByRole('button', { name: /Drafting/ })).toBeTruthy();
  });

  it('switching to Internal note mid-request clears the AI hold: an empty note folds again', () => {
    openComposer();
    tap(within(composer()).getByRole('button', { name: /AI draft/ }));
    // CONTROL: the request in flight holds the composer open.
    tap(document.body);
    expect(phoneState()).toBe('open');
    // Note mode unmounts the AI controls; what they reported must not outlive them.
    tap(within(composer()).getByRole('button', { name: 'Internal note' }));
    expect(within(composer()).queryByRole('button', { name: /AI draft|Drafting/ })).toBeNull();
    expect(phoneState()).toBe('open');
    tap(document.body);
    expect(phoneState()).toBe('rest');
  });

  it('a press that began inside the composer is inside, wherever the click lands', () => {
    openComposer();
    // The press on the editor, the release after the composer grew under the finger.
    fireEvent.pointerDown(screen.getByTestId('rich-text-editor'));
    fireEvent.click(document.body);
    expect(phoneState()).toBe('open');
  });

  it.each(['To', 'Cc', 'Bcc'])(
    'an address-only draft (%s typed, empty body) never folds on an outside press',
    (field) => {
      openComposer();
      tap(within(composer()).getByRole('button', { name: 'Edit recipients' }));
      // Cc and Bcc reveal from their own buttons; To is always there.
      if (field !== 'To') tap(within(composer()).getByRole('button', { name: field }));
      fireEvent.change(within(composer()).getByLabelText(field), {
        target: { value: 'ops@acme.test' },
      });
      tap(document.body);
      expect(phoneState()).toBe('open');
      // CONTROL: the same press folds it once the address is gone — the address kept it open.
      fireEvent.change(within(composer()).getByLabelText(field), { target: { value: '' } });
      tap(document.body);
      expect(phoneState()).toBe('rest');
    }
  );

  it.each([
    ['menu', { role: 'menu' }],
    ['listbox', { role: 'listbox' }],
    ['dialog', { role: 'dialog' }],
    ['aria-modal sheet', { 'aria-modal': 'true' }],
  ])(
    'a press that begins inside a %s portalled to <body> does not fold an empty composer',
    (_name, attributes) => {
      openComposer();
      // Portalled: a child of <body>, outside the composer's DOM. It closes on the click, as a
      // menu does — so by the document listener the item tapped is detached.
      const portal = document.createElement('div');
      Object.entries(attributes).forEach(([key, value]) => portal.setAttribute(key, value));
      const item = document.createElement('span');
      item.textContent = 'Pick me';
      portal.appendChild(item);
      document.body.appendChild(portal);
      item.addEventListener('click', () => portal.remove());
      tap(item);
      expect(portal.isConnected).toBe(false);
      expect(phoneState()).toBe('open');
      // CONTROL: the same tap on a plain node outside folds it.
      const plain = document.createElement('span');
      document.body.appendChild(plain);
      tap(plain);
      plain.remove();
      expect(phoneState()).toBe('rest');
    }
  );
});

describe('M7 — AI draft on a phone', () => {
  const props = () => ({
    message: { ...baseMessage, id: 4242 },
    composer: '',
    setComposer: vi.fn(),
    composerMode: 'reply' as const,
    setComposerMode: vi.fn(),
    submitting: false,
    onSend: vi.fn(),
    richEditorRef: createRef<never>(),
    noteEditorRef: createRef<never>(),
    onOpenSimilarMessages: vi.fn(),
    selectedFiles: [],
    onFilesChange: vi.fn(),
  });
  const aiButton = () => within(composer()).getByRole('button', { name: /AI draft/ });

  it('focus on a button does not open it (Android focuses on the press); focus in the editor does', () => {
    setViewport(true);
    render(<MessageComposer {...props()} />);
    fireEvent.focus(aiButton());
    expect(phoneState()).toBe('rest');
    fireEvent.focus(screen.getByTestId('rich-text-editor'));
    expect(phoneState()).toBe('open');
  });

  it('drafts switched off mid-session (a 409 on AI draft): the composer can fold again', async () => {
    setViewport(true);
    aiDrafts.offOnRefresh = true;
    let refuse: (err: unknown) => void = () => {};
    svc.message.composeReply = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        })
    );
    render(<MessageComposer {...props()} />);
    tap(aiButton());
    // CONTROL: while the request is in flight, an outside press keeps the composer open.
    tap(document.body);
    expect(phoneState()).toBe('open');
    await act(async () => {
      refuse({ response: { status: 409, data: { code: 'AI_DRAFTS_OFF', error: 'Off.' } } });
      await Promise.resolve();
    });
    expect(within(composer()).getByTestId('ai-drafts-off-note')).toBeTruthy();
    tap(document.body);
    expect(phoneState()).toBe('rest');
  });

  describe('what holds a phone composer open (pass 16)', () => {
    let stopFlushing: () => void = () => {};
    beforeEach(() => {
      setViewport(true);
      stopFlushing = flushBetweenRootAndDocument();
    });
    afterEach(() => stopFlushing());

    it('a draft that landed in the editor is not folded by an outside press', async () => {
      svc.message.composeReply = vi
        .fn()
        .mockResolvedValue({ data: { text: 'Your parcel ships today.' } });
      renderDetail();
      tap(screen.getByTestId('rich-text-editor'));
      expect(phoneState()).toBe('open');
      tap(within(composer()).getByRole('button', { name: /AI draft/ }));
      const editor = () => screen.getByTestId<HTMLTextAreaElement>('rich-text-editor');
      // The editor schema is imported when the draft lands (LazyRichTextEditor), a few ticks later.
      await waitFor(() => expect(editor().value).toContain('Your parcel ships today.'));
      tap(document.body);
      expect(phoneState()).toBe('open');
      expect(editor().value).toContain('Your parcel ships today.');
    });

    it('after a tap folded it, a KEYBOARD click on the AI draft pill opens the composer', () => {
      renderDetail();
      tap(screen.getByTestId('rich-text-editor'));
      expect(phoneState()).toBe('open');
      tap(document.body);
      expect(phoneState()).toBe('rest');
      // Enter/Space on a button: a click with no pointerdown before it.
      fireEvent.click(within(composer()).getByRole('button', { name: /AI draft/ }));
      expect(phoneState()).toBe('open');
    });
  });

  it('while a draft is being written, Send is off — the editor holds the NOTE, not a reply', () => {
    setViewport(false);
    svc.message.composeReply = vi.fn(() => new Promise(() => {}));
    render(<MessageComposer {...props()} composer="<p>refund issued</p>" />);
    const send = () => within(composer()).getByRole('button', { name: /send/i });
    expect((send() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(aiButton());
    expect((send() as HTMLButtonElement).disabled).toBe(true);
  });

  it('CONTROL desktop: AI draft drafts at once — there is no panel to open', () => {
    setViewport(false);
    svc.message.composeReply = vi.fn(() => new Promise(() => {}));
    render(<MessageComposer {...props()} />);
    fireEvent.click(aiButton());
    expect(svc.message.composeReply).toHaveBeenCalledWith(4242, { mode: 'generate' });
    expect(within(composer()).getByRole('button', { name: /Drafting/ })).toBeTruthy();
  });
});
