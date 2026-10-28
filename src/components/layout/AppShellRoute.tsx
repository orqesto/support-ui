import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { LoadingRing } from '@/components/ui/LoadingRing';
import { Layout } from './Layout';

/**
 * The authenticated app's layout route: ONE <Layout> above the page <Outlet>, so navigating
 * between app pages keeps the shell mounted — its data hooks (notifications, processing
 * summary, learning) and the workspace socket room are not torn down and rebuilt per click.
 * The Suspense sits INSIDE the shell so the sidebar and header stay while a lazy page loads.
 */
export const AppShellRoute = () => (
  <Layout>
    <Suspense
      fallback={
        <div className="flex flex-1 justify-center items-center">
          <LoadingRing label="Loading..." />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  </Layout>
);
