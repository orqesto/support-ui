import { Card, CardContent, CardHeader } from '@/components/ui/Card';

const SkeletonCard = () => (
  <Card className="animate-pulse">
    <CardHeader className="flex flex-row justify-between items-center pb-2 space-y-0">
      <div className="w-20 h-4 bg-gray-200 rounded" />
      <div className="w-8 h-8 bg-gray-200 rounded" />
    </CardHeader>
    <CardContent>
      <div className="w-12 h-7 bg-gray-200 rounded" />
    </CardContent>
  </Card>
);

export const DashboardSkeleton = () => (
  <div className="space-y-6">
    {/* eslint-disable react/no-array-index-key */}
    <div>
      <div className="w-32 h-4 bg-gray-200 rounded mb-3" />
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <SkeletonCard key={`sk-sla-${idx}`} />
        ))}
      </div>
    </div>
    <div>
      <div className="w-24 h-4 bg-gray-200 rounded mb-3" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <SkeletonCard key={`sk-msg-${idx}`} />
        ))}
      </div>
    </div>
    <div>
      <div className="w-16 h-4 bg-gray-200 rounded mb-3" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <SkeletonCard key={`sk-tkt-${idx}`} />
        ))}
      </div>
    </div>
    {/* eslint-enable react/no-array-index-key */}
    <div>
      <div className="w-32 h-4 bg-gray-200 rounded mb-3" />
      <div className="grid gap-4 max-w-xs">
        <SkeletonCard />
      </div>
    </div>
  </div>
);
