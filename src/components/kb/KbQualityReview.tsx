import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Check, Pencil, Trash2, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Label } from '@/components/ui/Label';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { Tooltip } from '@/components/ui/Tooltip';
import { usePermissions } from '@/hooks/usePermissions';
import { apiErrorStatus } from '@/lib/apiError';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { announceKbConsolidationDecided, kbRef } from '@/lib/kbConsolidation';
import { REJECTED_RETENTION_DAYS } from '@/lib/kbRejection';
import { qualityReasonLabel } from '@/lib/kbQuality';
import {
  kbQualityService,
  type KbQualityAcceptResult,
  type KbQualityDetail,
} from '@/services/kbQuality.service';
import { Permission } from '@/types/roles';

/** The bounds the server stores (BE MERGED_QUESTION_MAX_CHARS / MERGED_ANSWER_MAX_CHARS). */
export const QUALITY_QUESTION_MAX = 600;
export const QUALITY_ANSWER_MAX = 8000;

export type KbQualityOutcome =
  | { kind: 'applied' | 'rejected' | 'expired' | 'unknown'; result: KbQualityAcceptResult }
  | { kind: 'kept' };

const REWRITE_PROBLEM_TEXT: Record<NonNullable<KbQualityDetail['rewriteProblem']>, string> = {
  failed: 'The AI could not write a replacement. Edit the entry yourself below, or remove it.',
  nothing_reusable:
    'The AI found nothing in the answer that would help another customer. Consider removing it.',
  unsafe_output:
    'The AI’s replacement could not be used (it looked like personal or contact data). Edit the entry yourself below.',
};

type Props = {
  suggestionId: number;
  /** Called once the server has taken the decision (never on a failure). */
  onDecided?: (outcome: KbQualityOutcome) => void;
};

/**
 * Decide one KB quality suggestion: the entry as it stands, why the review flagged it, and the
 * AI's replacement (for "improve"). The moderator may disagree with the verdict — a "remove" can
 * be rewritten instead, an "improve" removed — and nothing is written until they choose.
 */
