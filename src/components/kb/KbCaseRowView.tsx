import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { kbMergeReviewHref } from '@/components/layout/KbReviewSection';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { caseHref, kbRef } from '@/lib/kbConsolidation';
import type { KbCaseRow } from '@/services/kbConsolidation.service';

/** One row of the KB cases report (a case, a proposal, a group or a single answer). */
export const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export const rowTitle = (row: KbCaseRow): string => {
  if (row.kind === 'case')
    return `Case ${row.caseId !== null ? kbRef(row.casePublicId, row.caseId) : '#?'}`;
  if (row.title) return row.title;
  return row.kind === 'single' ? 'single learned answer' : row.kind;
};

/** The entries a row stands for: a case lists its own entry first, then its originals. */
export const rowEntryIds = (row: KbCaseRow): number[] =>
  row.kind === 'case' && row.caseId !== null
    ? [row.caseId, ...row.entryIds.filter((id) => id !== row.caseId)]
    : row.entryIds;

/** Entries a pending suggestion proposes for this case (not members yet). */
export const proposalIds = (row: KbCaseRow): number[] =>
  row.kind === 'case'
    ? Array.isArray(row.pendingAttachIds)
      ? row.pendingAttachIds
      : (row.pendingAttach ?? []).map((item) => item.entryId)
    : [];

/**
 * How many learned entries a row holds (a case's own entry is not one of them, nor an entry only
 * PROPOSED for it). A case counts its live members as the server does when it says.
 */
export const memberCount = (row: KbCaseRow): number => {
  if (row.kind === 'case' && Number.isInteger(row.memberCount)) return row.memberCount as number;
  const proposed = new Set(proposalIds(row));
  return row.entryIds.filter(
    (id) => (row.kind !== 'case' || id !== row.caseId) && !proposed.has(id)
  ).length;
};

/**
 * How many conversations a row's answers came from. When there are more answers than
 * conversations (two answers learned from one thread), both are named — "1 conversation" next to
 * "Show entries (2)" read as a miscount.
 */
export const conversationsText = (answers: number, conversations: number): string =>
  answers > conversations
    ? `${plural(answers, 'answer', 'answers')} from ${plural(conversations, 'conversation', 'conversations')}`
    : plural(conversations, 'conversation', 'conversations');

export type KbRowExpansion = {
  open: boolean;
  onToggle: () => void;
  /** The entries, rendered only while open. */
  panel: React.ReactNode;
};

export const KbCaseRowView = ({
  row,
  expansion,
}: {
  row: KbCaseRow;
  /** Absent on an older backend (no rows route): the row cannot be opened. */
  expansion?: KbRowExpansion;
}) => {
  const isCase = row.kind === 'case';
  const questions = isCase ? (row.question ? [row.question] : []) : (row.questions ?? []);
  const panelId = useId();
  const members = memberCount(row);
  const proposals = proposalIds(row).length;
  return (
    <li
      className="p-3 space-y-2 rounded-lg border border-border"
      data-testid={`case-row-${row.kind}`}
    >
      <div className="flex flex-wrap gap-2 items-center">
        {isCase && row.caseId !== null ? (
          <Link to={caseHref(row.caseId)} className="font-medium text-primary hover:underline">
            {rowTitle(row)}
          </Link>
        ) : (
          <span className="font-medium">{rowTitle(row)}</span>
        )}
        {row.kind === 'proposed' && (
          <Link
            to={kbMergeReviewHref(row.suggestionId)}
            className="text-xs text-primary hover:underline"
          >
            Review
          </Link>
        )}
        {row.source && <Badge variant="secondary">{row.source}</Badge>}
      </div>
      {questions.length > 0 && (
        <ul className="space-y-0.5 text-sm list-disc list-inside" aria-label="Questions">
          {questions.map((question, index) => (
            <li key={index} className="break-words">
              {question}
            </li>
          ))}
        </ul>
      )}
      {isCase ? (
        <div className="text-sm">
          <span className="text-muted-foreground">Standard answer: </span>
          <span className="whitespace-pre-wrap break-words">{row.standardAnswer ?? '—'}</span>
        </div>
      ) : row.kind === 'proposed' ? (
        // The proposal carries a drafted standard answer: it waits in the review, not nowhere.
        <p className="text-sm italic text-muted-foreground">
          Standard answer drafted — waiting for review
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">no standard answer yet</p>
      )}
      <p className="text-xs text-muted-foreground">
        {conversationsText(members, row.conversations)} ·{' '}
        {plural(row.customers, 'customer', 'customers')} · first seen {formatDate(row.firstSeen)} ·
        last seen {formatDate(row.lastSeen)}
      </p>
      {expansion && (isCase ? row.caseId !== null : members > 0) && (
        <>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={expansion.open}
            aria-controls={panelId}
            onClick={expansion.onToggle}
          >
            {expansion.open ? (
              <ChevronDown className="mr-1 w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="mr-1 w-4 h-4" aria-hidden="true" />
            )}
            {expansion.open
              ? 'Collapse'
              : members > 0 || proposals > 0
                ? `Show entries (${members}${proposals > 0 ? `, ${proposals} proposed` : ''})`
                : 'Show the case entry'}
          </Button>
          <div id={panelId} hidden={!expansion.open} className="pl-2 sm:pl-4">
            {expansion.open && expansion.panel}
          </div>
        </>
      )}
    </li>
  );
};
