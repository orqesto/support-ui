/**
 * Tooltip edge clamp (top/bottom): a tip that would spill past a viewport edge is shifted to sit
 * flush against the 4 px margin. The clamp must CONVERGE — jsdom lays everything out at 0×0, so a
 * clamp that re-measures the box and nudges again every render looped until React's
 * "Maximum update depth exceeded" (the md4.header.merges flake, audit pass 10).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));

const box = (left: number, width: number, top = 100, height = 20) =>
  ({
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

/*
  A browser-like layout: the trigger sits where the test puts it, and the tip's box follows its own
  inline `left` with the `translate(-50%, …)` applied — so a clamp that measures where the tip is
  sees it move, exactly as a real browser would show it.
*/
const layout = (triggerLeft: number, triggerWidth: number, tipWidth: number) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.getAttribute('role') === 'tooltip') {
      const anchor = parseFloat(this.style.left);
      return box(anchor - tipWidth / 2, tipWidth, 126);
    }
    if (this.getAttribute('role') === 'presentation') return box(triggerLeft, triggerWidth);
    return box(0, 0);
  });

const open = async (side: 'top' | 'bottom' | 'left') => {
  render(
    <Tooltip content="More actions" side={side} delayDuration={0}>
      <Button>More</Button>
    </Tooltip>
  );
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'More' }).parentElement as HTMLElement);
  await settle();
  return screen.getByRole('tooltip');
};

describe('Tooltip edge clamp', () => {
  it('jsdom 0×0 layout: an open bottom tooltip settles (no update loop) at the left margin', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tip = await open('bottom');
    expect(tip).toHaveTextContent('More actions');
    expect(tip.style.left).toBe('4px');
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Maximum update depth/);
  });

  it('jsdom 0×0 layout: a top tooltip settles too', async () => {
    const tip = await open('top');
    expect(tip.style.left).toBe('4px');
  });

  it('spilling past the LEFT edge: shifted right so its left edge sits at 4 px', async () => {
    layout(2, 10, 40); // anchor 7, tip would span -13…27
    const tip = await open('bottom');
    expect(tip.style.left).toBe('24px'); // spans 4…44
  });

  it('spilling past the RIGHT edge: shifted left so its right edge sits at innerWidth - 4', async () => {
    layout(window.innerWidth - 14, 10, 40); // anchor innerWidth - 9, right edge innerWidth + 11
    const tip = await open('top');
    expect(tip.style.left).toBe(`${window.innerWidth - 24}px`); // right edge innerWidth - 4
  });

  it('CONTROL: room on both sides — not shifted', async () => {
    layout(500, 10, 40);
    const tip = await open('bottom');
    expect(tip.style.left).toBe('505px');
  });

  it('CONTROL: side="left" is never horizontally clamped', async () => {
    layout(2, 10, 40);
    const tip = await open('left');
    expect(tip.style.left).toBe('-4px'); // trigger left 2 - 6 px gap
  });
});
