/**
 * Inbox select mode (owner, 2026-09-28), on BOTH surfaces — the list row and the Kanban card:
 *  - the box is hidden until hover / keyboard focus, but stays in the DOM and the tab order;
 *  - once anything is selected every box shows;
 *  - the row's reserved space does not change, so nothing shifts;
 *  - a shift-click asks for a RANGE;
 *  - a touch long-press selects without opening, a tap still opens, a move cancels;
 *  - keys other than Enter/Space on the box reach the page (for `x` / Esc).
 *
 * jsdom applies no Tailwind, so "hidden" is asserted through the classes that hide it, and
 * "reachable" through focus — a class test can only check the instruction; the browser check
 * of the result is separate (gates S2–S4, S10).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import type { MessageThread } from '@/services/message.service';
import { KanbanCard } from '../KanbanCard';
import { MessageListItem } from '../MessageListItem';
import { LONG_PRESS_MS } from '../bulk/useLongPress';

vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const thread = (over: Record<string, unknown> = {}): MessageThread =>
  ({
    threadId: 'conv_361',
    publicId: 'COR-SUP-361',
    sender: 'customer@example.com',
    subject: 'Where is my order?',
    status: 'in_progress',
    priority: 'medium',
    lastMessageAt: new Date().toISOString(),
    latestMessage: {
      id: 361,
      conversationId: 361,
      type: 'inbound',
      content: 'any update?',
      channel: 'email',
      createdAt: new Date().toISOString(),
      metadata: {},
    },
    ...over,
  }) as unknown as MessageThread;

const spamLog = () =>
  thread({
    threadId: 'spamlog_44',
    latestMessage: {
      id: -44,
      conversationId: -44,
      type: 'inbound',
      content: 'blocked by a rule',
      channel: 'email',
      createdAt: new Date().toISOString(),
      metadata: {},
    },
  });

type RowProps = {
  thread: MessageThread;
  onOpen: (thread: MessageThread) => void;
  selected?: boolean;
  onToggleSelected?: (conversationId: number, options?: { range: true }) => void;
  selectMode?: boolean;
};

const SURFACES: [string, ComponentType<RowProps>][] = [
  ['list row', MessageListItem as ComponentType<RowProps>],
  ['Kanban card', KanbanCard as ComponentType<RowProps>],
];

/** The box's positioned wrapper — the element whose classes hide and reveal it. */
const boxWrapper = () =>
  screen.getByRole('checkbox', { name: /select message/i }).closest('[class*="absolute"]')!;
/** The row / card root: the element carrying the id `x` reads. */
const rowRoot = (container: HTMLElement) =>
  container.querySelector('[data-select-id]') as HTMLElement;

