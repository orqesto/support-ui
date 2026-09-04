import type { ElementType, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/Progress';

export type UsageItem = {
  current: number;
  limit: number;
  percentage: number;
  warning: boolean;
  critical: boolean;
  formatted: string;
  /**
   * Messages only: the plan's own cap and the message-pack part of `limit`.
   * Optional — a backend that predates packs sends neither, and the tile must
   * still render (FE-app/CLAUDE.md, version skew).
   */
  planLimit?: number;
  extra?: number;
};

const barColor = (item: UsageItem) => {
  if (item.critical) return 'bg-red-500';
  if (item.warning) return 'bg-orange-500';
  return 'bg-blue-500';
};

/** One usage meter on the Subscription page: used / limit, a bar, and the state in words. */
export const UsageTile = ({
  title,
  icon: Icon,
  item,
  action,
}: {
  title: string;
  icon: ElementType;
  item: UsageItem;
  /** A door out of THIS limit, shown on the tile itself (the Messages tile's pack). */
  action?: ReactNode;
}) => (
  <div className="p-4 rounded-lg border bg-card">
    <div className="flex justify-between items-center mb-2">
      <div className="flex gap-2 items-center">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      {item.warning && (
        <AlertTriangle
          className={`w-4 h-4 ${item.critical ? 'text-red-500' : 'text-orange-500'}`}
        />
      )}
    </div>
    <div className="flex justify-between items-baseline mb-2">
      <span className="text-2xl font-bold">{item.current.toLocaleString()}</span>
      <span className="text-sm text-muted-foreground">/ {item.limit.toLocaleString()}</span>
    </div>
    <Progress value={Math.min(item.percentage, 100)} className={barColor(item)} />
    <div className="flex justify-between items-center mt-1">
      <span className="text-xs text-muted-foreground">{item.percentage}% used</span>
      {item.critical && <span className="text-xs font-medium text-red-600">Limit reached!</span>}
      {item.warning && !item.critical && (
        <span className="text-xs font-medium text-orange-600">Approaching limit</span>
      )}
    </div>
    {/* A bought pack is part of `limit`; say so, or the number looks wrong next to the plan. */}
    {item.extra !== undefined && item.extra > 0 && item.planLimit !== undefined && (
      <p className="mt-1 text-xs text-muted-foreground">
        {item.planLimit.toLocaleString()} from your plan + {item.extra.toLocaleString()} from
        message packs this period
      </p>
    )}
    {action && <div className="mt-2">{action}</div>}
  </div>
);
