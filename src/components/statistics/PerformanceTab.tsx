import { Clock, Timer, Zap } from 'lucide-react';
import { SLAOverviewCards } from '@/components/sla/SLAOverviewCards';
import { SLAByChannelChart } from '@/components/sla/SLAByChannelChart';
import { SLAByPriorityTable } from '@/components/sla/SLAByPriorityTable';
import { SLATrendChart } from '@/components/sla/SLATrendChart';
import { SLABreachList } from '@/components/sla/SLABreachList';
import { StatisticsMessagesTab } from '@/components/statistics/StatisticsMessagesTab';
import { SpeedToLeadTab } from '@/components/statistics/SpeedToLeadTab';
import type { MessageStatsData, LabelStatEntry, SpeedToLeadData } from '@/services/statistics.service';

interface Props {
  days: number;
  msgStats: MessageStatsData | null;
  msgLoading: boolean;
  labelStats: LabelStatEntry[] | null;
  labelLoading: boolean;
  speedData: SpeedToLeadData | null;
  speedLoading: boolean;
  speedDays: number;
}

const SECTIONS = [
  { id: 'sla', label: 'SLA', icon: Clock },
  { id: 'response', label: 'Response & Resolution', icon: Timer },
  { id: 'leads', label: 'Speed to Lead', icon: Zap },
];

/**
 * Performance — service-quality dashboard. Merges the old SLA, Messages, and
 * Speed-to-Lead tabs into one page with jump-to-section nav. All sections share
 * the page-level date window (SLA components read it via their `days` prop).
 */
export function PerformanceTab({
  days,
  msgStats,
  msgLoading,
  labelStats,
  labelLoading,
  speedData,
  speedLoading,
  speedDays,
}: Props) {
  return (
    <div id="panel-performance" role="tabpanel" className="space-y-8 pt-2">
      {/* Jump-to-section nav */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Icon className="w-4 h-4" />
            {label}
          </a>
        ))}
      </div>

      <section id="sla" className="space-y-6 scroll-mt-20">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Clock className="w-5 h-5 text-primary" />SLA
        </h2>
        <SLAOverviewCards days={days} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SLAByChannelChart days={days} />
          <SLAByPriorityTable days={days} />
        </div>
        <SLATrendChart days={days} />
        <SLABreachList days={days} />
      </section>

      <section id="response" className="space-y-4 scroll-mt-20 border-t pt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Timer className="w-5 h-5 text-primary" />Response &amp; Resolution
        </h2>
        <StatisticsMessagesTab
          msgStats={msgStats}
          msgLoading={msgLoading}
          labelStats={labelStats}
          labelLoading={labelLoading}
          msgDays={days}
        />
      </section>

      <section id="leads" className="space-y-4 scroll-mt-20 border-t pt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Zap className="w-5 h-5 text-primary" />Speed to Lead
        </h2>
        <SpeedToLeadTab speedData={speedData} speedLoading={speedLoading} speedDays={speedDays} />
      </section>
    </div>
  );
}
