/**
 * Engine Activity cards for routing proposals (spec 2026-10-14 §4.3): a single-department proposal,
 * a "pick one department" disagreement, and the one-time "Keep this learned rule?" review. Evidence
 * (conversations, agents, replay, auto-accept readiness) comes from the evidence endpoint; an older
 * backend sends none and the card shows the payload only.
 *
 * Dates may be missing on any row (a support entry without a time): the card then names no date —
 * never "Invalid Date" or the epoch. Support counts are WEIGHTED (a bulk route counts less than 1),
 * so a fractional count reads "about N". Only a propose_rule card can say it would be auto-accepted:
 * disagreement and confirm cards are always a person's call.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import {
  learningService,
  type LearningSuggestion,
  type ProposalDepartmentEvidence,
  type ReplaySummary,
  type RoutingProposalEvidence,
} from '@/services/learning.service';
import { routingRuleService, type RoutingRuleType } from '@/services/routingRule.service';

/** Same words as the BE card summary (routingProposals.ts RULE_TYPE_WORDS). */
export const RULE_TYPE_WORDS: Record<string, string> = {
  subject_contains: 'in the subject',
  body_contains: 'in the message',
};

/** BE `PROPOSAL_DECLINE_REASON_MAX_LENGTH` (routingConstants.ts) — the server keeps no more. */
const DECLINE_REASON_MAX = 500;
const DAY_MS = 86_400_000;
const FALLBACK_ERROR = 'That did not work. Please try again.';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** A weighted count as a person reads it: whole numbers as they are, fractions as "about N". */
const countText = (count: number): string =>
  Number.isInteger(count) ? String(count) : `about ${Math.max(1, Math.round(count))}`;

const ruleTypeWords = (ruleType: string | undefined): string =>
  RULE_TYPE_WORDS[ruleType ?? ''] ?? `(${(ruleType ?? '').replace(/_/g, ' ')})`;

/** A short date, or null when there is none to show. */
const shortDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export const supportLine = (dept: ProposalDepartmentEvidence): string => {
  const count = countText(dept.supportCount);
  const times = `Routed there by your team ${count} time${dept.supportCount === 1 ? '' : 's'}`;
  if (dept.agents <= 0) return times;
  const agents = plural(dept.agents, 'agent');
  const first = dept.firstAt ? Date.parse(dept.firstAt) : NaN;
  const last = dept.lastAt ? Date.parse(dept.lastAt) : NaN;
  if (!Number.isFinite(first) || !Number.isFinite(last)) return `${times} — ${agents}`;
  const days = Math.max(1, Math.round((last - first) / DAY_MS));
  return `${times} — ${agents} over ${plural(days, 'day')}`;
};

export const replayLine = (replay: ReplaySummary, deptName: string): string => {
  const lookback = `in the last ${plural(replay.lookbackDays, 'day')}`;
  const skipped = replay.skipped > 0 ? `; ${replay.skipped} could not be checked` : '';
  if (replay.matches === 0) return `Would have matched no conversations ${lookback}${skipped}`;
  const matched = `${replay.truncated ? 'at least ' : ''}${plural(replay.matches, 'conversation')}`;
  const share = replay.ratio === null ? '' : ` (${Math.round(replay.ratio * 100)} %)`;
  return `Would have matched ${matched} ${lookback}; ${replay.inDepartment} went to ${deptName}${share}${skipped}`;
};

const BADGE: Record<
  NonNullable<ReplaySummary['recommendation']>,
  { label: string; variant: 'success' | 'warning' | 'danger' }
> = {
  recommended: { label: 'Recommended', variant: 'success' },
  review: { label: 'Review', variant: 'warning' },
  not_recommended: { label: 'Not recommended', variant: 'danger' },
};

type Option = { departmentId: number; ruleId: number; supportCount: number };
type Payload = {
  ruleId?: number;
  siblingRuleId?: number | null;
  departmentId?: number;
  ruleType?: string;
  value?: string;
  options?: Option[];
};

/** Only well-formed options: a malformed one would render a button that can never be accepted. */
const optionsOf = (payload: Payload): Option[] =>
  Array.isArray(payload.options)
    ? payload.options.filter(
        (option): option is Option =>
          !!option &&
          typeof option.departmentId === 'number' &&
          typeof option.ruleId === 'number' &&
          typeof option.supportCount === 'number'
      )
    : [];

type NameOf = (id: number) => string | undefined;
const labelOf = (deptNameById: NameOf, id: number) => deptNameById(id) ?? `department #${id}`;

