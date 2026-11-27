/**
 * Route elements for the custom-API pages, kept out of App.tsx (its max-lines budget), like
 * kbConsolidationRoutes. Each page repeats the Custom APIs tab's MANAGE_INTEGRATIONS gate itself
 * (it shows a sentence rather than redirecting), so the route only requires a signed-in user.
 */
import { lazy, Suspense } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RouteFallback } from './routeFallback';

const CustomApiLookupPage = lazy(() =>
  import('./CustomApiLookupPage').then((mod) => ({ default: mod.CustomApiLookupPage }))
);
const CustomApiTemplatePage = lazy(() =>
  import('./CustomApiTemplatePage').then((mod) => ({ default: mod.CustomApiTemplatePage }))
);

export {
  CUSTOM_API_LOOKUP_ROUTE,
  CUSTOM_API_TEMPLATE_ROUTE,
} from '@/features/settings/shell';

export const CustomApiLookupRoute = () => (
  <ProtectedRoute>
    <Suspense fallback={<RouteFallback />}>
      <CustomApiLookupPage />
    </Suspense>
  </ProtectedRoute>
);

export const CustomApiTemplateRoute = () => (
  <ProtectedRoute>
    <Suspense fallback={<RouteFallback />}>
      <CustomApiTemplatePage />
    </Suspense>
  </ProtectedRoute>
);
