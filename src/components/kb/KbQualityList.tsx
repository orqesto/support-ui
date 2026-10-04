import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { KbQualityReview } from '@/components/kb/KbQualityReview';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { announceKbConsolidationDecided } from '@/lib/kbConsolidation';
import { REJECTED_RETENTION_DAYS } from '@/lib/kbRejection';
import { summarizeKbQuality } from '@/lib/kbQuality';
import { kbQualityService, type KbQualityBulkResult } from '@/services/kbQuality.service';
import type { LearningSuggestion } from '@/services/learning.service';

const isRemove = (row: LearningSuggestion) => row.payload?.verdict !== 'improve';

/** "Removed 3 entries. 1 had changed since the review and was left alone." */
export const describeBulkResult = (result: KbQualityBulkResult): string => {
  const parts = [`Removed ${result.rejected} ${result.rejected === 1 ? 'entry' : 'entries'}.`];
  if (result.expired > 0) {
    parts.push(
      `${result.expired} had changed since the review and ${result.expired === 1 ? 'was' : 'were'} left alone.`
    );
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} could not be removed (already decided, or an error) — reload to see them.`);
  }
  return parts.join(' ');
};

/**
 * The Quality tab: every pending quality suggestion this moderator may see, removals first. Each
 * opens its own review (the entry's full text is read only then — never one request per row on
 * every visit). Removals can also be ticked and removed together.
 */
export const KbQualityList = ({
  rows,
  onChanged,
}: {
  rows: LearningSuggestion[];
  /** Re-read the list after a decision. */
  onChanged: () => void;
}) => {
  const [opened, setOpened] = useState<Set<number>>(new Set());
  // Decided in its own review: it shows its outcome until the next reload, and is no longer
  // selectable — a bulk remove of it would only be refused.
  const [decided, setDecided] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ variant: 'success' | 'danger'; text: string } | null>(null);

  const ordered = [...rows].sort((left, right) => Number(isRemove(right)) - Number(isRemove(left)) || left.id - right.id);
  const removable = ordered.filter((row) => isRemove(row) && !decided.has(row.id));
  const chosen = removable.filter((row) => selected.has(row.id)).map((row) => row.id);

  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const removeChosen = async () => {
    setConfirming(false);
    setBusy(true);
    setNotice(null);
    try {
      const result = await kbQualityService.bulkReject(chosen);
      setNotice({ variant: 'success', text: describeBulkResult(result) });
      setSelected(new Set());
      announceKbConsolidationDecided();
      onChanged();
    } catch (err) {
      setNotice({ variant: 'danger', text: getApiErrorMessage(err) ?? 'Could not remove the entries — try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0) {
    return (
      <p className="py-8 text-sm text-center text-muted-foreground">
        No quality suggestions waiting for review.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {removable.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <Checkbox
            label={`Select all removals (${removable.length})`}
            checked={chosen.length === removable.length}
            onChange={(event) =>
              setSelected(event.target.checked ? new Set(removable.map((row) => row.id)) : new Set())
            }
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={chosen.length === 0 || busy}
            isLoading={busy}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="mr-1 w-4 h-4" />
            Remove selected ({chosen.length})
          </Button>
        </div>
      )}
      <ul className="space-y-3" aria-label="Quality suggestions">
        {ordered.map((row) => (
          <li key={row.id}>
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap gap-2 justify-between items-center">
                  <div className="flex gap-2 items-center min-w-0">
                    {isRemove(row) && !decided.has(row.id) && (
                      <Checkbox
                        aria-label={`Select ${summarizeKbQuality(row.payload ?? {})}`}
                        checked={selected.has(row.id)}
                        onChange={(event) => toggle(row.id, event.target.checked)}
                      />
                    )}
                    <Badge variant={isRemove(row) ? 'danger' : 'warning'}>
                      {isRemove(row) ? 'remove' : 'rewrite'}
                    </Badge>
                    <span className="text-sm font-medium break-words">
                      {summarizeKbQuality(row.payload ?? {})}
                    </span>
                  </div>
                  {!opened.has(row.id) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpened((prev) => new Set(prev).add(row.id))}
                    >
                      Review
                    </Button>
                  )}
                </div>
                {opened.has(row.id) && (
                  <KbQualityReview
                    suggestionId={row.id}
                    onDecided={() => {
                      setDecided((prev) => new Set(prev).add(row.id));
                      toggle(row.id, false);
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => void removeChosen()}
        title={`Remove ${chosen.length} ${chosen.length === 1 ? 'entry' : 'entries'}?`}
        description={`They stop being used in answers now and are deleted after ${REJECTED_RETENTION_DAYS} days. Until then you can bring one back by approving it in the knowledge base. An entry edited since it was reviewed is left alone.`}
        confirmText="Remove"
        variant="danger"
      />
    </div>
  );
};
