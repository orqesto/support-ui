import { Spinner } from '@/components/ui/Spinner';

/** The Suspense fallback of the lazy route pages. */
export const RouteFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-busy="true">
    <Spinner />
  </div>
);
