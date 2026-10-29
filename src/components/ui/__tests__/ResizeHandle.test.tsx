import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResizeHandle } from '../ResizeHandle';

// jsdom has no PointerEvent: without it fireEvent.pointer* drops clientY and button, and a drag
// test would pass or fail on undefined. A MouseEvent carries both; pointerId is all it adds.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: typeof PointerEventStub }).PointerEvent = PointerEventStub;
}

const setup = (over: Partial<React.ComponentProps<typeof ResizeHandle>> = {}) => {
  const props = {
    value: 100,
    min: 44,
    max: 300,
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onReset: vi.fn(),
    ariaLabel: 'Resize the reply box',
    ...over,
  };
  render(<ResizeHandle {...props} />);
  return { props, bar: screen.getByRole('separator', { name: 'Resize the reply box' }) };
};

describe('ResizeHandle', () => {
  it('is a focusable separator that announces its size and range', () => {
    const { bar } = setup();
    expect(bar).toHaveAttribute('tabindex', '0');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuemin', '44');
    expect(bar).toHaveAttribute('aria-valuemax', '300');
  });

  it('grows up: dragging the bar UP makes it taller, down shorter, and the end is committed', () => {
    const { props, bar } = setup();
    fireEvent.pointerDown(bar, { button: 0, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientY: 440, pointerId: 1 });
    expect(props.onChange).toHaveBeenLastCalledWith(160);
    fireEvent.pointerMove(bar, { clientY: 530, pointerId: 1 });
    expect(props.onChange).toHaveBeenLastCalledWith(70);
    fireEvent.pointerUp(bar, { clientY: 530, pointerId: 1 });
    expect(props.onCommit).toHaveBeenCalledWith(70);
  });

  it('clamps to [min, max] while dragging', () => {
    const { props, bar } = setup();
    fireEvent.pointerDown(bar, { button: 0, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientY: -2000, pointerId: 1 });
    expect(props.onChange).toHaveBeenLastCalledWith(300);
    fireEvent.pointerMove(bar, { clientY: 5000, pointerId: 1 });
    expect(props.onChange).toHaveBeenLastCalledWith(44);
  });

  it('CONTROL: moving the pointer without pressing changes nothing', () => {
    const { props, bar } = setup();
    fireEvent.pointerMove(bar, { clientY: 100, pointerId: 1 });
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('keyboard: ArrowUp grows, ArrowDown shrinks, by the step, each committed; Home resets', () => {
    const { props, bar } = setup({ step: 24 });
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect(props.onChange).toHaveBeenLastCalledWith(124);
    expect(props.onCommit).toHaveBeenLastCalledWith(124);
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    expect(props.onChange).toHaveBeenLastCalledWith(76);
    fireEvent.keyDown(bar, { key: 'Home' });
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it('double-click resets to the default', () => {
    const { props, bar } = setup();
    fireEvent.doubleClick(bar);
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });
});
