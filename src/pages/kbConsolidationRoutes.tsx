/**
 * Route elements for KB consolidation (#873), kept out of App.tsx (its max-lines budget).
 *
 * The Cases page is removed (KB engine Stage 1): `/knowledge-base/cases` lands on the Questions view.
 * The old merges review page is retired: `/knowledge-base/merges` sends old links to the list, which decides.
 */
import { Navigate, Route } from 'react-router-dom';
import { AUTO_ACTIONS_HREF } from '@/components/kb/autoActions/kbAutoActionCopy';

/** The old Automatic actions page. It is now a section of Settings › AI (owner, 2026-10-22). */
export const KB_AUTO_ACTIONS_PATH = '/knowledge-base/automatic';

/**
 * The KB sub-page routes, kept here so App.tsx stays inside its max-lines budget. All are
 * redirects now; the page each lands on carries its own sign-in and permission gates.
 */
export const kbSubRoutes = () => [
  // Removed: the old KB Cases link lands on the Questions view.
  <Route
    key="kb-cases"
    path="/knowledge-base/cases"
    element={<Navigate to="/knowledge-base?view=questions" replace />}
  />,
  // Retired: the Knowledge Base list is the one place to decide (old links and bookmarks land there).
  <Route
    key="kb-merges"
    path="/knowledge-base/merges"
    element={<Navigate to="/knowledge-base?status=suggested_change" replace />}
  />,
  // Moved to Settings › AI: old links and bookmarks land on the section.
  <Route
    key="kb-auto"
    path={KB_AUTO_ACTIONS_PATH}
    element={<Navigate to={AUTO_ACTIONS_HREF} replace />}
  />,
];
