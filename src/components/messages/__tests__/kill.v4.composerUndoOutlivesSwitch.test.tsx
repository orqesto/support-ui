/**
 * Mutation batch (message detail v4): the two guards that keep ComposerAiActions MOUNTED while an
 * undo is pending — `previous === null` in `hiddenByDraftsOff` and `hiddenByNoProvider` — had no
 * test. Forcing either to `true` hides the panel, and with it the only way back to the text a
 * draft replaced, the moment an admin switches drafts off or the provider goes away.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const composeReply = vi.fn<(...args: unknown[]) => Promise<{ data: { text: string } }>>();
vi.mock('@/services/message.service', () => ({
  messageService: { composeReply: (...args: unknown[]) => composeReply(...args) },
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const aiConfigured = { value: true };
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: aiConfigured.value, isLoading: false }),
}));
const aiDrafts = { off: false };
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true }),
  useRefreshAiDrafts: () => vi.fn(),
}));

const { ComposerAiActions } = await import('@/components/messages/ComposerAiActions');

const setComposer = vi.fn<(html: string) => void>();
const OWN_TEXT = '<p>my own words</p>';
const UNDO = 'Restore what you had written';

const renderComposer = () =>
  render(
    <ComposerAiActions
      messageId={42}
      composer={OWN_TEXT}
      setComposer={setComposer}
      onApplied={() => undefined}
    />
  );

/** Open the panel, ask for a fresh draft, accept it — the agent's text is now replaced. */
const applyADraft = async () => {
  fireEvent.click(screen.getByTitle('Draft this reply with AI'));
  fireEvent.click(screen.getByText(/Write a new reply instead/));
  fireEvent.click(screen.getByText('Write reply'));
  fireEvent.click(await screen.findByText('Use it'));
  expect(setComposer).toHaveBeenLastCalledWith(expect.stringContaining('drafted text'));
  expect(screen.getByTitle(UNDO)).toBeInTheDocument();
};

beforeEach(() => {
  vi.clearAllMocks();
  aiConfigured.value = true;
  aiDrafts.off = false;
  composeReply.mockResolvedValue({ data: { text: 'drafted text' } });
});
afterEach(cleanup);

describe('undo outlives the switch that would hide the AI panel', () => {
  it('AI drafts switched off after a draft was applied: undo stays, and restores the text', async () => {
    const { rerender } = renderComposer();
    await applyADraft();
    aiDrafts.off = true;
    rerender(
      <ComposerAiActions
        messageId={42}
        composer="<p>drafted text</p>"
        setComposer={setComposer}
        onApplied={() => undefined}
      />
    );
    // Still mounted: the undo is there, the "off" note is not yet (it would replace the panel).
    const undo = screen.getByTitle(UNDO);
    expect(screen.queryByTestId('ai-drafts-off-note')).toBeNull();
    fireEvent.click(undo);
    expect(setComposer).toHaveBeenLastCalledWith(OWN_TEXT);
    // CONTROL: with nothing left to undo, the switch takes effect — the note replaces the panel.
    expect(screen.getByTestId('ai-drafts-off-note')).toBeInTheDocument();
    expect(screen.queryByTitle(UNDO)).toBeNull();
  });

  it('the provider disconnected after a draft was applied: undo stays, then the panel goes', async () => {
    const { rerender } = renderComposer();
    await applyADraft();
    aiConfigured.value = false;
    rerender(
      <ComposerAiActions
        messageId={42}
        composer="<p>drafted text</p>"
        setComposer={setComposer}
        onApplied={() => undefined}
      />
    );
    const undo = screen.getByTitle(UNDO);
    fireEvent.click(undo);
    expect(setComposer).toHaveBeenLastCalledWith(OWN_TEXT);
    // CONTROL: no provider and nothing to undo renders nothing at all.
    expect(screen.queryByTitle(UNDO)).toBeNull();
    expect(screen.queryByTitle('Draft this reply with AI')).toBeNull();
  });
});
