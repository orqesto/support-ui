/**
 * A transient progress readout must not land on the page's primary action.
 *
 * The widget defaulted to `yPos: 16` — a 320px panel across the top-right of whatever page
 * was open. On Messages that is exactly where Compose sits, so a sync that found nothing
 * covered the button until the agent dragged or dismissed it.
 *
 * ⛔ The default was only half of it. The position was persisted by an effect that runs on
 * MOUNT, so the bad value was written to storage the first time anyone loaded the page —
 * changing the default alone would have fixed nobody. These tests pin BOTH halves.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MessageProcessingProgress } from '../MessageProcessingProgress';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ configured: true }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const SESSION = {
  sessionKey: 'src-7',
  integrationName: 'Mailbox',
  status: 'completed',
  total: 0,
  processed: 0,
  failed: 0,
  skipped: 0,
  startedAt: new Date().toISOString(),
} as never;

const KEY = 'emailProcessingWidget_src-7_position_v2';

beforeEach(() => {
  localStorage.clear();
  window.innerWidth = 1440;
  window.innerHeight = 900;
});
afterEach(cleanup);

const positionOf = (container: HTMLElement) => {
  const panel = container.querySelector('div[style*="left"]') as HTMLElement;
  return { top: panel.style.top, left: panel.style.left };
};

describe('where the progress widget opens', () => {
  it('sits at the BOTTOM of the viewport, clear of the page header', () => {
    const { container } = render(
      <MessageProcessingProgress session={SESSION} index={0} onClose={vi.fn()} />
    );

    const { top } = positionOf(container);
    // 900 - 200 - 16 = 684. The precise number matters less than the property: it is in
    // the lower half, not the 16px band where every page puts its actions.
    expect(Number.parseInt(top, 10)).toBeGreaterThan(450);
  });

  it('does not write a position the agent never chose', () => {
    // THE HALF THAT MADE THE OLD DEFAULT STICKY. Mounting must leave storage untouched.
    render(<MessageProcessingProgress session={SESSION} index={0} onClose={vi.fn()} />);

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('honours a position that WAS chosen', () => {
    // CONTROL: the fix must not throw away a deliberate drag.
    localStorage.setItem(KEY, JSON.stringify({ xPos: 120, yPos: 240 }));

    const { container } = render(
      <MessageProcessingProgress session={SESSION} index={0} onClose={vi.fn()} />
    );

    expect(positionOf(container)).toEqual({ top: '240px', left: '120px' });
  });

  it('ignores the pre-fix key, which holds values nobody picked', () => {
    localStorage.setItem(
      'emailProcessingWidget_src-7_position',
      JSON.stringify({ xPos: 1104, yPos: 16 })
    );

    const { container } = render(
      <MessageProcessingProgress session={SESSION} index={0} onClose={vi.fn()} />
    );

    expect(positionOf(container).top).not.toBe('16px');
  });
});
