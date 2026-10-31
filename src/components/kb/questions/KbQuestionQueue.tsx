import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { answerKbQuestion, getKbQuestions, undoKbQuestion } from '@/services/kbEngine.service';
import type { KbQuestion, KbQuestionChoiceKey } from '@/services/kbEngine.types';
import { UNDO_FORBIDDEN_TEXT, UNDO_REFUSAL_TEXT, undoBlockedText } from './kbAnswerUndo';
import { KbQuestionCard, ignoresCardKey } from './KbQuestionCard';
import { useKbQuestions } from './useKbQuestions';

/**
 * KB engine Stage 1 (F4): the Questions queue, one card at a time. j / k move next / previous;
 * 1–4 choose an answer (in the card). Skip is client-side: the card goes behind every not-skipped
 * card for this session (later pages included). The next page loads when the queue runs low; a
 * failed page is asked again only from its Retry.
 */

export const ALREADY_DECIDED_TEXT = 'Already decided: someone already answered this question.';
export const NOT_YOUR_TEAM_TEXT = "You can't decide questions for this team.";
export const GONE_TEXT = 'No longer exists: this question was removed.';
export const LINK_DECIDED_TEXT = 'Already decided: that question is no longer open.';
export const BACK_TO_SKIPPED_TEXT = 'Back to skipped questions.';

/** Load the next page when this few cards are left ahead of the current one. */
const LOW_WATER = 3;
/** How long the "Saved" / "Already decided" line stays. */
const NOTICE_MS = 6000;
/** How long "Done · Undo" stays after a saved answer. */
const UNDO_MS = 10000;

type Notice = { tone: 'success' | 'info'; text: string };

