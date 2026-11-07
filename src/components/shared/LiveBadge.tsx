import { Tooltip } from '@/components/ui/Tooltip';

/** "Live" — the list updates by itself as things arrive. One mark for Tickets and Threads. */
export const LiveBadge = ({ tip = 'The list updates by itself' }: { tip?: string }) => (
  <Tooltip content={tip} size="sm">
    <span className="inline-flex gap-1.5 items-center font-semibold text-success shrink-0">
      <span className="w-[7px] h-[7px] rounded-full bg-success animate-pulse" />
      Live
    </span>
  </Tooltip>
);
