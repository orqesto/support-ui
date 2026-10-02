/**
 * RelatedPopover shell: the sideways shift that keeps it inside a clipping panel (and its
 * re-measure on resize / ResizeObserver), the phone bottom-sheet path, focus on open, and the
 * Esc / outside-press close rules. Rendered directly, with the phone switch controllable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const phone = vi.hoisted(() => ({ value: false }));
vi.mock('../useIsPhone', () => ({ useIsPhone: () => phone.value }));

import { RelatedPopover, popoverShift } from '../RelatedPopover';

/** Geometry the stubbed getBoundingClientRect answers with. */
const geo = {
  popover: { left: 60, right: 700 },
  clip: null as null | { left: number; right: number },
};

let restoreRects: (() => void) | null = null;
let innerWidth = 0;

const stubRects = () => {
  const spy = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function rect(this: HTMLElement) {
      const box = (left: number, right: number) =>
        ({
          left,
          right,
          top: 0,
          bottom: 10,
          width: right - left,
          height: 10,
          x: left,
          y: 0,
        }) as DOMRect;
      if (this.getAttribute('role') === 'dialog') {
        // The browser draws the popover where its `left` style puts it.
        const offset = parseFloat(this.style.left || '0');
        return box(geo.popover.left + offset, geo.popover.right + offset);
      }
      if (this.dataset.testid === 'clip' && geo.clip) return box(geo.clip.left, geo.clip.right);
      return box(0, 2000);
    });
  restoreRects = () => spy.mockRestore();
};

beforeEach(() => {
  phone.value = false;
  geo.popover = { left: 60, right: 700 };
  geo.clip = null;
  innerWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 });
  stubRects();
});

afterEach(() => {
  restoreRects?.();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: innerWidth });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.querySelectorAll('[data-extra]').forEach((el) => el.remove());
});

const Pop = ({ onClose = () => {} }: { onClose?: () => void }) => (
  <RelatedPopover label="Tickets" onClose={onClose}>
    <button type="button">Inner</button>
  </RelatedPopover>
);

const dialog = () => screen.getByRole('dialog', { name: 'Tickets' });

describe('popoverShift — the gutters', () => {
  it('a right edge within 8px of the clip edge is pulled in to the gutter', () => {
    // 635 > 640 - 8: moved left by 3, to end 8px from the edge.
    expect(popoverShift({ left: 300, right: 635 }, { left: 0, right: 640 })).toBe(-3);
    // CONTROL: one that already ends at the gutter stays.
    expect(popoverShift({ left: 300, right: 632 }, { left: 0, right: 640 })).toBe(0);
  });

  it('a left edge inside the left gutter is pushed right to 8px', () => {
    expect(popoverShift({ left: 4, right: 200 }, { left: 0, right: 640 })).toBe(4);
    expect(popoverShift({ left: 8, right: 200 }, { left: 0, right: 640 })).toBe(0);
  });
});

describe('RelatedPopover — measured shift', () => {
  it('a clipping ancestor that starts right of 0 is the left bound', () => {
    geo.clip = { left: 300, right: 700 };
    geo.popover = { left: 290, right: 670 };
    render(
      <div data-testid="clip" style={{ overflowX: 'hidden' }}>
        <Pop />
      </div>
    );
    // 290 < 300 + 8: pushed right by 18 to sit inside the panel.
    expect(dialog().style.left).toBe('18px');
  });

  it('a re-measure on resize undoes the current shift before measuring (stable result)', () => {
    render(<Pop />);
    // 700 > 632 ⇒ -68, which would cut the left: clamped to 8 - 60 = -52.
    expect(dialog().style.left).toBe('-52px');
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(dialog().style.left).toBe('-52px');
  });

  it('a resize after the room changes moves it again', () => {
    render(<Pop />);
    expect(dialog().style.left).toBe('-52px');
    geo.popover = { left: 100, right: 300 };
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(dialog().style.left).toBe('');
  });

  it('desktop → phone: the bottom sheet drops the shift, and a later resize does not add it back', () => {
    const { rerender } = render(<Pop />);
    expect(dialog().style.left).toBe('-52px');
    phone.value = true;
    rerender(<Pop />);
    expect(dialog().style.left).toBe('');
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(dialog().style.left).toBe('');
  });

  it('on a phone from the start, a resize never shifts the sheet', () => {
    phone.value = true;
    render(<Pop />);
    expect(dialog().style.left).toBe('');
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(dialog().style.left).toBe('');
  });

  it('phone → desktop: measured, and resize re-measures from then on', () => {
    phone.value = true;
    const { rerender } = render(<Pop />);
    phone.value = false;
    rerender(<Pop />);
    expect(dialog().style.left).toBe('-52px');
    geo.popover = { left: 100, right: 300 };
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(dialog().style.left).toBe('');
  });

  it('closing removes its resize listener (the same function it added)', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Pop />);
    const added = add.mock.calls.find((call) => call[0] === 'resize');
    expect(added).toBeDefined();
    unmount();
    expect(remove).toHaveBeenCalledWith('resize', added![1]);
  });
});

