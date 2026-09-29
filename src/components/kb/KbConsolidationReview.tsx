import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Check, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { usePermissions } from '@/hooks/usePermissions';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { announceKbConsolidationDecided, kbRef } from '@/lib/kbConsolidation';
import {
  kbConsolidationService,
  type KbConsolidationAcceptResult,
  type KbConsolidationDetail,
  type KbConsolidationMember,
} from '@/services/kbConsolidation.service';
import { Permission } from '@/types/roles';

type LiveMember = Extract<KbConsolidationMember, { gone: false }>;

/** Why a member cannot be part of this decision, or null when it can. */
export const whyMemberExcluded = (member: KbConsolidationMember): string | null => {
  if (member.gone) return 'deleted since proposed — will be left out';
  if (member.editedSinceProposed) return 'edited since proposed — will be left out';
  if (!member.stillEligible) return 'no longer in the knowledge base as it was — will be left out';
  return null;
};

/** "#KB-4" — named as the KB list names it. */
const memberName = (member: { id: number; publicId?: string | null }) =>
  kbRef(member.publicId, member.id);

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

export type KbConsolidationOutcome =
  | {
      kind: 'accepted' | 'expired';
      type: KbConsolidationDetail['type'];
      result: KbConsolidationAcceptResult;
      /** The dropped members, named as the list names them ("#KB-4"). */
      droppedRefs: string[];
    }
  | { kind: 'declined'; type: KbConsolidationDetail['type'] };

type Props = {
  suggestionId: number;
  /** Called once the server has taken the decision (never on a failure). */
  onDecided?: (outcome: KbConsolidationOutcome) => void;
};

/**
 * Review a proposed KB merge (consolidate) or a proposal to add entries to an existing case
 * (attach), side by side, before anything is written.
 *
 * ⛔ The moderator decides WHAT is merged: members can be unticked, the merged text edited, and
 * no file rides along unless it is ticked (an invoice from one thread must never end up in a
 * shared answer). A member whose text changed since the proposal is shown but cannot be ticked
 * — the server drops it at accept anyway, and a tick would promise something it will not do.
 */
