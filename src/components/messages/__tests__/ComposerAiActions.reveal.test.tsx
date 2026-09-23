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
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposerAiActions } from '../ComposerAiActions';

vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
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

    expect(screen.queryByText(/What should the reply say/i)).not.toBeInTheDocument();
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

    expect(screen.getByText(/What should the reply say/i)).toBeInTheDocument();
    // And the fact is in the box the agent is now looking at.
    expect(screen.getByDisplayValue('Order 137416.')).toBeInTheDocument();
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
    composeReply.mockResolvedValue({ data: { text: 'Hello' } });

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
