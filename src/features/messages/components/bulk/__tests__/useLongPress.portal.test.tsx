/**
 * A dialog a row renders (the presence "… anyway?" confirm) is portalled, but React bubbles its
 * events through the row. A slow touch on the dialog's button must neither select the row behind
 * it nor swallow the button's click.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { LONG_PRESS_MS, useLongPress } from '../useLongPress';

// jsdom has no PointerEvent (see InboxSelectMode.test.tsx): a minimal stand-in.
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
afterEach(() => vi.useRealTimers());

const Row = ({ onLongPress, onConfirm }: { onLongPress: () => void; onConfirm: () => void }) => {
  const handlers = useLongPress(onLongPress);
  return (
    <div data-testid="row" {...handlers}>
      row
      {createPortal(
        // eslint-disable-next-line no-restricted-syntax -- a bare stand-in for the dialog's Button
        <button type="button" onClick={onConfirm}>
          Assign anyway
        </button>,
        document.body
      )}
    </div>
  );
};

const holdAndTap = (target: Element) => {
  fireEvent.pointerDown(target, { pointerType: 'touch', isPrimary: true, clientX: 5, clientY: 5 });
  act(() => {
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
  });
  fireEvent.pointerUp(target, { pointerType: 'touch' });
  fireEvent.click(target);
};

describe('useLongPress — events from a portal the row renders', () => {
  it('a slow touch on the dialog button does not select the row, and the confirm runs', () => {
    const onLongPress = vi.fn();
    const onConfirm = vi.fn();
    render(<Row onLongPress={onLongPress} onConfirm={onConfirm} />);
    holdAndTap(screen.getByRole('button', { name: 'Assign anyway' }));
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: the same hold on the row itself still selects it', () => {
    const onLongPress = vi.fn();
    render(<Row onLongPress={onLongPress} onConfirm={vi.fn()} />);
    holdAndTap(screen.getByTestId('row'));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
