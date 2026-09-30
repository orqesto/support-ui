/**
 * Route elements for KB consolidation (#873), kept out of App.tsx (its max-lines budget).
 *
 * ⛔ The Cases page hides behind `ui.kb_cases`: the FE reaches production on merge while the
 * backend only ships on a tag, so the page must not appear before its routes exist. The merges
 * review is NOT flag-gated — it is only reached from a bell row or a suggestion that the new
 * backend alone produces.
 */
import { lazy, Suspense } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FeatureGate } from '@/components/common/FeatureGate';
import { Spinner } from '@/components/ui/Spinner';
import { Permission } from '@/types/roles';

const KbCasesPage = lazy(() =>
  import('./KbCasesPage').then((mod) => ({ default: mod.KbCasesPage }))
);
const KbMergesReviewPage = lazy(() =>
  import('./KbMergesReviewPage').then((mod) => ({ default: mod.KbMergesReviewPage }))
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

export const KbMergesReviewRoute = () => (
  <ProtectedRoute requiredPermission={Permission.MANAGE_KNOWLEDGE_BASE}>
    <Suspense fallback={<Fallback />}>
      <KbMergesReviewPage />
    </Suspense>
  </ProtectedRoute>
);