export const KbQuestionQueue = ({
  departmentId,
  search,
  empty,
  onDecided,
  startAt,
  onLinkUsed,
  onUndone,
}: {
  departmentId?: number;
  /** A link's `?question=<suggestionId>`: the queue starts at that card, or says it is decided. */
  startAt?: number;
  /** The link's question was looked up: the address no longer needs `?question=`. */
  onLinkUsed?: () => void;
  /** An answer was undone: the question is open again (counts go back up). */
  onUndone?: (question: KbQuestion) => void;
  search: string;
  /** What an empty queue (no search) shows: "Nothing needs you". */
  empty: ReactNode;
  /** A question left the open set (answered here, already decided, or gone): counts drop. */
  onDecided?: (question: KbQuestion) => void;
}) => {
  const queue = useKbQuestions({ departmentId, search });
  const { items, freshCount, loadMore, hasMore, remove, skip } = queue;
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [undoable, setUndoable] = useState<{ question: KbQuestion } | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new query starts at the first card.
  useEffect(() => {
    setIndex(0);
    setError(null);
  }, [departmentId, search]);

  // Keep the index inside the queue as cards leave it.
  const current = items.length > 0 ? items[Math.min(index, items.length - 1)] : null;
  const position = current ? Math.min(index, items.length - 1) : 0;

  useEffect(() => {
    // Only not-skipped cards count: skipped ones come back after every page is in.
    if (hasMore && freshCount - position <= LOW_WATER) loadMore();
  }, [hasMore, freshCount, position, loadMore]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  const flash = useCallback((next: Notice) => {
    setNotice(next);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const move = useCallback(
    (step: number) => {
      if (busy || items.length === 0) return;
      setError(null);
      setIndex((at) =>
        Math.max(0, Math.min(items.length - 1, Math.min(at, items.length - 1) + step))
      );
    },
    [busy, items.length]
  );

  // Start at the linked question with ONE keyset probe (the cursor is the last id seen, so
  // `id - 1` with limit 1 returns the linked question first if it is still open): found -> its card
  // leads the queue; not found -> the "Already decided" line; a failed probe -> an error + Retry.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [probeFailed, setProbeFailed] = useState(false);
  const [probeKey, setProbeKey] = useState(0);
  const { loading, pin } = queue;
  useEffect(() => {
    if (!startAt || startedAt === startAt || loading) return;
    let live = true;
    setProbeFailed(false);
    getKbQuestions({ departmentId, cursor: String(startAt - 1), limit: 1 }).then(
      (page) => {
        if (!live) return;
        const found = page.items[0]?.suggestionId === startAt ? page.items[0] : null;
        if (found) {
          pin(found);
          setIndex(0);
        } else flash({ tone: 'info', text: LINK_DECIDED_TEXT });
        setStartedAt(startAt);
        onLinkUsed?.();
      },
      () => live && setProbeFailed(true)
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt, startedAt, loading, probeKey, departmentId]);

  // j / k from the moment the card is on screen (a layout effect, as in the card).
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (ignoresCardKey(event)) return;
      if (event.key === 'j') move(1);
      else if (event.key === 'k') move(-1);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  const answer = useCallback(
    async (choice: KbQuestionChoiceKey, text?: string) => {
      if (!current) return;
      const decided = (message: string, tone: Notice['tone']) => {
        remove(current.suggestionId);
        onDecided?.(current);
        flash({ tone, text: message });
      };
      setBusy(true);
      setError(null);
      try {
        await answerKbQuestion(current.suggestionId, choice, text);
        decided('Saved. Here is the next question.', 'success');
        setUndoError(null);
        setUndoable({ question: current });
      } catch (err) {
        const status = getErrorStatus(err);
        if (status === 409) {
          decided(ALREADY_DECIDED_TEXT, 'info');
        } else if (status === 404) {
          decided(GONE_TEXT, 'info');
        } else if (status === 403) {
          setError(NOT_YOUR_TEAM_TEXT);
        } else {
          setError(getApiErrorMessage(err) ?? 'Could not save the answer. Try again.');
        }
      } finally {
        setBusy(false);
      }
    },
    [current, remove, flash, onDecided]
  );

  // "Done · Undo" for ~10 s after every saved answer. The timer stands down while an undo is in
  // flight and once it was refused: a refusal stays until the person dismisses it (or answers again).
  useEffect(() => {
    if (!undoable || undoing || undoError) return;
    const timer = setTimeout(() => setUndoable(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undoable, undoing, undoError]);

  const dismissUndo = () => {
    setUndoable(null);
    setUndoError(null);
  };

  const undo = async () => {
    if (!undoable) return;
    setUndoing(true);
    setUndoError(null);
    try {
      const result = await undoKbQuestion(undoable.question.suggestionId);
      if ('reopened' in result) {
        queue.reopen(undoable.question);
        setIndex(0);
        onUndone?.(undoable.question);
        setUndoable(null);
      } else if (result.refused === 'blocked') {
        setUndoError(undoBlockedText(result.blocked));
      } else if (result.refused === 'other') {
        // An unknown refusal: the server's own words say more than a generic line.
        setUndoError(result.message || UNDO_REFUSAL_TEXT.other);
      } else {
        setUndoError(UNDO_REFUSAL_TEXT[result.refused]);
      }
    } catch (err) {
      setUndoError(
        getErrorStatus(err) === 403
          ? UNDO_FORBIDDEN_TEXT
          : (getApiErrorMessage(err) ?? 'Could not undo. Try again.')
      );
    } finally {
      setUndoing(false);
    }
  };

  const onSkip = useCallback(() => {
    if (!current) return;
    setError(null);
    skip(current.suggestionId);
  }, [current, skip]);

  const term = search.trim();

  return (
    <div className="space-y-3" data-testid="kb-questions-slot" data-search={search}>
      {queue.olderThan7d > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="kb-questions-older">
          {queue.olderThan7d === 1
            ? '1 question open over 7 days'
            : `${queue.olderThan7d} questions open over 7 days`}
        </p>
      )}
      {undoable && (
        <div data-testid="kb-question-undo" className="space-y-2">
          {/* Not a live region itself: the refusal below is the one thing announced. */}
          <div className="flex items-center p-2 w-full text-sm rounded-lg border bg-success-muted border-success-line text-success">
            <span className="mr-2">Done.</span>
            <Button variant="outline" size="sm" onClick={() => void undo()} isLoading={undoing}>
              Undo
            </Button>
          </div>
          {undoError && (
            <Alert variant="danger" className="py-2 text-sm">
              <span className="mr-2">{undoError}</span>
              <Button variant="outline" size="sm" onClick={dismissUndo}>
                Dismiss
              </Button>
            </Alert>
          )}
        </div>
      )}
      {probeFailed && (
        <Alert variant="danger" className="text-sm">
          <span className="mr-2">The linked question could not be loaded.</span>
          <Button variant="outline" size="sm" onClick={() => setProbeKey((key) => key + 1)}>
            Retry
          </Button>
        </Alert>
      )}
      {notice && (
        <Alert variant={notice.tone} className="py-2 text-sm">
          <span role="status">{notice.text}</span>
        </Alert>
      )}
      {queue.loading || (!current && queue.loadingMore) ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : queue.error ? (
        <Alert variant="danger" className="text-sm">
          <span className="mr-2">{queue.error}</span>
          <Button variant="outline" size="sm" onClick={queue.reload}>
            Try again
          </Button>
        </Alert>
      ) : current ? (
        <>
          {position >= freshCount && (
            <p className="text-sm text-muted-foreground" data-testid="kb-questions-back-to-skipped">
              {BACK_TO_SKIPPED_TEXT}
            </p>
          )}
          <KbQuestionCard
            key={current.suggestionId}
            question={current}
            onAnswer={answer}
            onSkip={onSkip}
            busy={busy}
            position={position + 1}
            total={Math.max(queue.total, items.length)}
            error={error}
          />
        </>
      ) : queue.moreFailed ? (
        <Card>
          <CardContent className="p-8 text-center sm:p-12">
            <p className="text-sm text-muted-foreground">
              More questions wait, but they could not be loaded.
            </p>
          </CardContent>
        </Card>
      ) : term ? (
        <Card>
          <CardContent className="p-8 text-center sm:p-12">
            <p className="text-sm text-muted-foreground">No open question matches “{term}”.</p>
          </CardContent>
        </Card>
      ) : (
        empty
      )}
      {queue.moreFailed && (
        <p className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
          <span>Couldn't load more questions.</span>
          <Button variant="outline" size="sm" onClick={queue.retryMore}>
            Retry
          </Button>
        </p>
      )}
    </div>
  );
};