describe('RelatedPopover — ResizeObserver', () => {
  type Observer = { cb: () => void; observed: Element[]; disconnects: number };
  let observers: Observer[];

  beforeEach(() => {
    observers = [];
    class FakeObserver {
      record: Observer;
      constructor(cb: () => void) {
        this.record = { cb, observed: [], disconnects: 0 };
        observers.push(this.record);
      }
      observe(el: Element) {
        this.record.observed.push(el);
      }
      unobserve() {}
      disconnect() {
        this.record.disconnects += 1;
      }
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
  });

  const renderInClip = () =>
    render(
      <div data-testid="clip" style={{ overflowX: 'hidden' }}>
        <div data-testid="plain">
          <Pop />
        </div>
      </div>
    );

  it('observes only the ancestors that clip it', () => {
    renderInClip();
    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toEqual([screen.getByTestId('clip')]);
  });

  it('a panel width change re-measures through the observer', () => {
    geo.clip = { left: 0, right: 2000 };
    geo.popover = { left: 100, right: 300 };
    renderInClip();
    expect(dialog().style.left).toBe('');
    geo.popover = { left: 100, right: 700 };
    act(() => {
      observers[0].cb();
    });
    // 700 > 640 - 8 (the window is the tighter bound) ⇒ -68.
    expect(dialog().style.left).toBe('-68px');
  });

  it('closing disconnects the observer', () => {
    const { unmount } = renderInClip();
    unmount();
    expect(observers[0].disconnects).toBe(1);
  });

  it('on a phone no observer is made', () => {
    phone.value = true;
    renderInClip();
    expect(observers).toHaveLength(0);
  });
});

describe('RelatedPopover — focus and dismissal', () => {
  it('takes focus on open without scrolling, and is not in the tab order', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    render(<Pop />);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(dialog());
    expect(dialog()).toHaveAttribute('tabindex', '-1');
  });

  it('Esc closes it', () => {
    const onClose = vi.fn();
    render(<Pop onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('another key does not close it', () => {
    const onClose = vi.fn();
    render(<Pop onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc while a modal picker is up belongs to the picker', () => {
    const onClose = vi.fn();
    render(<Pop onClose={onClose} />);
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('data-extra', '');
    document.body.appendChild(modal);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a press inside the popover does not close it; one outside does', () => {
    const onClose = vi.fn();
    render(<Pop onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inner' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a press on the chip or inside a modal picker is not "outside"', () => {
    const onClose = vi.fn();
    render(<Pop onClose={onClose} />);
    const chip = document.createElement('button');
    chip.setAttribute('data-related-chip', '');
    chip.setAttribute('data-extra', '');
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('data-extra', '');
    const inModal = document.createElement('span');
    modal.appendChild(inModal);
    document.body.append(chip, modal);
    fireEvent.mouseDown(chip);
    fireEvent.mouseDown(inModal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('after closing, an outside press calls nothing', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Pop onClose={onClose} />);
    unmount();
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a new onClose is the one Esc calls', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Pop onClose={first} />);
    rerender(<Pop onClose={second} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
