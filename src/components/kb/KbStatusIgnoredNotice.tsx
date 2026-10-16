import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { KB_MERGES_REVIEW_PATH } from '@/components/layout/KbReviewSection';

export const KB_STATUS_IGNORED_NOTICE = 'This server cannot filter by this yet.';

/**
 * Shown INSTEAD of the rows when an older backend ignored a decision filter: it would return the
 * whole knowledge base, which must not pass for the filtered list. The review page works on every
 * backend, so the person can still decide.
 */
export const KbStatusIgnoredNotice = () => (
  <Alert variant="warning">
    <p className="font-medium">{KB_STATUS_IGNORED_NOTICE}</p>
    <p className="mt-1 text-sm">
      It would show every entry, so no list is shown here. Suggested changes can still be decided on
      the review page.{' '}
      <Link to={KB_MERGES_REVIEW_PATH} className="font-medium underline">
        Open the review page
      </Link>
    </p>
  </Alert>
);
