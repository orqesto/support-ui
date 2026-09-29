import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type {
  KbPromoteOutcome,
  KbPromoteResult,
  KbQaCandidate,
  KbQaPairInput,
} from '@/services/kbPromote.service';

/**
 * Promoting a resolved thread is the only path where a person reads KB content BEFORE it is
 * stored — the entry is saved approved and attributed to them. So what the dialog sends has to
 * be what the agent actually kept and actually typed, not what was extracted.
 */

const candidate = (over: Partial<KbQaCandidate> = {}): KbQaCandidate => ({
  question: 'Where is my order ORB-1268?',
  answer: 'It was returned to our warehouse and reshipped today.',
  questionMessageId: 11,
  answerMessageId: 12,
  subject: 'ORB-1268 order return',
  questionFrom: 'customer@example.com',
  answeredBy: 'support@example.com',
  ...over,
});

const kbCandidates = vi.fn<(id: number) => Promise<KbQaCandidate[]>>();
const promoteToKb = vi.fn<(id: number, pairs: KbQaPairInput[]) => Promise<KbPromoteResult>>();
/** What the service returns: the ids and the backend's truthful per-state `outcome`. */
const promoted = (ids: number[], outcome: Partial<KbPromoteOutcome> = {}): KbPromoteResult => ({
  ids,
  outcome: {
    approved: 0,
    hidden: 0,
    retired: 0,
    pendingReview: 0,
    rejected: 0,
    partOfCase: [],
    ...outcome,
  },
});
const success = vi.fn<(message: string) => void>();
const error = vi.fn<(message: string) => void>();

vi.mock('@/services/kbPromote.service', () => ({
  kbPromoteService: {
    candidates: (id: number) => kbCandidates(id),
    promote: (id: number, pairs: KbQaPairInput[]) => promoteToKb(id, pairs),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (message: string) => {
      success(message);
    },
    error: (message: string) => {
      error(message);
    },
  },
}));

const { PromoteToKbDialog } = await import('../PromoteToKbDialog');

const renderDialog = (onClose = vi.fn()) =>
  render(
    <ThemeProvider>
      <PromoteToKbDialog messageId={7} isOpen onClose={onClose} />
    </ThemeProvider>
  );

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  kbCandidates.mockResolvedValue([candidate()]);
  promoteToKb.mockResolvedValue(promoted([101], { approved: 1 }));
});

