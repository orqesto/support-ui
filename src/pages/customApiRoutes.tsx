/**
 * Route elements for the custom-API pages, kept out of App.tsx (its max-lines budget), like
 * kbConsolidationRoutes. Each page repeats the Custom APIs tab's MANAGE_INTEGRATIONS gate itself
 * (it shows a sentence rather than redirecting), so the route only requires a signed-in user.
 */
import { lazy, Suspense } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Spinner } from '@/components/ui/Spinner';

const CustomApiLookupPage = lazy(() =>
  import('./CustomApiLookupPage').then((mod) => ({ default: mod.CustomApiLookupPage }))
);
const CustomApiTemplatePage = lazy(() =>
  import('./CustomApiTemplatePage').then((mod) => ({ default: mod.CustomApiTemplatePage }))
);

const Fallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-busy="true">
    <Spinner />
  </div>
);

export {
  CUSTOM_API_LOOKUP_ROUTE,
  CUSTOM_API_TEMPLATE_ROUTE,
} from '@/components/settings/customApi/lookupPaths';

export const CustomApiLookupRoute = () => (
  <ProtectedRoute>
    <Suspense fallback={<Fallback />}>
      <CustomApiLookupPage />
    </Suspense>
  </ProtectedRoute>
);

export const CustomApiTemplateRoute = () => (
  <ProtectedRoute>
    <Suspense fallback={<Fallback />}>
      <CustomApiTemplatePage />
    </Suspense>
  </ProtectedRoute>
);
