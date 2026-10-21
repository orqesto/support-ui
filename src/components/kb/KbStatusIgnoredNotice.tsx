import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { KB_MERGES_REVIEW_PATH } from '@/components/layout/KbReviewSection';

export const KB_STATUS_IGNORED_NOTICE = 'This server cannot filter by this yet.';

export type KbDecisionFilterStatus =
  | 'needs_decision'
  | 'suggested_change'
  | 'set_aside'
  | 'auto_removed';
/** The statuses an older backend does not know: it ignores them and returns the unfiltered list. */
const NEW_STATUSES: readonly string[] = [
  'needs_decision',
  'suggested_change',
  'set_aside',
  'auto_removed',
];
export const isNewStatus = (status: string): status is KbDecisionFilterStatus =>
  NEW_STATUSES.includes(status);

/**
 * Where each decision filter's rows can still be found on an older backend: saved answers waiting
 * for approval are its Pending entries, suggested changes are on the review page, and set-aside
 * entries are listed by the cases report.
 */
const FALLBACK: Record<KbDecisionFilterStatus, { text: string; to: string; label: string }> = {
  needs_decision: {
    text: 'Saved answers waiting for approval are listed under Pending.',
    to: '/knowledge-base?status=pending',
    label: 'Show Pending entries',
  },
  suggested_change: {
    text: 'Suggested changes can still be decided on the review page.',
    to: KB_MERGES_REVIEW_PATH,
    label: 'Open the review page',
  },
  set_aside: {
    text: 'Set-aside entries are listed in the cases report.',
    to: '/knowledge-base/cases',
    label: 'Open the cases report',
  },
  auto_removed: {
    text: 'Automatically removed entries are listed on the Automatic actions page.',
    to: '/knowledge-base/automatic',
    label: 'Open Automatic actions',
  },
};

/**
 * Shown INSTEAD of the rows when an older backend ignored a decision filter: it would return the
 * whole knowledge base, which must not pass for the filtered list. Each filter links to where an
 * older backend still lists its rows, so the person can still decide.
 */
export const KbStatusIgnoredNotice = ({ status }: { status: KbDecisionFilterStatus }) => {
  const fallback = FALLBACK[status];
  return (
    <Alert variant="warning">
      <p className="font-medium">{KB_STATUS_IGNORED_NOTICE}</p>
      <p className="mt-1 text-sm">
        It would show every entry, so no list is shown here. {fallback.text}{' '}
        <Link to={fallback.to} className="font-medium underline">
          {fallback.label}
        </Link>
      </p>
    </Alert>
  );
};