describe('PromoteToKbDialog', () => {
  it('shows what was extracted, and sends it when the agent accepts', async () => {
    renderDialog();

    expect(await screen.findByDisplayValue('Where is my order ORB-1268?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add to knowledge base/i }));

    await waitFor(() => expect(promoteToKb).toHaveBeenCalledTimes(1));
    expect(promoteToKb).toHaveBeenCalledWith(7, [
      {
        questionMessageId: 11,
        answerMessageId: 12,
        question: 'Where is my order ORB-1268?',
        answer: 'It was returned to our warehouse and reshipped today.',
      },
    ]);
  });

  it("sends the agent's edit, not the extracted text", async () => {
    // The whole reason the entry can be marked approved-by-them is that they read and fixed it.
    renderDialog();

    const answer = await screen.findByDisplayValue(/returned to our warehouse/);
    fireEvent.change(answer, {
      target: { value: 'Reshipped on 9 September, arriving in 3 days.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add to knowledge base/i }));

    await waitFor(() => expect(promoteToKb).toHaveBeenCalled());
    expect(promoteToKb.mock.calls[0][1][0].answer).toBe(
      'Reshipped on 9 September, arriving in 3 days.'
    );
  });

  it('does not send a pair the agent discarded', async () => {
    kbCandidates.mockResolvedValue([
      candidate(),
      candidate({ question: 'Do you ship to Poland?', questionMessageId: 21, answerMessageId: 22 }),
    ]);
    renderDialog();

    await screen.findByDisplayValue('Do you ship to Poland?');
    fireEvent.click(screen.getAllByRole('button', { name: /discard this pair/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /add to knowledge base/i }));

    await waitFor(() => expect(promoteToKb).toHaveBeenCalled());
    const sent = promoteToKb.mock.calls[0][1];
    expect(sent).toHaveLength(1);
    expect(sent[0].questionMessageId).toBe(21);
  });

  it('says nothing was added when the pair is already in the KB', async () => {
    // The server returns what it CREATED; a pair already stored is not added twice. Reporting
    // "1 added" there would be a lie the agent cannot see.
    promoteToKb.mockResolvedValue(promoted([]));
    renderDialog();

    await screen.findByDisplayValue('Where is my order ORB-1268?');
    fireEvent.click(screen.getByRole('button', { name: /add to knowledge base/i }));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][0]).toMatch(/already in the knowledge base/i);
  });

  it('says the entry went for REVIEW, not "added", when the agent may not approve', async () => {
    // "Added to the knowledge base" would be untrue: the AI does not use it until a moderator
    // approves, and the agent would otherwise believe the answer is live.
    promoteToKb.mockResolvedValue(promoted([101], { pendingReview: 1 }));
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: /add to knowledge base/i }));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][0]).toMatch(/sent for review/i);
    expect(success.mock.calls[0][0]).not.toMatch(/added/i);
  });

  it('says a reviewer REJECTED it rather than "added" or "sent for review"', async () => {
    promoteToKb.mockResolvedValue(promoted([101], { rejected: 1 }));
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: /add to knowledge base/i }));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][0]).toMatch(/rejected/i);
  });

  it('says "added" when the agent may approve', async () => {
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: /add to knowledge base/i }));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][0]).toMatch(/added to the knowledge base/i);
  });

  const toastFor = async (result: KbPromoteResult) => {
    promoteToKb.mockResolvedValue(result);
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: /add to knowledge base/i }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    return success.mock.calls[0][0];
  };

  it('a HIDDEN entry is not "added": only a KB reviewer can restore it', async () => {
    // Approved but hidden (e.g. a detached case member) is not served — "added" would be false.
    const text = await toastFor(promoted([101], { hidden: 1 }));
    expect(text).toBe('Already in the knowledge base but hidden — ask a KB reviewer to restore it');
    expect(text).not.toMatch(/added/i);
  });

  it('an original of a merged case is not "added": the merged entry answers it', async () => {
    const text = await toastFor(promoted([101], { partOfCase: [900] }));
    expect(text).toBe('Already part of a merged entry — it answers this');
    expect(text).not.toMatch(/added/i);
  });

  it('an entry whose source was removed is not "added": it is kept but never used', async () => {
    const text = await toastFor(promoted([101], { retired: 1 }));
    expect(text).toBe('Already in the knowledge base, but its source was removed — it is not used');
    expect(text).not.toMatch(/added/i);
  });

  it('a retired entry is said alongside an added one', async () => {
    const text = await toastFor(promoted([101, 102], { approved: 1, retired: 1 }));
    expect(text).toMatch(/^Added to the knowledge base\./);
    expect(text).toMatch(
      /1 already in the knowledge base, but its source was removed — it is not used/
    );
  });

  it('counts what was actually added', async () => {
    expect(await toastFor(promoted([101, 102], { approved: 2 }))).toBe(
      '2 entries added to the knowledge base'
    );
  });

  it('a mixed result says each part — "added" only for what is served', async () => {
    const text = await toastFor(promoted([101, 102], { approved: 1, hidden: 1 }));
    expect(text).toMatch(/^Added to the knowledge base\./);
    expect(text).toMatch(
      /1 already in the knowledge base but hidden — ask a KB reviewer to restore it/
    );
  });

  it('says so when the thread yields nothing, instead of offering an empty save', async () => {
    kbCandidates.mockResolvedValue([]);
    renderDialog();

    expect(await screen.findByText(/no question and answer could be read/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to knowledge base/i })).toBeDisabled();
  });

  it("surfaces the server's reason for refusing, not a generic failure", async () => {
    // The 409 the BE answers for an unfinished conversation carries the explanation in the body,
    // and it is the only thing that tells the agent WHY the thread cannot be promoted. Shaped
    // like a real axios error, because a bare Error would exercise the fallback instead.
    kbCandidates.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'Only a resolved or closed conversation can be promoted to the knowledge base',
        },
      },
    });
    renderDialog();

    expect(await screen.findByText(/only a resolved or closed conversation/i)).toBeInTheDocument();
    expect(promoteToKb).not.toHaveBeenCalled();
  });

  it('still says something when the failure carries no message', async () => {
    kbCandidates.mockRejectedValue(new Error('boom'));
    renderDialog();

    expect(await screen.findByText(/could not read this thread/i)).toBeInTheDocument();
  });
});
