/**
 * Mutation kills — useHeaderFocusReturn (driven directly, so each listener and guard is seen on
 * its own) and useThreadTicketsState's older-backend state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useHeaderFocusReturn, type FocusReturnTarget } from '../useHeaderFocusReturn';
import { useThreadTicketsState } from '../useThreadTicketsState';

const tooltip = vi.hoisted(() => ({
  focusWithoutTooltip: vi.fn((el: HTMLElement) => el.focus({ preventScroll: true })),
}));
vi.mock('@/components/ui/Tooltip', () => ({ focusWithoutTooltip: tooltip.focusWithoutTooltip }));

const svc = vi.hoisted(() => ({
  ticketsOfThread: vi.fn(),
  getLinkedTicket: vi.fn(),
  listMerges: vi.fn(),
}));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { ticketsOfThread: svc.ticketsOfThread },
}));
vi.mock('@/services/message.service', () => ({
  messageService: { getLinkedTicket: svc.getLinkedTicket },
}));
vi.mock('@/services/conversationMerge.service', () => ({
  conversationMergeService: { listMerges: svc.listMerges },
}));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

type Api = ReturnType<typeof useHeaderFocusReturn>;
const box: { api: Api | null } = { api: null };

const Harness = ({ addOpen = false, mergeOpen = false }) => {
  const api = useHeaderFocusReturn({ addToTicketOpen: addOpen, mergePickerOpen: mergeOpen });
  box.api = api;
  return (
    <div>
      <button type="button" ref={api.ticketChipRef}>
        tickets
      </button>
      <button type="button" ref={api.mergedChipRef}>
        merged
      </button>
      <button type="button" ref={api.moreButtonRef}>
        more
      </button>
    </div>
  );
};

const byText = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((el) => el.textContent === text)!;
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 15)));
const ask = (target: FocusReturnTarget) => {
  act(() => box.api!.setFocusReturn(target));
};

/** A press or key on an element whose own handler stops propagation before the document. */
const stoppedEvent = (type: 'pointerdown' | 'mousedown' | 'keydown') => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  el.addEventListener(type, (event) => event.stopPropagation());
  const event =
    type === 'keydown'
      ? new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      : new MouseEvent(type, { bubbles: true });
  el.dispatchEvent(event);
  el.remove();
};

beforeEach(() => {
  vi.clearAllMocks();
  (document.activeElement as HTMLElement | null)?.blur?.();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('useHeaderFocusReturn — how the last interaction began', () => {
  it('a pointerdown alone (no compat mousedown) reads as a press', async () => {
    render(<Harness />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    ask('more');
    await settle();
    expect(document.activeElement).toBe(byText('more'));
    expect(tooltip.focusWithoutTooltip).toHaveBeenCalledTimes(1);
  });

  it('a pointerdown whose handler stops propagation is still seen (capture phase)', async () => {
    render(<Harness />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    stoppedEvent('pointerdown');
    ask('more');
    await settle();
    expect(tooltip.focusWithoutTooltip).toHaveBeenCalledTimes(1);
  });

  it('a mousedown alone reads as a press', async () => {
    render(<Harness />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    ask('more');
    await settle();
    expect(tooltip.focusWithoutTooltip).toHaveBeenCalledTimes(1);
  });

  it('a mousedown whose handler stops propagation is still seen (capture phase)', async () => {
    render(<Harness />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    stoppedEvent('mousedown');
    ask('more');
    await settle();
    expect(tooltip.focusWithoutTooltip).toHaveBeenCalledTimes(1);
  });

  it('a key whose handler stops propagation is still seen: plain focus, without page scroll', async () => {
    render(<Harness />);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    stoppedEvent('keydown');
    const more = byText('more');
    const focusSpy = vi.spyOn(more, 'focus');
    ask('more');
    await settle();
    expect(tooltip.focusWithoutTooltip).not.toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(more);
  });

  it('unmount removes exactly the three capture listeners it added', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<Harness />);
    const added = (type: string) => add.mock.calls.find((call) => call[0] === type)!;
    for (const type of ['pointerdown', 'mousedown', 'keydown']) {
      expect(added(type)[2]).toBe(true);
    }
    unmount();
    for (const type of ['pointerdown', 'mousedown', 'keydown']) {
      const fn = added(type)[1];
      expect(remove).toHaveBeenCalledWith(type, fn, true);
    }
    add.mockRestore();
    remove.mockRestore();
  });
});

describe('useHeaderFocusReturn — where focus goes', () => {
  it('a More return lands on More even when a Merged chip is on screen', async () => {
    render(<Harness />);
    ask('more');
    await settle();
    expect(document.activeElement).toBe(byText('more'));
  });

  it('CONTROL: a merges return lands on the Merged chip', async () => {
    render(<Harness />);
    ask('merges');
    await settle();
    expect(document.activeElement).toBe(byText('merged'));
  });

  it('a host modal nested below <body> closing still hands focus back (subtree observer)', async () => {
    render(<Harness />);
    const wrapper = document.createElement('div');
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    wrapper.appendChild(modal);
    document.body.appendChild(wrapper);
    ask('more');
    await settle();
    expect(document.activeElement).toBe(document.body);
    act(() => modal.remove());
    await waitFor(() => expect(document.activeElement).toBe(byText('more')));
    wrapper.remove();
  });

  it('a picker opening between the modal closing and the settle tick cancels the return', async () => {
    const { rerender } = render(<Harness />);
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    ask('more');
    await settle();
    modal.remove();
    // The observer's callback (a microtask) schedules the settle timer…
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
    // …and before it runs, a picker opens: the pending return must not fire.
    act(() => rerender(<Harness addOpen />));
    await settle();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('useThreadTicketsState — an older backend with no linked ticket', () => {
  it('lists no rows (ticket count 0, no chip)', async () => {
    svc.ticketsOfThread.mockResolvedValue({ unavailable: true, rows: [], hiddenCount: 0 });
    svc.getLinkedTicket.mockResolvedValue({ success: true, data: null });
    svc.listMerges.mockResolvedValue([]);
    const onThreadChange = vi.fn();
    const { result } = renderHook(() => useThreadTicketsState({ messageId: 1, onThreadChange }));
    await waitFor(() => expect(result.current.tickets.state).toBe('unavailable'));
    expect(result.current.tickets.rows).toEqual([]);
    expect(result.current.tickets.legacy).toBeNull();
    expect(result.current.ticketIds).toEqual([]);
  });
});
