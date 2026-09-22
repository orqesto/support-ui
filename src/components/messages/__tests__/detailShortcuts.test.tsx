/**
 * Message detail single-key shortcuts (v3). The guards are the feature: a letter that fires
 * while someone types "Regards" into the composer is worse than no shortcut at all.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import {
  neighbourThread,
  shortcutHint,
  shortcutFor,
  useDetailShortcuts,
  type ShortcutContext,
} from '../detailShortcuts';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const all: ShortcutContext = { canResolve: true, canNavigate: true, canClose: true };
const key = (keyName: string, over: Partial<KeyboardEvent> = {}) =>
  ({
    key: keyName,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
    target: document.body,
    ...over,
  }) as KeyboardEvent;

describe('shortcutFor — which key does what', () => {
  it.each([
    ['r', 'reply'],
    ['R', 'reply'],
    ['n', 'note'],
    ['e', 'resolve'],
    ['j', 'next'],
    ['k', 'prev'],
    ['Escape', 'close'],
  ])('%s → %s', (keyName, action) => {
    expect(shortcutFor(key(keyName), all)).toBe(action);
  });

  it('ignores every other key', () => {
    expect(shortcutFor(key('x'), all)).toBeNull();
    expect(shortcutFor(key('Enter'), all)).toBeNull();
  });
});

describe('shortcutFor — nothing fires where it would be wrong', () => {
  it.each([
    ['an input', '<input id="t" />'],
    ['a textarea', '<textarea id="t"></textarea>'],
    ['a select', '<select id="t"><option>a</option></select>'],
    ['the rich-text composer (contenteditable)', '<div id="t" contenteditable="true"></div>'],
    [
      'a child of the rich-text composer',
      '<div contenteditable="true"><p id="t">Regards</p></div>',
    ],
  ])('typing in %s', (_label, html) => {
    document.body.innerHTML = html;
    const target = document.getElementById('t');
    for (const keyName of ['r', 'n', 'e', 'j', 'k']) {
      expect(shortcutFor(key(keyName, { target }), all)).toBeNull();
    }
  });

  it('CONTROL: an element that is contenteditable="false" does not count as typing', () => {
    document.body.innerHTML = '<div contenteditable="false"><span id="t">x</span></div>';
    expect(shortcutFor(key('r', { target: document.getElementById('t') }), all)).toBe('reply');
  });

  it.each([['ctrlKey'], ['metaKey'], ['altKey']])(
    'with %s held (browser / OS shortcuts)',
    (mod) => {
      expect(shortcutFor(key('r', { [mod]: true }), all)).toBeNull();
    }
  );

  it('during IME composition', () => {
    expect(shortcutFor(key('n', { isComposing: true }), all)).toBeNull();
  });

  it('when something else already handled the key', () => {
    expect(shortcutFor(key('e', { defaultPrevented: true }), all)).toBeNull();
  });

  it('⛔ while a dialog is open — its own Escape must not also close the rail behind it', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true">Resolve without saving?</div>';
    expect(shortcutFor(key('Escape'), all)).toBeNull();
    expect(shortcutFor(key('e'), all)).toBeNull();
  });

  it('E only when there is a decision to make', () => {
    expect(shortcutFor(key('e'), { ...all, canResolve: false })).toBeNull();
  });

  it('J/K only where a list exists to move through', () => {
    expect(shortcutFor(key('j'), { ...all, canNavigate: false })).toBeNull();
    expect(shortcutFor(key('k'), { ...all, canNavigate: false })).toBeNull();
  });

  it('Esc only on a surface that can close', () => {
    expect(shortcutFor(key('Escape'), { ...all, canClose: false })).toBeNull();
  });
});

function Harness({ handlers }: { handlers: Parameters<typeof useDetailShortcuts>[1] }) {
  useDetailShortcuts(all, handlers);
  return (
    <div>
      <textarea data-testid="composer" />
    </div>
  );
}

describe('useDetailShortcuts — bound to the document', () => {
  it('runs the handler and claims the key', () => {
    const resolve = vi.fn();
    render(<Harness handlers={{ resolve }} />);
    const event = new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not fire from the composer', () => {
    const reply = vi.fn();
    const { getByTestId } = render(<Harness handlers={{ reply }} />);
    fireEvent.keyDown(getByTestId('composer'), { key: 'r' });
    expect(reply).not.toHaveBeenCalled();
  });

  it('leaves a key it has no handler for alone', () => {
    render(<Harness handlers={{}} />);
    const event = new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('neighbourThread — where J/K lands', () => {
  const rows = [{ threadId: 'a' }, { threadId: 'spamlog_9' }, { threadId: 'b' }, { threadId: 'c' }];

  it('moves to the next and previous row', () => {
    expect(neighbourThread(rows, 'b', 'next')?.threadId).toBe('c');
    expect(neighbourThread(rows, 'b', 'prev')?.threadId).toBe('a');
  });

  it('skips spam-log rows — they open a preview, not the detail', () => {
    expect(neighbourThread(rows, 'a', 'next')?.threadId).toBe('b');
  });

  it('does nothing at either end rather than wrapping round', () => {
    expect(neighbourThread(rows, 'c', 'next')).toBeNull();
    expect(neighbourThread(rows, 'a', 'prev')).toBeNull();
  });

  it('does nothing when the open conversation is not in the list (filtered out, next page)', () => {
    expect(neighbourThread(rows, 'zzz', 'next')).toBeNull();
    expect(neighbourThread(rows, null, 'next')).toBeNull();
  });
});

describe('shortcutHint — the hint names only keys that act here', () => {
  it('lists every key in the slide-over over a list with a decision to make', () => {
    expect(shortcutHint(all)).toBe('R reply · N note · E resolve · J/K next');
  });

  it('⛔ never promises J/K where there is no list (the full page)', () => {
    expect(shortcutHint({ ...all, canNavigate: false })).toBe('R reply · N note · E resolve');
  });

  it('⛔ never promises E on a conversation with no decision to make', () => {
    expect(shortcutHint({ ...all, canResolve: false })).not.toMatch(/E resolve/);
  });
});
