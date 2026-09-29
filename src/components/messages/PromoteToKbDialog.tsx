import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BookOpen, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import {
  kbPromoteService,
  type KbPromoteOutcome,
  type KbQaCandidate,
} from '@/services/kbPromote.service';

/**
 * Promote an already-resolved thread into the knowledge base.
 *
 * "Resolve & Save to KB" captures at the moment of resolving and is otherwise the only door: a
 * thread resolved with "Resolve (no KB)", or one whose capture found nothing that day, could
 * never be added afterwards however good the answer was.
 *
 * The agent CONFIRMS what gets stored, which is what makes the resulting entry different from a
 * mined one: it is saved approved and attributed to them, and it is the first KB content anyone
 * has actually read before it went in. So the dialog opens on what was extracted, lets each pair
 * be edited or dropped, and saves only what is left.
 */

type Props = {
  messageId: number;
  isOpen: boolean;
  onClose: () => void;
  /** Fired after entries were created, so the KB tab and counters can refresh. */
  onPromoted?: (knowledgeBaseIds: number[]) => void;
};

type EditablePair = KbQaCandidate & { keep: boolean };

/**
 * The toast says what the saved entries ARE, from the backend's per-state `outcome` — never from
 * the ids alone. "Added" only for what the AI now serves: an entry saved but hidden, waiting on
 * a reviewer, rejected, or an original of a merged case is not "added", and saying so would be a
 * lie the agent cannot see. Several states at once are each said.
 */
export const promoteToastText = (ids: number[], outcome: KbPromoteOutcome): string => {
  if (ids.length === 0) return 'Already in the knowledge base — nothing new was added';
  const { approved, hidden, pendingReview, rejected, partOfCase } = outcome;
  const parts: string[] = [];
  if (approved > 0)
    parts.push(
      approved === 1 ? 'Added to the knowledge base' : `${approved} entries added to the knowledge base`
    );
  if (pendingReview > 0)
    parts.push(
      `${pendingReview === 1 ? 'Saved' : `${pendingReview} entries saved`} and sent for review — the AI uses ${pendingReview === 1 ? 'it' : 'them'} once a reviewer approves`
    );
  if (hidden > 0)
    parts.push(
      parts.length === 0 && hidden === 1
        ? 'Already in the knowledge base but hidden — ask a KB reviewer to restore it'
        : `${hidden} already in the knowledge base but hidden — ask a KB reviewer to restore ${hidden === 1 ? 'it' : 'them'}`
    );
  if (partOfCase.length > 0) parts.push('Already part of a merged entry — it answers this');
  if (rejected > 0)
    parts.push('A reviewer already rejected this answer — ask them to restore it');
  return parts.length > 0 ? parts.join('. ') : 'Saved to the knowledge base';
};

export const PromoteToKbDialog = ({ messageId, isOpen, onClose, onPromoted }: Props) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pairs, setPairs] = useState<EditablePair[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    setLoading(true);
    setLoadError(null);
    setPairs([]);

    kbPromoteService
      .candidates(messageId)
      .then((candidates) => {
        if (cancelled) return;
        setPairs(candidates.map((candidate) => ({ ...candidate, keep: true })));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        logger.error('Failed to load KB candidates:', error);
        setLoadError(getApiErrorMessage(error) ?? 'Could not read this thread.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, messageId]);

  const update = useCallback((index: number, patch: Partial<EditablePair>) => {
    setPairs((current) =>
      current.map((pair, idx) => (idx === index ? { ...pair, ...patch } : pair))
    );
  }, []);

  const kept = pairs.filter((pair) => pair.keep && pair.question.trim() && pair.answer.trim());

  const handleSave = async () => {
    setSaving(true);
    try {
      const { ids, outcome } = await kbPromoteService.promote(
        messageId,
        kept.map((pair) => ({
          questionMessageId: pair.questionMessageId,
          answerMessageId: pair.answerMessageId,
          question: pair.question.trim(),
          answer: pair.answer.trim(),
        }))
      );
      toast.success(promoteToastText(ids, outcome));
      onPromoted?.(ids);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error) ?? 'Could not add to the knowledge base');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Add this conversation to the knowledge base</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : loadError ? (
          <Alert variant="danger">{loadError}</Alert>
        ) : pairs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to add — no question and answer could be read from this thread.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Edit anything that should read differently. What you keep is saved as reviewed by
              you.
            </p>

            {pairs.map((pair, index) => (
              <div
                key={`${pair.questionMessageId}-${pair.answerMessageId}`}
                className={`p-3 space-y-3 rounded-md border ${
                  pair.keep ? 'border-border' : 'border-dashed border-border opacity-60'
                }`}
              >
                <div className="flex gap-2 justify-between items-start">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`kb-q-${index}`}>Question</Label>
                    <Textarea
                      id={`kb-q-${index}`}
                      rows={2}
                      value={pair.question}
                      disabled={!pair.keep}
                      onChange={(event) => update(index, { question: event.target.value })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={pair.keep ? 'Discard this pair' : 'Keep this pair'}
                    onClick={() => update(index, { keep: !pair.keep })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`kb-a-${index}`}>Answer</Label>
                  <Textarea
                    id={`kb-a-${index}`}
                    rows={4}
                    value={pair.answer}
                    disabled={!pair.keep}
                    onChange={(event) => update(index, { answer: event.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleSave()}
          isLoading={saving}
          disabled={kept.length === 0 || saving}
        >
          <BookOpen className="mr-2 w-4 h-4" />
          {kept.length > 1 ? `Add ${kept.length} entries` : 'Add to knowledge base'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
