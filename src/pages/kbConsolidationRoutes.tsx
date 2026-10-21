/**
 * Route elements for KB consolidation (#873), kept out of App.tsx (its max-lines budget).
 *
 * ⛔ The Cases page hides behind `ui.kb_cases`: the FE reaches production on merge while the
 * backend only ships on a tag, so the page must not appear before its routes exist. The old merges
 * review page is retired: `/knowledge-base/merges` sends old links to the list, which decides.
 */
import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FeatureGate } from '@/components/common/FeatureGate';
import { Spinner } from '@/components/ui/Spinner';
import { Permission } from '@/types/roles';

const KbCasesPage = lazy(() =>
  import('./KbCasesPage').then((mod) => ({ default: mod.KbCasesPage }))
);

const KbAutoActionsPage = lazy(() =>
  import('./KbAutoActionsPage').then((mod) => ({ default: mod.KbAutoActionsPage }))
);

const Fallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-busy="true">
    <Spinner />
  </div>
);

export const KB_CASES_FLAG = 'ui.kb_cases';

export const KbCasesRoute = () => (
  <ProtectedRoute requiredPermission={Permission.MANAGE_KNOWLEDGE_BASE}>
    <FeatureGate flag={KB_CASES_FLAG} title="Knowledge base cases">
      <Suspense fallback={<Fallback />}>
        <KbCasesPage />
      </Suspense>
    </FeatureGate>
  </ProtectedRoute>
);

export const KB_AUTO_ACTIONS_PATH = '/knowledge-base/automatic';

/** Automatic removal (step 1). Not flag-gated: on an older backend the page says so itself. */
export const KbAutoActionsRoute = () => (
  <ProtectedRoute requiredPermission={Permission.MANAGE_KNOWLEDGE_BASE}>
    <Suspense fallback={<Fallback />}>
      <KbAutoActionsPage />
    </Suspense>
  </ProtectedRoute>
);

/**
 * The KB sub-page routes, kept here so App.tsx stays inside its max-lines budget. `wrap` is App's
 * PrivateRoute (signed-in gate); each page's own route element adds the permission gate.
 */
export const kbSubRoutes = (wrap: (page: JSX.Element) => ReactElement) => [
  <Route key="kb-cases" path="/knowledge-base/cases" element={wrap(<KbCasesRoute />)} />,
  // Retired: the Knowledge Base list is the one place to decide (old links and bookmarks land there).
  <Route
    key="kb-merges"
    path="/knowledge-base/merges"
    element={<Navigate to="/knowledge-base?status=suggested_change" replace />}
  />,
  <Route key="kb-auto" path={KB_AUTO_ACTIONS_PATH} element={wrap(<KbAutoActionsRoute />)} />,
];