export const KbQualityReview = ({ suggestionId, onDecided }: Props) => {
  const { hasPermission, isOrgAdmin } = usePermissions();
  const allowed = isOrgAdmin || hasPermission(Permission.MANAGE_KNOWLEDGE_BASE);

  const [detail, setDetail] = useState<KbQualityDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<KbQualityOutcome | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const load = useCallback(async (): Promise<KbQualityDetail | null> => {
    setLoadError(null);
    try {
      const data = await kbQualityService.getDetail(suggestionId);
      setDetail(data);
      // Prefilled with the AI's replacement, else the entry's own text to edit by hand.
      setQuestion(data.proposed?.question ?? data.entry?.question ?? '');
      setAnswer(data.proposed?.answer ?? data.entry?.answer ?? '');
      setEditing(data.verdict === 'improve');
      return data;
    } catch (err) {
      setLoadError(getApiErrorMessage(err) ?? 'Could not load this suggestion.');
      return null;
    }
  }, [suggestionId]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) return null;
  if (loadError) return <Alert variant="danger">{loadError}</Alert>;
  if (!detail) {
    return (
      <div className="flex justify-center py-6" role="status" aria-busy="true">
        <Spinner />
      </div>
    );
  }
  if (outcome) return <KbQualityOutcomeNotice outcome={outcome} />;

  const pending = detail.status === 'pending';
  const entry = detail.entry;
  const stale = detail.editedSinceProposed || !detail.stillEligible;
  const blocked = !detail.canDecide
    ? 'You can see this suggestion, but deciding it needs knowledge-base permission for every department this mailbox serves. Ask an admin.'
    : stale
      ? 'The entry changed or left the knowledge base since it was reviewed — this suggestion will expire.'
      : null;
  const textProblem = !question.trim()
    ? 'The entry needs a question.'
    : !answer.trim()
      ? 'The entry needs an answer.'
      : question.trim().length > QUALITY_QUESTION_MAX
        ? `The question can be up to ${QUALITY_QUESTION_MAX} characters.`
        : answer.trim().length > QUALITY_ANSWER_MAX
          ? `The answer can be up to ${QUALITY_ANSWER_MAX.toLocaleString('en')} characters.`
          : null;

  const rereadIfDecidedElsewhere = async (err: unknown) => {
    const status = apiErrorStatus(err);
    if (status === 409 || status === 404) {
      announceKbConsolidationDecided();
      const fresh = await load();
      if (fresh && fresh.status !== 'pending') setActionError(null);
    }
  };

  const finish = (next: KbQualityOutcome) => {
    setOutcome(next);
    announceKbConsolidationDecided();
    onDecided?.(next);
  };

  const decide = async (decision: 'apply' | 'reject') => {
    setActing(true);
    setActionError(null);
    try {
      const result = await kbQualityService.accept(
        detail.suggestionId,
        decision === 'apply'
          ? { action: 'apply', question: question.trim(), answer: answer.trim() }
          : { action: 'reject' }
      );
      finish({ kind: result.status, result });
    } catch (err) {
      setActionError(getApiErrorMessage(err) ?? 'Could not save the decision — try again.');
      await rereadIfDecidedElsewhere(err);
    } finally {
      setActing(false);
    }
  };

  const keep = async () => {
    setActing(true);
    setActionError(null);
    try {
      await kbQualityService.keep(detail.suggestionId);
      finish({ kind: 'kept' });
    } catch (err) {
      setActionError(getApiErrorMessage(err) ?? 'Could not save the decision — try again.');
      await rereadIfDecidedElsewhere(err);
    } finally {
      setActing(false);
    }
  };

  const entryName = entry ? kbRef(entry.publicId, entry.id) : 'the entry';

  return (
    <div className="space-y-4 text-sm" data-testid="kb-quality-review">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="font-medium">
          {detail.verdict === 'improve'
            ? `Proposed: rewrite ${entryName}`
            : `Proposed: remove ${entryName}`}
        </span>
        {detail.reasons.map((reason) => (
          <Badge key={reason} variant={detail.verdict === 'remove' ? 'danger' : 'warning'}>
            {qualityReasonLabel(reason)}
          </Badge>
        ))}
        {entry && !entry.approved && <Badge variant="secondary">not approved</Badge>}
        {entry && entry.timesReferenced > 0 && (
          <Badge variant="secondary">
            used {entry.timesReferenced === 1 ? 'once' : `${entry.timesReferenced} times`}
          </Badge>
        )}
      </div>
      {detail.note && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Why the AI flagged it: </span>
          {detail.note}
        </p>
      )}

      <div className="p-3 space-y-2 rounded-lg border border-border bg-background">
        <p className="font-medium">The entry now</p>
        {entry ? (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Question</p>
              <p className="whitespace-pre-wrap break-words">{entry.question ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Answer</p>
              <p className="whitespace-pre-wrap break-words">{entry.answer ?? '—'}</p>
            </div>
            {entry.conversationId !== null && (
              <Link
                to={`/messages?id=${entry.conversationId}`}
                className="text-xs text-primary hover:underline"
              >
                Thread {entry.conversationPublicId ?? `#${entry.conversationId}`}
              </Link>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">This entry no longer exists.</p>
        )}
      </div>

      {detail.proposed && detail.inputTruncated && (
        <Alert variant="warning">
          This entry was longer than the AI could read, so its replacement may be missing the end.
          Compare it with the entry above before saving.
        </Alert>
      )}
      {detail.verdict === 'improve' && !detail.proposed && detail.rewriteProblem && (
        <Alert variant="warning">{REWRITE_PROBLEM_TEXT[detail.rewriteProblem]}</Alert>
      )}

      {editing ? (
        <div className="p-3 space-y-3 rounded-lg border border-border">
          <div className="flex gap-2 items-center">
            <span className="font-medium">Replace it with</span>
            {detail.proposed && (
              <Tooltip content="Written by AI from the entry above — read and edit it before saving.">
                <Badge variant="secondary" className="gap-1">
                  <Bot className="w-3 h-3" />
                  AI-drafted
                </Badge>
              </Tooltip>
            )}
          </div>
          <div>
            <Label htmlFor={`quality-q-${detail.suggestionId}`}>Question</Label>
            {/* Multi-line: the question being fixed is often a whole email, and a one-line
                input would silently join its lines. */}
            <Textarea
              id={`quality-q-${detail.suggestionId}`}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={2}
              disabled={!pending}
            />
          </div>
          <div>
            <Label htmlFor={`quality-a-${detail.suggestionId}`}>Answer</Label>
            <Textarea
              id={`quality-a-${detail.suggestionId}`}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={6}
              disabled={!pending}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Saving replaces the entry’s text and approves it — the AI may quote it from then on.
          </p>
        </div>
      ) : (
        pending && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={acting}>
            <Pencil className="mr-1 w-4 h-4" />
            Rewrite it instead
          </Button>
        )
      )}

      {!pending && (
        <Alert>
          This suggestion is no longer pending ({detail.status}). Nothing can be decided here.
        </Alert>
      )}
      {actionError && <Alert variant="danger">{actionError}</Alert>}
      {pending && (blocked ?? (editing ? textProblem : null)) && (
        <p className="text-xs text-muted-foreground" data-testid="quality-blocked-reason">
          {blocked ?? textProblem}
        </p>
      )}
      {pending && (
        <div className="flex flex-wrap gap-2 justify-end">
          {/* Keep is blocked on a stale entry too: it stamps the text that was REVIEWED, so on an
              entry edited since, "not suggested again" would be untrue (FE audit M4). */}
          <Tooltip content="The entry is fine — do not suggest this again unless it is edited">
            <Button variant="outline" onClick={() => void keep()} disabled={acting || blocked !== null}>
              <X className="mr-1 w-4 h-4" />
              Keep as is
            </Button>
          </Tooltip>
          <Button
            variant={detail.verdict === 'remove' && !editing ? 'destructive' : 'outline'}
            onClick={() => setConfirmingRemove(true)}
            disabled={acting || blocked !== null}
          >
            <Trash2 className="mr-1 w-4 h-4" />
            Remove entry
          </Button>
          {editing && (
            <Button
              onClick={() => void decide('apply')}
              disabled={acting || blocked !== null || textProblem !== null}
              isLoading={acting}
            >
              <Check className="mr-1 w-4 h-4" />
              Save rewrite
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        onConfirm={() => {
          setConfirmingRemove(false);
          void decide('reject');
        }}
        title={`Remove ${entryName}?`}
        description={`It stops being used in answers now and is deleted after ${REJECTED_RETENTION_DAYS} days. Until then you can bring it back by approving it in the knowledge base.`}
        confirmText="Remove"
        variant="danger"
      />
    </div>
  );
};

/** What came of a decision — shown in place of the review. */
export const KbQualityOutcomeNotice = ({ outcome }: { outcome: KbQualityOutcome }) => {
  if (outcome.kind === 'kept') {
    return <Alert>Kept as is. It will not be suggested again unless the entry is edited.</Alert>;
  }
  const { result } = outcome;
  const name =
    typeof result.entryId === 'number' ? kbRef(result.publicId ?? null, result.entryId) : 'The entry';
  if (outcome.kind === 'expired') {
    return (
      <Alert variant="warning">
        Nothing was changed — this suggestion expired.{result.reason ? ` ${result.reason}` : ''}
      </Alert>
    );
  }
  if (outcome.kind === 'unknown') {
    // A status this UI does not know: never claimed as done — the list says what is true.
    return <Alert variant="warning">The server answered in a way this page does not recognise. Reload to see the entry’s current state.</Alert>;
  }
  if (outcome.kind === 'rejected') {
    return (
      <Alert variant="success">
        {name} was removed — out of every answer now, deleted after {REJECTED_RETENTION_DAYS} days
        (approve it in the knowledge base before then to bring it back).
      </Alert>
    );
  }
  return (
    <Alert variant="success">
      {name} was rewritten and approved.
      {result.redactions ? ' Contact details were removed from the saved text — check it in the knowledge base.' : ''}
    </Alert>
  );
};
