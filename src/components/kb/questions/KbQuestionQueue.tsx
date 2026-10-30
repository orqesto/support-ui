import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { answerKbQuestion } from '@/services/kbEngine.service';
import type { KbQuestionChoiceKey } from '@/services/kbEngine.types';
import { KbQuestionCard, isTypingTarget } from './KbQuestionCard';
import { useKbQuestions } from './useKbQuestions';

/**
 * KB engine Stage 1 (F4): the Questions queue, one card at a time. j / k move next / previous;
 * 1–4 choose an answer (in the card). Skip is client-side: the card goes to the end for this
 * session. The next page loads when the queue runs low.
 */

export const ALREADY_DECIDED_TEXT = 'Already decided: someone already answered this question.';
export const NOT_YOUR_TEAM_TEXT = "You can't decide questions for this team.";

/** Load the next page when this few cards are left ahead of the current one. */
const LOW_WATER = 3;
/** How long the "Saved" / "Already decided" line stays. */
const NOTICE_MS = 6000;

type Notice = { tone: 'success' | 'info'; text: string };

export const KbQuestionQueue = ({
  departmentId,
  search,
  empty,
}: {
  departmentId?: number;
  search: string;
  /** What an empty queue (no search) shows: "Nothing needs you". */
  empty: ReactNode;
}) => {
  const queue = useKbQuestions({ departmentId, search });
  const { items, loadMore, hasMore, remove, skip } = queue;
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
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
    if (hasMore && items.length - position <= LOW_WATER) loadMore();
  }, [hasMore, items.length, position, loadMore]);

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

  // j / k from the moment the card is on screen (a layout effect, as in the card).
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
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
      setBusy(true);
      setError(null);
      try {
        await answerKbQuestion(current.suggestionId, choice, text);
        remove(current.suggestionId);
        flash({ tone: 'success', text: 'Saved. Here is the next question.' });
      } catch (err) {
        const status = getErrorStatus(err);
        if (status === 409) {
          remove(current.suggestionId);
          flash({ tone: 'info', text: ALREADY_DECIDED_TEXT });
        } else if (status === 403) {
          setError(NOT_YOUR_TEAM_TEXT);
        } else {
          setError(getApiErrorMessage(err) ?? 'Could not save the answer. Try again.');
        }
      } finally {
        setBusy(false);
      }
    },
    [current, remove, flash]
  );

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
      {notice && (
        <Alert variant={notice.tone} className="py-2 text-sm">
          <span role="status">{notice.text}</span>
        </Alert>
      )}
      {queue.loading ? (
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
      ) : term ? (
        <Card>
          <CardContent className="p-8 text-center sm:p-12">
            <p className="text-sm text-muted-foreground">No open question matches “{term}”.</p>
          </CardContent>
        </Card>
      ) : (
        empty
      )}
    </div>
  );
};
