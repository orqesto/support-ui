import { cn } from '@/lib/utils';

type SkeletonBoxProps = {
  className?: string;
};

const SkeletonBox = ({ className }: SkeletonBoxProps) => (
  <div className={cn('animate-pulse rounded-md bg-muted', className)} />
);

/**
 * Generic full-page fallback for lazy-loaded routes. Mirrors a typical
 * "header + content card" layout so the transition feels closer to the
 * eventual page than a centered spinner does.
 */
export const PageSkeleton = ({ label }: { label?: string }) => (
  <div className="flex flex-col flex-1 p-6 mx-auto space-y-6 w-full max-w-7xl">
    <div className="space-y-2">
      <SkeletonBox className="h-7 w-48" />
      <SkeletonBox className="h-4 w-72" />
    </div>
    <SkeletonBox className="h-64 w-full" />
    {label && (
      <p className="text-sm text-center text-muted-foreground sr-only" aria-live="polite">
        {label}
      </p>
    )}
  </div>
);

/** Skeleton for list/table-style pages (Messages, Tickets, Needs Routing). */
export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="flex flex-col flex-1 p-6 mx-auto space-y-4 w-full max-w-7xl">
    <div className="space-y-2">
      <SkeletonBox className="h-7 w-48" />
      <SkeletonBox className="h-4 w-72" />
    </div>
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, idx) => (
        <SkeletonBox key={idx} className="h-14 w-full" />
      ))}
    </div>
  </div>
);

/** Skeleton for detail pages (MessageDetail, TicketDetail). */
export const DetailSkeleton = () => (
  <div className="flex flex-col flex-1 p-6 mx-auto space-y-6 w-full max-w-5xl">
    <SkeletonBox className="h-6 w-32" />
    <div className="space-y-3">
      <SkeletonBox className="h-7 w-3/4" />
      <SkeletonBox className="h-4 w-1/2" />
    </div>
    <SkeletonBox className="h-40 w-full" />
    <SkeletonBox className="h-24 w-full" />
  </div>
);
