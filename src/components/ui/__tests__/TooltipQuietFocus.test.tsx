/**
 * Tooltip `quietFocus` (opt-in): a focus handed BACK after a mouse press (`focusWithoutTooltip`)
 * does not open the tooltip. Every other focus, and every tooltip without the prop, unchanged.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { Button } from '@/components/ui/Button';
import { Tooltip, focusWithoutTooltip } from '@/components/ui/Tooltip';

afterEach(cleanup);

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));

const renderTip = (quietFocus?: boolean) =>
  render(
    // side="left": jsdom has no layout, and the top/bottom edge clamp never converges at 0×0.
    <Tooltip content="Ticket #7" side="left" delayDuration={0} quietFocus={quietFocus}>
      <Button>chip</Button>
    </Tooltip>
  );

describe('Tooltip quietFocus', () => {
  it('a quiet focus on a quietFocus tooltip: focused, no tooltip', async () => {
    renderTip(true);
    const chip = screen.getByRole('button', { name: 'chip' });
    act(() => focusWithoutTooltip(chip));
    await settle();
    expect(document.activeElement).toBe(chip);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('the NEXT ordinary focus still opens it (the quiet mark does not linger)', async () => {
    renderTip(true);
    const chip = screen.getByRole('button', { name: 'chip' });
    act(() => focusWithoutTooltip(chip));
    act(() => chip.blur());
    act(() => chip.focus());
    await settle();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ticket #7');
  });

  it('CONTROL: without the prop, even a quiet focus opens it (default unchanged)', async () => {
    renderTip();
    const chip = screen.getByRole('button', { name: 'chip' });
    act(() => focusWithoutTooltip(chip));
    await settle();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ticket #7');
  });
});
