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
import { messageService, type KbQaCandidate } from '@/services/message.service';

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

    messageService
      .kbCandidates(messageId)
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
      const ids = await messageService.promoteToKb(
        messageId,
        kept.map((pair) => ({
          questionMessageId: pair.questionMessageId,
          answerMessageId: pair.answerMessageId,
          question: pair.question.trim(),
          answer: pair.answer.trim(),
        }))
      );
      // The server returns what it actually created: a pair already in the KB is not added
      // twice, and saying "2 added" when one was a duplicate would be a lie the agent can't see.
      toast.success(
        ids.length === 1
          ? 'Added to the knowledge base'
          : ids.length > 0
            ? `${ids.length} entries added to the knowledge base`
            : 'Already in the knowledge base — nothing new was added'
      );
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