describe.each(SURFACES)('%s — select mode', (_name, Row) => {
  describe('visibility (S1–S4)', () => {
    it('S1: nothing selected ⇒ box in the DOM, visually hidden, still keyboard-reachable', async () => {
      render(<Row thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} />);
      const box = screen.getByRole('checkbox', { name: /select message/i });
      expect(boxWrapper().className).toContain('opacity-0');
      // Never removed from layout or from assistive tech.
      expect(boxWrapper().className).not.toMatch(/(^|\s)(hidden|sr-only|invisible)(\s|$)/);
      expect(box.closest('[aria-hidden="true"]')).toBeNull();
      // Tab reaches it: row first (it is itself focusable), then its box.
      const user = userEvent.setup();
      await user.tab();
      await user.tab();
      expect(box).toHaveFocus();
    });

    it('S2: the hidden box is revealed by hover or focus-within of its own row', () => {
      const { container } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} />
      );
      expect(rowRoot(container).className).toContain('group/select');
      expect(boxWrapper().className).toContain('group-hover/select:opacity-100');
      expect(boxWrapper().className).toContain('group-focus-within/select:opacity-100');
      // A tap on an invisible box must fall through to the row (touch has no hover).
      expect(boxWrapper().className).toContain('pointer-events-none');
    });

    it('S7: a selectable row blocks iOS text selection + callout on touch screens only', () => {
      const { container } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} />
      );
      const classes = rowRoot(container).className;
      // Scoped to coarse pointers: a mouse user can still select and copy the row's text.
      expect(classes).toContain('[@media(pointer:coarse)]:select-none');
      expect(classes).toContain('[@media(pointer:coarse)]:[-webkit-touch-callout:none]');
      expect(classes).not.toMatch(/(^|\s)select-none(\s|$)/);
    });

    it('S7 control: a row that cannot be selected keeps normal text selection', () => {
      const { container } = render(<Row thread={thread()} onOpen={vi.fn()} />);
      expect(container.innerHTML).not.toContain('pointer:coarse');
    });

    it('S3: select mode shows every box; a selected row shows its own even outside it', () => {
      const { rerender } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} selectMode />
      );
      expect(boxWrapper().className).toContain('opacity-100');
      expect(boxWrapper().className).not.toContain('opacity-0');
      expect(boxWrapper().className).not.toContain('pointer-events-none');

      rerender(<Row thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} selected />);
      expect(boxWrapper().className).not.toContain('opacity-0');

      // Selection emptied ⇒ hidden again.
      rerender(<Row thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} />);
      expect(boxWrapper().className).toContain('opacity-0');
    });

    it('S4: entering select mode changes no layout class on the row', () => {
      const classesOf = (container: HTMLElement) =>
        [...container.querySelectorAll('*')]
          .filter((node) => !node.closest('[class*="absolute"][class*="z-20"]'))
          .map((node) => node.getAttribute('class') ?? '')
          .join('\n');
      const off = render(<Row thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} />);
      const before = classesOf(off.container);
      off.unmount();
      const on = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} selectMode />
      );
      expect(classesOf(on.container)).toBe(before);
    });
  });

  describe('clicks and keys (S5, S6)', () => {
    it('S5: a shift-click on the box asks for a RANGE; a plain click does not', async () => {
      const onToggle = vi.fn();
      const onOpen = vi.fn();
      render(<Row thread={thread()} onOpen={onOpen} onToggleSelected={onToggle} selectMode />);
      const user = userEvent.setup();
      const box = screen.getByRole('checkbox', { name: /select message/i });

      await user.click(box);
      expect(onToggle).toHaveBeenLastCalledWith(361);

      await user.keyboard('{Shift>}');
      await user.click(box);
      await user.keyboard('{/Shift}');
      expect(onToggle).toHaveBeenLastCalledWith(361, { range: true });
      expect(onToggle).toHaveBeenCalledTimes(2);
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('S6: x pressed on the focused box reaches the page; Enter/Space still do not open', () => {
      const onOpen = vi.fn();
      const heard = vi.fn();
      window.addEventListener('keydown', heard);
      try {
        render(<Row thread={thread()} onOpen={onOpen} onToggleSelected={vi.fn()} />);
        const box = screen.getByRole('checkbox', { name: /select message/i });
        fireEvent.keyDown(box, { key: 'x' });
        expect(heard).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(box, { key: 'Enter' });
        fireEvent.keyDown(box, { key: ' ' });
        expect(onOpen).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('keydown', heard);
      }
    });

    it('carries the conversation id `x` needs, and no id on a spam-log row', () => {
      const { container, unmount } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} />
      );
      expect(rowRoot(container).getAttribute('data-select-id')).toBe('361');
      unmount();
      const blocked = render(
        <Row thread={spamLog()} onOpen={vi.fn()} onToggleSelected={vi.fn()} />
      );
      expect(blocked.container.querySelector('[data-select-id]')).toBeNull();
    });
  });

  describe('touch long-press (S7)', () => {
    // ⛔ jsdom has NO PointerEvent: `fireEvent.pointerDown(el, { pointerType: 'touch' })` then
    // builds a bare Event and DROPS pointerType / isPrimary / clientX, so every press looks like
    // "not touch" — and each negative test below would pass without testing anything. A minimal
    // stand-in, for this block only.
    const original = window.PointerEvent;
    beforeAll(() => {
      class TestPointerEvent extends MouseEvent {
        pointerType: string;
        isPrimary: boolean;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerType = init.pointerType ?? '';
          this.isPrimary = init.isPrimary ?? false;
        }
      }
      window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
    });
    afterAll(() => {
      window.PointerEvent = original;
    });
    beforeEach(() => vi.useFakeTimers());

    const press = (target: Element, extra: Record<string, unknown> = {}) =>
      fireEvent.pointerDown(target, {
        pointerType: 'touch',
        isPrimary: true,
        clientX: 100,
        clientY: 100,
        ...extra,
      });

    it('a ~450 ms hold selects the row and the click that follows does NOT open it', () => {
      const onToggle = vi.fn();
      const onOpen = vi.fn();
      const { container } = render(
        <Row thread={thread()} onOpen={onOpen} onToggleSelected={onToggle} />
      );
      const root = rowRoot(container);
      press(root);
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS - 1);
      });
      expect(onToggle).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onToggle).toHaveBeenCalledWith(361);

      fireEvent.pointerUp(root, { pointerType: 'touch' });
      fireEvent.click(root);
      expect(onOpen).not.toHaveBeenCalled();

      // …and only THAT click: the next ordinary tap opens again.
      press(root);
      fireEvent.pointerUp(root, { pointerType: 'touch' });
      fireEvent.click(root);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('a long-press ON the visible box selects once — its click does not untick it again', () => {
      // In select mode the box is on screen, so a thumb can land on it. React fires a checkbox's
      // onChange as a SEPARATE synthetic event from the same native click, in the bubble phase;
      // only because the capture-phase stopPropagation also stops the NATIVE event does that
      // change never run. Without it: selected by the press, unticked by its click.
      const onToggle = vi.fn();
      const onOpen = vi.fn();
      render(<Row thread={thread()} onOpen={onOpen} onToggleSelected={onToggle} selectMode />);
      const box = screen.getByRole('checkbox', { name: /select message/i });
      press(box);
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      fireEvent.pointerUp(box, { pointerType: 'touch' });
      fireEvent.click(box);
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(361);
      expect(onOpen).not.toHaveBeenCalled();
      // …and the swallowed click must not flip the box in the DOM behind React's back: this
      // mock never re-renders it as selected, so it must still read unticked.
      expect(box).not.toBeChecked();
    });

    it('a long-press that produced NO click does not swallow the next tap', () => {
      const onOpen = vi.fn();
      const { container } = render(
        <Row thread={thread()} onOpen={onOpen} onToggleSelected={vi.fn()} />
      );
      const root = rowRoot(container);
      press(root);
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      // The finger slid off / the OS ate the click: no click event follows this press.
      fireEvent.pointerCancel(root, { pointerType: 'touch' });

      press(root);
      fireEvent.pointerUp(root, { pointerType: 'touch' });
      fireEvent.click(root);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('the OS long-press menu is held back while pressing and after firing — not for a mouse', () => {
      const { container } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} />
      );
      const root = rowRoot(container);
      // A right-click with no touch press in progress keeps its menu.
      expect(fireEvent.contextMenu(root)).toBe(true);

      press(root);
      expect(fireEvent.contextMenu(root)).toBe(false);
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(fireEvent.contextMenu(root)).toBe(false);
    });

    it('a normal tap opens the thread and selects nothing', () => {
      const onToggle = vi.fn();
      const onOpen = vi.fn();
      const { container } = render(
        <Row thread={thread()} onOpen={onOpen} onToggleSelected={onToggle} />
      );
      const root = rowRoot(container);
      press(root);
      act(() => {
        vi.advanceTimersByTime(120);
      });
      fireEvent.pointerUp(root, { pointerType: 'touch' });
      fireEvent.click(root);
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('moving more than ~10 px (a scroll gesture) cancels it', () => {
      const onToggle = vi.fn();
      const { container } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={onToggle} />
      );
      const root = rowRoot(container);
      press(root);
      fireEvent.pointerMove(root, { pointerType: 'touch', clientX: 100, clientY: 115 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      });
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('a jitter within ~10 px does NOT cancel it', () => {
      const onToggle = vi.fn();
      const { container } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={onToggle} />
      );
      const root = rowRoot(container);
      press(root);
      fireEvent.pointerMove(root, { pointerType: 'touch', clientX: 104, clientY: 105 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('a scroll (of the list or a column) cancels it', () => {
      const onToggle = vi.fn();
      const { container } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={onToggle} />
      );
      press(rowRoot(container));
      fireEvent.scroll(document.body);
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      });
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('the browser taking the gesture over (pointercancel) cancels it', () => {
      const onToggle = vi.fn();
      const { container } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={onToggle} />
      );
      const root = rowRoot(container);
      press(root);
      fireEvent.pointerCancel(root, { pointerType: 'touch' });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      });
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('a MOUSE held down is not a long-press', () => {
      const onToggle = vi.fn();
      const { container } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={onToggle} />
      );
      press(rowRoot(container), { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      });
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('long-pressing an already-selected row does not UNselect it', () => {
      const onToggle = vi.fn();
      const { container } = render(
        <Row thread={thread()} onOpen={vi.fn()} onToggleSelected={onToggle} selected selectMode />
      );
      press(rowRoot(container));
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('a spam-log row cannot be long-pressed into a selection', () => {
      const onToggle = vi.fn();
      const onOpen = vi.fn();
      render(<Row thread={spamLog()} onOpen={onOpen} onToggleSelected={onToggle} />);
      const root = screen.getAllByRole('button')[0];
      press(root);
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      });
      fireEvent.pointerUp(root, { pointerType: 'touch' });
      fireEvent.click(root);
      expect(onToggle).not.toHaveBeenCalled();
      expect(onOpen).toHaveBeenCalledTimes(1);
    });
  });
});