const Evidence = ({ dept, deptNameById }: { dept: ProposalDepartmentEvidence; deptNameById: NameOf }) => {
  const name = labelOf(deptNameById, dept.departmentId);
  return (
    <div className="mt-2 min-w-0 space-y-1 text-xs text-muted-foreground">
      {dept.supportCount > 0 && <p>{supportLine(dept)}</p>}
      {dept.replay && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 break-words">{replayLine(dept.replay, name)}</span>
          {dept.replay.recommendation && (
            <Badge size="sm" variant={BADGE[dept.replay.recommendation].variant}>
              {BADGE[dept.replay.recommendation].label}
            </Badge>
          )}
        </div>
      )}
      {dept.warnOverlap && (
        <p className="text-warning">
          {`At proposal time: similar to an active rule in ${labelOf(deptNameById, dept.warnOverlap.departmentId)} (${Math.round(dept.warnOverlap.similarity * 100)} % similar). Accept checks again.`}
        </p>
      )}
      {dept.contradictions.map((entry) => (
        <p key={entry.departmentId}>
          {`also routed to ${labelOf(deptNameById, entry.departmentId)} ×${entry.count}`}
        </p>
      ))}
      {dept.conversations.length > 0 && (
        <ul className="space-y-0.5">
          {dept.conversations.map((conv) => {
            const meta = [conv.routedBy?.name, shortDate(conv.routedAt)].filter(Boolean).join(', ');
            return (
              <li key={conv.conversationId} className="break-words">
                <Link to={`/messages/${conv.conversationId}`} className="text-primary hover:underline">
                  {`${conv.publicId ?? `#${conv.conversationId}`} · ${conv.subject ?? '(no subject)'}`}
                </Link>
                {meta && <span>{` — ${meta}`}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {dept.redactedCount > 0 && <p>{`+${dept.redactedCount} in departments you can’t see`}</p>}
    </div>
  );
};

export const RoutingProposalCard = ({
  suggestion,
  deptNameById,
  canAct,
  onDone,
  onError,
  onStale,
}: {
  suggestion: LearningSuggestion;
  deptNameById: NameOf;
  canAct: boolean;
  onDone: (id: number) => void;
  onError: (message: string) => void;
  onStale: () => void;
}) => {
  const payload = (suggestion.payload ?? {}) as Payload;
  const ruleId = typeof payload.ruleId === 'number' ? payload.ruleId : undefined;
  const siblingRuleId = typeof payload.siblingRuleId === 'number' ? payload.siblingRuleId : undefined;
  const [evidence, setEvidence] = useState<RoutingProposalEvidence | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // A second click before the re-render must not send a second decision.
  const inFlight = useRef(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(payload.value ?? '');
  const [draftType, setDraftType] = useState(payload.ruleType ?? 'body_contains');

  useEffect(() => {
    let live = true;
    learningService
      .getSuggestionEvidence(suggestion.id)
      .then((res) => {
        if (live) setEvidence(res.proposal ?? null);
      })
      .catch(() => {
        if (live) setEvidence(null);
      });
    return () => {
      live = false;
    };
  }, [suggestion.id]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(key);
    try {
      await action();
      onDone(suggestion.id);
    } catch (err) {
      onError(getApiErrorMessage(err) ?? FALLBACK_ERROR);
      // 409 = the card is stale or already decided (BE routingProposalActions.ts): reload the list.
      if (getErrorStatus(err) === 409) onStale();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };
  const accept = (key: string, departmentId?: number) =>
    run(key, () =>
      departmentId !== undefined
        ? learningService.acceptSuggestion(suggestion.id, { departmentId })
        : learningService.acceptSuggestion(suggestion.id)
    );
  const decline = (key: string, why?: string) =>
    run(key, () => learningService.declineSuggestion(suggestion.id, why));

  const deptName = (id: number | undefined) => (id === undefined ? 'a department' : labelOf(deptNameById, id));
  const evidenceFor = (id: number | undefined) =>
    id === undefined ? undefined : evidence?.departments.find((dept) => dept.ruleId === id);
  const locked = busy !== null || !canAct;
  const actionButton = (
    key: string,
    label: string,
    onClick: () => void,
    variant?: 'outline',
    blocked = false
  ) => (
    <Button
      key={key}
      size="sm"
      variant={variant}
      isLoading={busy === key}
      // Explicit `disabled` replaces Button's own isLoading lock, so `locked` covers busy too.
      disabled={locked || blocked}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  if (suggestion.suggestionType === 'resolve_routing_disagreement') {
    const options = optionsOf(payload);
    return (
      <div className="min-w-0 space-y-2 p-3">
        <p className="break-words text-sm font-medium">{`Agents disagree where "${payload.value ?? ''}" mail goes`}</p>
        {options.map((option) => {
          const dept = evidenceFor(option.ruleId);
          return (
            <div key={option.ruleId} className="min-w-0 rounded-md border border-border/60 p-2">
              <p className="text-xs font-medium">
                {`${deptName(option.departmentId)} — ${countText(option.supportCount)} conversation${option.supportCount === 1 ? '' : 's'}`}
              </p>
              {dept && <Evidence dept={dept} deptNameById={deptNameById} />}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          {options.map((option) =>
            actionButton(`pick-${option.departmentId}`, deptName(option.departmentId), () =>
              void accept(`pick-${option.departmentId}`, option.departmentId)
            )
          )}
          {actionButton('neither', 'Neither', () => void decline('neither'), 'outline')}
        </div>
      </div>
    );
  }

  if (suggestion.suggestionType === 'confirm_learned_rule') {
    const dept = evidenceFor(ruleId);
    return (
      <div className="min-w-0 space-y-2 p-3">
        <p className="text-sm font-medium">Keep this learned rule?</p>
        <p className="break-words text-xs text-muted-foreground">
          {`Mail mentioning "${payload.value ?? ''}" ${ruleTypeWords(payload.ruleType)} routes to ${deptName(payload.departmentId)}. It keeps routing until you decide.`}
        </p>
        {dept && <Evidence dept={dept} deptNameById={deptNameById} />}
        <div className="flex flex-wrap gap-2">
          {actionButton('keep', 'Keep', () => void accept('keep'))}
          {actionButton('switch-off', 'Switch off', () => void decline('switch-off'), 'outline')}
        </div>
      </div>
    );
  }

  const dept = evidenceFor(ruleId);
  // A subject/body pair is one proposal: one PATCH to the anchor moves both keywords (BE, one transaction); no type change.
  const canChooseType =
    siblingRuleId === undefined && (draftType === 'body_contains' || draftType === 'subject_contains');
  const saveAndAccept = () =>
    run('save', async () => {
      if (ruleId === undefined) return;
      const value = draftValue.trim();
      // The card never moves a rule: departmentId is not sent (a stale payload would move it back).
      await routingRuleService.update(
        ruleId,
        canChooseType ? { value, type: draftType as RoutingRuleType } : { value }
      );
      await learningService.acceptSuggestion(suggestion.id);
    });

  return (
    <div className="min-w-0 space-y-2 p-3">
      <p className="break-words text-sm font-medium">
        {`Route mail mentioning "${payload.value ?? ''}" ${ruleTypeWords(payload.ruleType)} to ${deptName(payload.departmentId)}`}
      </p>
      {dept && <Evidence dept={dept} deptNameById={deptNameById} />}
      {evidence?.autoAccept.mode === 'manual' && evidence.autoAccept.eligibleInBalanced && (
        <p className="text-xs text-muted-foreground">Would be accepted automatically in Balanced mode</p>
      )}
      {editing && ruleId !== undefined && (
        <div className="space-y-2 rounded-md border border-border/60 p-2">
          <Input
            id={`proposal-keyword-${suggestion.id}`}
            label="Keyword"
            size="sm"
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
          />
          {canChooseType && (
            <Select
              label="Where to look"
              size="sm"
              value={draftType}
              onChange={(value) => setDraftType(value)}
              options={[
                { value: 'body_contains', label: 'In the message' },
                { value: 'subject_contains', label: 'In the subject' },
              ]}
            />
          )}
          {actionButton('save', 'Save and accept', () => void saveAndAccept(), undefined, !draftValue.trim())}
        </div>
      )}
      {declining && (
        <div className="space-y-2">
          <Textarea
            id={`proposal-decline-${suggestion.id}`}
            label="Reason (optional)"
            rows={2}
            maxLength={DECLINE_REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {actionButton(
            'decline',
            'Confirm decline',
            () => void decline('decline', reason.trim() || undefined),
            'outline'
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {actionButton('accept', 'Accept', () => void accept('accept'))}
        {ruleId !== undefined &&
          actionButton('edit', 'Edit', () => setEditing((open) => !open), 'outline')}
        {actionButton('toggle-decline', 'Decline', () => setDeclining((open) => !open), 'outline')}
      </div>
    </div>
  );
};
