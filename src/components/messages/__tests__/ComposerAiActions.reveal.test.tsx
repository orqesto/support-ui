/**
 * L2 P4 — the note box has to be ON SCREEN when a record lands in it.
 *
 * ⛔ And only then. This component is REMOUNTED per conversation (it is keyed on `message.id`,
 * because its undo buffer would otherwise carry one customer's draft into another's reply), so on
 * a fresh thread it mounts holding whatever the reveal counter last reached. Reacting to the
 * VALUE rather than to a CHANGE would fling the AI panel open on a thread where the agent added
 * nothing at all.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposerAiActions } from '../ComposerAiActions';

vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
const composeReply =
  vi.fn<(messageId: number, body: Record<string, unknown>) => Promise<{ data?: unknown }>>();
vi.mock('@/services/message.service', () => ({
  messageService: {
    composeReply: (messageId: number, body: Record<string, unknown>) =>
      composeReply(messageId, body),
  },
}));

afterEach(() => {
  cleanup();
  composeReply.mockReset();
});

const setup = (revealNote: number) =>
  render(
    <ComposerAiActions
      messageId={1}
      composer=""
      setComposer={vi.fn()}
      instructions="Order 137416."
      onInstructionsChange={vi.fn()}
      revealNote={revealNote}
    />
  );

describe('bringing the note box on screen', () => {
  it('⛔ stays CLOSED when it mounts holding a counter from another thread', () => {
    setup(3);

    expect(screen.queryByText(/Your note for the AI draft/i)).not.toBeInTheDocument();
  });

  it('🔴 OPENS when the counter moves — a record was just added', () => {
    const { rerender } = setup(3);

    rerender(
      <ComposerAiActions
        messageId={1}
        composer=""
        setComposer={vi.fn()}
        instructions="Order 137416."
        onInstructionsChange={vi.fn()}
        revealNote={4}
      />
    );

    expect(screen.getByText(/Your note for the AI draft/i)).toBeInTheDocument();
    // And the fact is in the box the agent is now looking at.
    expect(screen.getByDisplayValue('Order 137416.')).toBeInTheDocument();
  });
});

describe('v4: the note field flashes when a record lands in it', () => {
  const at = (revealNote: number, instructions = 'Order 137416.') => (
    <ComposerAiActions
      messageId={1}
      composer=""
      setComposer={vi.fn()}
      instructions={instructions}
      onInstructionsChange={vi.fn()}
      revealNote={revealNote}
    />
  );
  const ring = () => {
    const cls = screen.getByDisplayValue('Order 137416.').className;
    return cls.includes('ring-[3px]') && cls.includes('ring-primary-line');
  };
  afterEach(() => vi.useRealTimers());

  it('rings for 1.2 s after an add, then the ring is removed', () => {
    vi.useFakeTimers();
    const { rerender } = render(at(3));
    rerender(at(4));
    expect(ring()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1150);
    });
    expect(ring()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(ring()).toBe(false);
  });

  it('a second add restarts the 1.2 s', () => {
    vi.useFakeTimers();
    const { rerender } = render(at(3));
    rerender(at(4));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender(at(5));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(ring()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(ring()).toBe(false);
  });

  it('CONTROL: no ring when the panel is opened by hand, or on a mount holding a counter', async () => {
    render(at(3));
    await userEvent.click(screen.getByRole('button', { name: /AI draft/i }));
    expect(ring()).toBe(false);
  });

  it('unmounting mid-flash leaves no timer behind', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = render(at(3));
    rerender(at(4));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('switching threads', () => {
  it('🔴 a counter RESET is not an add — the panel stays shut', () => {
    // Found in audit pass 5, in the fix from pass 1: the host empties the note per thread, which
    // drives this counter 3 → 0. A rule that reacted to any CHANGE opened the panel on the new
    // thread — the exact bug pass 1 set out to fix, one edge along.
    const { rerender } = setup(3);

    rerender(
      <ComposerAiActions
        messageId={1}
        composer=""
        setComposer={vi.fn()}
        instructions=""
        onInstructionsChange={vi.fn()}
        revealNote={0}
      />
    );

    expect(screen.queryByText(/Your note for the AI draft/i)).not.toBeInTheDocument();
  });

  it('CONTROL: and an add AFTER the reset still opens it', () => {
    const { rerender } = setup(3);
    const render1 = (revealNote: number) =>
      rerender(
        <ComposerAiActions
          messageId={1}
          composer=""
          setComposer={vi.fn()}
          instructions="Order 1."
          onInstructionsChange={vi.fn()}
          revealNote={revealNote}
        />
      );

    render1(0);
    render1(1);

    expect(screen.getByText(/Your note for the AI draft/i)).toBeInTheDocument();
  });
});

describe('the record facts reach the request', () => {
  it('🔴 sends the note as guided instructions — the wiring, not the widget', async () => {
    /*
      ⛔ THIS IS THE TEST L2 P1 AND P2 BOTH LACKED. Both shipped with a correct API, a correct
      contract and a control that rendered — and neither value was ever in the payload, because
      every test drove the component or the service and none drove the request. A note the agent
      can see in a box and that never reaches the model is the same failure with a nicer screen.
    */
    const user = userEvent.setup();
    /*
      ⛔ NEVER RESOLVES, on purpose. What is under test is the REQUEST; letting the draft come
      back renders the preview, which mounts `TranslateButton` and needs a ThemeProvider this test
      has no reason to build. CI caught that as `useTheme must be used within a ThemeProvider` —
      2379 tests passing AND exit 1, the same Errors-line trap as the KB-references race.
    */
    composeReply.mockReturnValue(new Promise(() => {}));

    render(
      <ComposerAiActions
        messageId={7}
        composer=""
        setComposer={vi.fn()}
        instructions="Order 137416 — Status: On its way."
        onInstructionsChange={vi.fn()}
        revealNote={0}
      />
    );

    await user.click(screen.getByRole('button', { name: /AI draft/i }));
    await user.click(screen.getByRole('button', { name: 'Write reply' }));

    expect(composeReply).toHaveBeenCalledWith(7, {
      mode: 'guided',
      instructions: 'Order 137416 — Status: On its way.',
    });
  });
});