export const KbConsolidationReview = ({ suggestionId, onDecided }: Props) => {
  const { hasPermission, isOrgAdmin } = usePermissions();
  const allowed = isOrgAdmin || hasPermission(Permission.MANAGE_KNOWLEDGE_BASE);

  const [detail, setDetail] = useState<KbConsolidationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [keptFiles, setKeptFiles] = useState<Set<number>>(new Set());
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [replaceCaseAnswer, setReplaceCaseAnswer] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<KbConsolidationOutcome | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await kbConsolidationService.getMembers(suggestionId);
      setDetail(data);
      setTicked(
        new Set(
          data.members
            .filter((member) => whyMemberExcluded(member) === null)
            .map((member) => member.id)
        )
      );
      setKeptFiles(new Set());
      setQuestion(data.proposed?.question ?? '');
      setAnswer(
        data.type === 'consolidate'
          ? (data.proposed?.answer ?? '')
          : (data.proposedAnswer ?? data.case?.answer ?? '')
      );
      setReplaceCaseAnswer(false);
    } catch (err) {
      setLoadError(getApiErrorMessage(err) ?? 'Could not load this proposal.');
    }
  }, [suggestionId]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const liveMembers = useMemo(
    () => (detail?.members ?? []).filter((member): member is LiveMember => !member.gone),
    [detail]
  );

  if (!allowed) return null;
  if (loadError) return <Alert variant="danger">{loadError}</Alert>;
  if (!detail) {
    return (
      <div className="flex justify-center py-6" role="status" aria-busy="true">
        <Spinner />
      </div>
    );
  }

  const isConsolidate = detail.type === 'consolidate';
  // Conflicts and the accept result carry row ids; show each member as the list shows it.
  // (Judge-dropped entries are not members; the backend sends their public id with them.)
  const nameOf = (id: number) => memberName(liveMembers.find((row) => row.id === id) ?? { id });
  const minTicked = isConsolidate ? 2 : 1;
  const conflicts = detail.conflicts ?? [];
  const judgeDropped = detail.judgeDropped ?? [];
  const metrics = detail.metrics ?? {};
  const pending = detail.status === 'pending';

  const toggleMember = (id: number, on: boolean) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    if (!on) {
      // Only files of TICKED members may be kept: an unticked member's files go with it.
      const member = liveMembers.find((row) => row.id === id);
      setKeptFiles((prev) => {
        const next = new Set(prev);
        for (const file of member?.attachments ?? []) next.delete(file.id);
        return next;
      });
    }
  };

  const toggleFile = (id: number, on: boolean) =>
    setKeptFiles((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const tickedIds = detail.members.map((member) => member.id).filter((id) => ticked.has(id));
  const tooFew = tickedIds.length < minTicked;
  const textMissing = isConsolidate && (!question.trim() || !answer.trim());
  const acceptBlockedReason = !detail.canDecide
    ? 'You can see this proposal, but deciding it needs knowledge-base permission for every department this mailbox serves. Ask an admin.'
    : tooFew
      ? isConsolidate
        ? 'Tick at least two entries to merge.'
        : 'Tick at least one entry to add to the case.'
      : textMissing
        ? 'The merged entry needs both a question and an answer.'
        : null;

  const handleAccept = async () => {
    setActing(true);
    setActionError(null);
    try {
      const attachmentIds = [...keptFiles];
      const body = isConsolidate
        ? { question: question.trim(), answer: answer.trim(), memberIds: tickedIds, attachmentIds }
        : {
            memberIds: tickedIds,
            attachmentIds,
            ...(replaceCaseAnswer && answer.trim() ? { answer: answer.trim() } : {}),
          };
      const result = await kbConsolidationService.accept(detail.suggestionId, body);
      const next: KbConsolidationOutcome = {
        kind: result.status === 'expired' ? 'expired' : 'accepted',
        type: detail.type,
        result,
        droppedRefs: (result.dropped ?? []).map(nameOf),
      };
      setOutcome(next);
      announceKbConsolidationDecided();
      onDecided?.(next);
    } catch (err) {
      setActionError(getApiErrorMessage(err) ?? 'Could not accept — try again.');
    } finally {
      setActing(false);
    }
  };

  const handleDecline = async () => {
    setActing(true);
    setActionError(null);
    try {
      await kbConsolidationService.decline(detail.suggestionId);
      const next: KbConsolidationOutcome = { kind: 'declined', type: detail.type };
      setOutcome(next);
      announceKbConsolidationDecided();
      onDecided?.(next);
    } catch (err) {
      setActionError(getApiErrorMessage(err) ?? 'Could not decline — try again.');
    } finally {
      setActing(false);
    }
  };

  if (outcome) return <KbConsolidationOutcomeNotice outcome={outcome} />;

  return (
    <div className="space-y-4 text-sm" data-testid="kb-consolidation-review">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="font-medium">
          {isConsolidate
            ? 'Proposed: merge these answers into one case'
            : detail.case
              ? `Proposed: add these entries to case ${memberName(detail.case)}`
              : 'Proposed: add these entries to a case that no longer exists'}
        </span>
        {detail.label && <Badge variant="secondary">{detail.label}</Badge>}
        {detail.language && <Badge variant="secondary">{detail.language}</Badge>}
        {metrics.sameThread && <Badge variant="warning">same thread</Badge>}
        {typeof metrics.customers === 'number' && (
          <Badge variant="secondary">
            {metrics.customers === 1 ? '1 customer' : `${metrics.customers} customers`}
          </Badge>
        )}
        {typeof metrics.conversations === 'number' && (
          <Badge variant="secondary">
            {metrics.conversations === 1
              ? '1 conversation'
              : `${metrics.conversations} conversations`}
          </Badge>
        )}
      </div>

      {metrics.sameThread && (
        <p className="text-xs text-muted-foreground">
          All of these come from the same thread — they may be one conversation saved twice rather
          than a question customers keep asking.
        </p>
      )}

      {detail.rationale && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Why the AI proposed it: </span>
          {detail.rationale}
        </p>
      )}

      {conflicts.length > 0 && (
        <Alert variant="warning">
          <p className="font-medium">The AI found answers that disagree</p>
          <ul className="mt-1 space-y-1 list-disc list-inside" aria-label="Conflicts">
            {conflicts.map((conflict, index) => (
              <li key={index}>
                {conflict.summary}
                {conflict.memberIds.length > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    ({conflict.memberIds.map(nameOf).join(', ')})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Members, side by side */}
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Entries in this proposal">
        {detail.members.map((member) => {
          const excluded = whyMemberExcluded(member);
          const isTicked = ticked.has(member.id);
          return (
            <li
              key={member.id}
              className="p-3 space-y-2 rounded-lg border border-border bg-background"
              data-testid={`member-${member.id}`}
            >
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <Checkbox
                  label={`Include ${memberName(member.gone ? { id: member.id } : member)}`}
                  checked={isTicked}
                  disabled={excluded !== null || !pending}
                  onChange={(event) => toggleMember(member.id, event.target.checked)}
                />
                {!member.gone && member.covered && (
                  // `covered` (members route): a declined or unmerged verdict for this target
                  // covers this entry OR its conversation. A consolidate's target is its group
                  // (label + language), an attach's the case. Shown, not enforced.
                  <Badge
                    variant="warning"
                    title={`A moderator declined or unmerged this entry, or another entry from its conversation, ${isConsolidate ? 'for this group' : 'for this case'} before — ticking it overrides that.`}
                  >
                    declined before (this entry or its conversation)
                  </Badge>
                )}
                {!member.gone && member.alreadyCounted && (
                  <Badge
                    variant="secondary"
                    title="Its conversation is already counted in this case — adding it changes no count."
                  >
                    already counted
                  </Badge>
                )}
              </div>
              {excluded && (
                <Badge variant="warning" className="whitespace-normal">
                  {excluded}
                </Badge>
              )}
              {!member.gone && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Question</p>
                    <p className="whitespace-pre-wrap break-words">{member.question ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Answer</p>
                    <p className="whitespace-pre-wrap break-words">{member.answer ?? '—'}</p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(member.date)}</span>
                    {member.conversationId !== null && (
                      <Link
                        to={`/messages?id=${member.conversationId}`}
                        className="text-primary hover:underline"
                      >
                        Thread {member.conversationPublicId ?? `#${member.conversationId}`}
                      </Link>
                    )}
                    {!member.approved && <span>not approved</span>}
                  </div>
                  {member.attachments.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Files — none is kept unless you tick it
                      </p>
                      {member.attachments.map((file) => (
                        <Checkbox
                          key={file.id}
                          label={`Keep ${file.filename ?? `file #${file.id}`}`}
                          checked={keptFiles.has(file.id)}
                          disabled={!isTicked || !pending}
                          onChange={(event) => toggleFile(file.id, event.target.checked)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {judgeDropped.length > 0 && (
        <div>
          <p className="font-medium">Left out by the AI (not part of this proposal)</p>
          <ul className="mt-1 space-y-1 text-muted-foreground" aria-label="Left out by the AI">
            {judgeDropped.map((row) => (
              <li key={row.id}>
                {kbRef(row.publicId, row.id)} — {row.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The case / the merged entry */}
      {isConsolidate ? (
        <div className="p-3 space-y-3 rounded-lg border border-border">
          <div className="flex gap-2 items-center">
            <span className="font-medium">The merged entry</span>
            <Badge
              variant="secondary"
              className="gap-1"
              title="Written by AI from the entries above — read and edit it before accepting."
            >
              <Bot className="w-3 h-3" />
              AI-drafted
            </Badge>
          </div>
          <div>
            <Label htmlFor={`merge-q-${detail.suggestionId}`}>Question</Label>
            <Input
              id={`merge-q-${detail.suggestionId}`}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={!pending}
            />
          </div>
          <div>
            <Label htmlFor={`merge-a-${detail.suggestionId}`}>Answer</Label>
            <Textarea
              id={`merge-a-${detail.suggestionId}`}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={6}
              disabled={!pending}
            />
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-3 rounded-lg border border-border">
          <p className="font-medium">
            Case {detail.case ? memberName(detail.case) : '(removed)'} — its standard answer
          </p>
          {detail.case ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Question</p>
                <p className="whitespace-pre-wrap break-words">{detail.case.question ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Answer</p>
                <p className="whitespace-pre-wrap break-words">{detail.case.answer ?? '—'}</p>
              </div>
              {detail.case.editedSinceProposed && (
                <Alert variant="warning">
                  The case was edited since this was proposed. A refreshed answer sent now will be
                  discarded — the entries can still be added.
                </Alert>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">This case no longer exists.</p>
          )}
          <Checkbox
            label="Also replace the case's answer with the one below"
            checked={replaceCaseAnswer}
            disabled={!pending}
            onChange={(event) => setReplaceCaseAnswer(event.target.checked)}
          />
          <div>
            <div className="flex gap-2 items-center">
              <Label htmlFor={`attach-a-${detail.suggestionId}`}>Refreshed answer (optional)</Label>
              {detail.proposedAnswer && (
                <Badge variant="secondary" className="gap-1">
                  <Bot className="w-3 h-3" />
                  AI-drafted
                </Badge>
              )}
            </div>
            <Textarea
              id={`attach-a-${detail.suggestionId}`}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={5}
              disabled={!pending || !replaceCaseAnswer}
            />
          </div>
        </div>
      )}

      {!pending && (
        <Alert>
          This proposal is no longer pending ({detail.status}). Nothing can be decided here.
        </Alert>
      )}
      {actionError && <Alert variant="danger">{actionError}</Alert>}
      {pending && acceptBlockedReason && (
        <p className="text-xs text-muted-foreground" data-testid="accept-blocked-reason">
          {acceptBlockedReason}
        </p>
      )}
      {pending && (
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => void handleDecline()}
            disabled={acting || !detail.canDecide}
            title={
              detail.canDecide
                ? 'Not one case — stop proposing this group'
                : (acceptBlockedReason ?? '')
            }
          >
            <X className="mr-1 w-4 h-4" />
            Decline
          </Button>
          <Button
            onClick={() => void handleAccept()}
            disabled={acting || acceptBlockedReason !== null}
            isLoading={acting}
          >
            <Check className="mr-1 w-4 h-4" />
            {isConsolidate ? 'Accept merge' : 'Add to case'}
          </Button>
        </div>
      )}
    </div>
  );
};

/** What came of a decision — shown in place of the review, and by the inbox after it reloads. */
export const KbConsolidationOutcomeNotice = ({ outcome }: { outcome: KbConsolidationOutcome }) => {
  const isConsolidate = outcome.type === 'consolidate';
  if (outcome.kind === 'declined') {
    return (
      <Alert>
        Declined. These entries will not be proposed together again unless new ones arrive.
      </Alert>
    );
  }
  const { result } = outcome;
  if (outcome.kind === 'expired') {
    return (
      <Alert variant="warning">
        Nothing was changed — this proposal expired.{result.reason ? ` ${result.reason}` : ''}
      </Alert>
    );
  }
  const dropped = outcome.droppedRefs;
  const caseName =
    typeof result.caseId === 'number' ? kbRef(result.casePublicId, result.caseId) : '#?';
  return (
    <Alert variant="success">
      <p>
        {isConsolidate ? `Merged into case ${caseName}` : `Added to case ${caseName}`}
        {typeof result.linked === 'number'
          ? ` — ${result.linked} ${result.linked === 1 ? 'entry' : 'entries'} linked.`
          : '.'}
      </p>
      {dropped.length > 0 && (
        <p>
          {/* The backend drops an entry for several reasons (edited, gone, under an open capture
              review, scope changed) — so no single cause is claimed. */}
          {dropped.length === 1
            ? '1 entry was left out — it changed or can no longer be merged'
            : `${dropped.length} entries were left out — they changed or can no longer be merged`}{' '}
          ({dropped.join(', ')}).
        </p>
      )}
      {result.answerDiscarded && (
        <p>
          {/* Discarded when the case changed OR when the answer could not be indexed — no cause. */}
          Your answer text was not saved — the case keeps its current answer.
        </p>
      )}
    </Alert>
  );
};

/**
 * "Merge N similar answers" / "Add N entries to a case" — the inbox's one-line summary. The
 * suggestion payload names the case only by row id, and "#900" next to a list that says
 * "#KB-900" reads as a different case — so the case is named in the review, not here.
 */
export const summarizeKbMerge = (payload: Record<string, unknown>, type: string): string => {
  const label = typeof payload.label === 'string' && payload.label ? ` “${payload.label}”` : '';
  const size = Array.isArray(payload.memberIds) ? payload.memberIds.length : null;
  const count = size !== null ? `${size} ` : '';
  if (type === 'consolidate')
    return `Merge ${count}similar knowledge base answers${label} into one case`;
  return `Add ${count}${size === 1 ? 'entry' : 'entries'} to a case${label}`;
};
