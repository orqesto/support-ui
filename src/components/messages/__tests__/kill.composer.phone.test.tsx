/**
 * MessageComposer on a phone — the pill's classes, the press listeners' wiring and the draft
 * test. Shared mocks (the stateless editor textarea): md4.mobile.utils.tsx, imported first.
 */
import { describe, it, expect, vi } from 'vitest';
import { setViewport, composer, classOf, phoneState, baseMessage } from './md4.mobile.utils';
import { createRef } from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import type { RecipientDraft } from '../RecipientFields';
import { MessageComposer } from '../MessageComposer';
import { PHONE_QUERY } from '../useIsPhone';

vi.mock('@/lib/api-client', () => {
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

const props = (over: Partial<React.ComponentProps<typeof MessageComposer>> = {}) => ({
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
  ...over,
});

const editor = () => screen.getByTestId('rich-text-editor');
const tools = () => screen.getByTestId('composer-tools');
const tap = (el: Element) => {
  fireEvent.pointerDown(el);
  fireEvent.click(el);
};
const openIt = () => {
  tap(editor());
  expect(phoneState()).toBe('open');
};
/** The flex spacer: the span right before the "⌘↵ send" hint. */
const spacer = () => within(tools()).getByText(/⌘↵/).previousElementSibling as HTMLElement;

describe('phone toolbar and Send classes', () => {
  it('open: tool buttons are 36px, tools wrap 6px apart, Send is tool-sized', () => {
    setViewport(true);
    render(<MessageComposer {...props({ onLookUp: vi.fn() })} />);
    openIt();
    expect(classOf(within(composer()).getByTitle('Attach files'))).toContain('max-sm:h-9');
    expect(classOf(within(composer()).getByTitle('Search knowledge base'))).toContain('max-sm:h-9');
    expect(classOf(within(composer()).getByTitle('Search knowledge base'))).toContain(
      'rounded-[7px]'
    );
    const toolbar = classOf(tools());
    expect(toolbar).toContain('max-sm:[&_button]:min-h-9');
    expect(toolbar).toContain('max-sm:gap-1.5');
    expect(toolbar).toContain('flex-wrap');
    expect(toolbar).not.toContain('!flex-nowrap');
    const send = within(composer()).getByRole('button', { name: 'SEND' });
    expect(classOf(send)).toContain('max-sm:h-9');
    expect(classOf(send)).toContain('max-sm:px-3.5');
    expect(classOf(spacer())).toContain('flex-1');
    expect(classOf(spacer()).split(/\s+/)).not.toContain('hidden');
  });

  it('at rest: the toolbar is the pill row and the spacer is hidden', () => {
    setViewport(true);
    render(<MessageComposer {...props()} />);
    expect(phoneState()).toBe('rest');
    const toolbar = classOf(tools());
    expect(toolbar).toContain('!flex-nowrap');
    expect(toolbar).toContain('flex-none');
    expect(toolbar).not.toContain('max-sm:gap-1.5');
    expect(classOf(spacer()).split(/\s+/)).toContain('hidden');
  });

  it('desktop: Attach shows its word and the spacer pushes Send right', () => {
    setViewport(false);
    render(<MessageComposer {...props()} />);
    expect(within(composer()).getByTitle('Attach files').textContent).toBe('Attach');
    expect(screen.getByText('Attach')).toBeInTheDocument();
    expect(classOf(spacer()).split(/\s+/)).toContain('flex-1');
    expect(classOf(spacer()).split(/\s+/)).not.toContain('hidden');
  });

  it('note mode at rest: the editor is the pill input and the round button is POST NOTE', () => {
    setViewport(true);
    render(<MessageComposer {...props({ composerMode: 'note' })} />);
    expect(phoneState()).toBe('rest');
    expect(classOf(editor())).toContain('h-10');
    expect(classOf(editor())).toContain('rounded-full');
    expect(within(composer()).getByRole('button', { name: 'POST NOTE' })).toBeTruthy();
    expect(within(composer()).queryByRole('button', { name: 'SEND' })).toBeNull();
  });

  it('CONTROL reply mode at rest: the round button is SEND', () => {
    setViewport(true);
    render(<MessageComposer {...props()} />);
    expect(within(composer()).getByRole('button', { name: 'SEND' })).toBeTruthy();
  });
});

describe('a whitespace-only address is not a draft', () => {
  const draft = (over: Partial<RecipientDraft>): RecipientDraft => ({
    to: '',
    cc: '',
    bcc: '',
    ...over,
  });

  it.each(['to', 'cc', 'bcc'] as const)('%s of spaces leaves the composer at rest', (field) => {
    setViewport(true);
    render(
      <MessageComposer
        {...props({ recipientDraft: draft({ [field]: '   ' }), onRecipientDraftChange: vi.fn() })}
      />
    );
    expect(phoneState()).toBe('rest');
  });

  it.each(['to', 'cc', 'bcc'] as const)('CONTROL: a real %s address opens it', (field) => {
    setViewport(true);
    render(
      <MessageComposer
        {...props({
          recipientDraft: draft({ [field]: 'ops@acme.test' }),
          onRecipientDraftChange: vi.fn(),
        })}
      />
    );
    expect(phoneState()).toBe('open');
  });

  it.each(['to', 'cc', 'bcc'] as const)('%s of spaces: an open composer still folds', (field) => {
    setViewport(true);
    render(
      <MessageComposer
        {...props({ recipientDraft: draft({ [field]: '  ' }), onRecipientDraftChange: vi.fn() })}
      />
    );
    openIt();
    tap(document.body);
    expect(phoneState()).toBe('rest');
  });
});

describe('press listeners', () => {
  it('a cancelled outside press leaves no record: a keyboard click inside then opens it', () => {
    setViewport(true);
    render(<MessageComposer {...props()} />);
    fireEvent.pointerDown(document.body);
    fireEvent.pointerCancel(document.body);
    fireEvent.click(editor());
    expect(phoneState()).toBe('open');
  });

  it('CONTROL: an un-cancelled outside press followed by a click inside is outside', () => {
    setViewport(true);
    render(<MessageComposer {...props()} />);
    fireEvent.pointerDown(document.body);
    fireEvent.click(editor());
    expect(phoneState()).toBe('rest');
  });

  it('every document listener added is removed on unmount with the same phase', () => {
    setViewport(true);
    const capture = (opt: unknown) =>
      typeof opt === 'boolean' ? opt : Boolean((opt as { capture?: boolean } | undefined)?.capture);
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<MessageComposer {...props()} />);
    const added = add.mock.calls.map(([type, fn, opt]) => ({ type, fn, phase: capture(opt) }));
    const mine = added.filter(({ type }) =>
      ['pointerdown', 'pointercancel', 'click', ''].includes(type)
    );
    // pointerdown + pointercancel + click (capture) + click (bubble), at least.
    expect(mine.filter(({ phase }) => phase)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'pointerdown' }),
        expect.objectContaining({ type: 'pointercancel' }),
        expect.objectContaining({ type: 'click' }),
      ])
    );
    expect(mine).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'click', phase: false })])
    );
    unmount();
    const removed = remove.mock.calls.map(([type, fn, opt]) => ({ type, fn, phase: capture(opt) }));
    // `mine`, not `added`: React DOM adds its own one-time document listener (selectionchange) on
    // the FIRST render in a file and never removes it — so iterating `added` failed run alone.
    mine.forEach((entry) => {
      expect(
        removed.some(
          (gone) => gone.type === entry.type && gone.fn === entry.fn && gone.phase === entry.phase
        )
      ).toBe(true);
    });
  });

  it('a desktop mount that turns into a phone (rotate/resize) opens on a press', () => {
    let listener: ((event: { matches: boolean }) => void) | null = null;
    let phone = false;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: phone && query === PHONE_QUERY,
        media: query,
        addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => {
          if (query === PHONE_QUERY) listener = fn;
        },
        removeEventListener: () => {},
      }),
    });
    render(<MessageComposer {...props()} />);
    expect(phoneState()).toBeNull();
    phone = true;
    act(() => listener?.({ matches: true }));
    expect(phoneState()).toBe('rest');
    tap(editor());
    expect(phoneState()).toBe('open');
    tap(document.body);
    expect(phoneState()).toBe('rest');
  });
});

describe('every fold remounts the editor in its one-line form', () => {
  it('the second fold remounts it too', () => {
    setViewport(true);
    render(<MessageComposer {...props()} />);
    const first = editor();
    openIt();
    tap(document.body);
    expect(phoneState()).toBe('rest');
    const second = editor();
    expect(second).not.toBe(first);
    openIt();
    tap(document.body);
    expect(phoneState()).toBe('rest');
    expect(editor()).not.toBe(second);
  });
});
