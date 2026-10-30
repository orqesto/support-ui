import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { KB_FILTER_STATUS_LABEL, type KbFilterStatus } from '@/components/kb/KbStatusFilter';
import { useKbStatusParam } from '@/hooks/useKbStatusParam';
import { kbFindingFromSearch, withoutKbFinding } from '@/lib/kbFinding';
import type { KbIdMatch } from '@/services/kb.service';

/** The list's type tabs that hold entries (the Documentation tab is settings). */
export type KbListTab = 'all' | 'qa_pair' | 'document';
const TAB_LABEL: Record<KbListTab, string> = {
  all: 'All types',
  qa_pair: 'Q&A pairs',
  document: 'Documents',
};

/** The view the list is showing: its status filter, type tab, source filter, and finding. */
export type KbListView = {
  status: KbFilterStatus;
  tab: KbListTab;
  /** MessageSourceFilter's value: 'all', 'none' (no mailbox) or a source id. */
  source: string;
  finding: boolean;
};

/** The view that shows the matched entry: what "Show KB-134" switches to. */
export type KbIdMatchTarget = {
  status: KbFilterStatus;
  tab: KbListTab;
  clearSource: boolean;
  clearFinding: boolean;
};

/**
 * What to say when the entry a search names by number is in the workspace but this view's
 * filters hide it ("KB-134 is in Pending"), and the view that shows it; null when there is no
 * such entry or this view already lists it.
 */
export const kbIdMatchHint = (
  match: KbIdMatch | null,
  view: KbListView
): { text: string; label: string; target: KbIdMatchTarget } | null => {
  if (!match || match.inResults) return null;
  const name = match.publicId ?? `#${match.id}`;
  const statusHides = view.status !== 'all' && view.status !== match.status;
  // A manual entry has no tab of its own: only All lists it.
  const entryTab: KbListTab = match.type === 'manual_entry' ? 'all' : match.type;
  const tabHides = view.tab !== 'all' && view.tab !== entryTab;
  const entrySource = match.messageSourceId === null ? 'none' : String(match.messageSourceId);
  const sourceHides = view.source !== 'all' && view.source !== entrySource;
  const text = statusHides
    ? `${name} is under “${KB_FILTER_STATUS_LABEL[match.status]}”`
    : tabHides
      ? `${name} is under “${TAB_LABEL[entryTab]}”`
      : sourceHides
        ? `${name} is from another source`
        : view.finding
          ? `${name} is not part of this finding`
          : `${name} is not in this view`;
  return {
    text,
    label: `Show ${name}`,
    target: {
      status: statusHides ? match.status : view.status,
      tab: tabHides ? entryTab : view.tab,
      clearSource: sourceHides,
      clearFinding: view.finding,
    },
  };
};

/**
 * "KB-134 is under “Not live yet” — Show KB-134": the hint above the list when the entry the search names
 * by number is hidden by this view's filters. Show is ONE navigation (the status lives in
 * `?status=`, the tab in the hash) that keeps the search, so the entry is then the first row.
 */
export const KbIdMatchHint = ({
  match,
  tab,
  source,
  onClearSource,
}: {
  match: KbIdMatch | null;
  tab: KbListTab;
  source: string;
  onClearSource: () => void;
}) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status] = useKbStatusParam('live');
  const finding = kbFindingFromSearch(searchParams) !== null;
  const hint = kbIdMatchHint(match, { status, tab, source, finding });
  if (!hint) return null;
  const show = ({
    status: nextStatus,
    tab: nextTab,
    clearSource,
    clearFinding,
  }: KbIdMatchTarget) => {
    const params = new URLSearchParams(
      clearFinding ? withoutKbFinding(searchParams) : searchParams
    );
    if (nextStatus === 'all') params.delete('status');
    else params.set('status', nextStatus);
    // The hint is on Live answers; a question status alone would open the Questions view.
    params.set('view', 'live');
    navigate({ search: params.toString(), hash: nextTab }, { replace: !clearFinding });
    if (clearSource) onClearSource();
  };
  return (
    <Alert variant="info" className="flex flex-wrap gap-3 justify-between items-center">
      <span className="text-sm">{hint.text}</span>
      <Button size="sm" variant="outline" onClick={() => show(hint.target)}>
        {hint.label}
      </Button>
    </Alert>
  );
};
