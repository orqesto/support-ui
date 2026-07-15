import { useState } from 'react';
import { SLAOverviewCards } from '@/components/sla/SLAOverviewCards';
import { SLAByChannelChart } from '@/components/sla/SLAByChannelChart';
import { SLAByPriorityTable, SLA_DEFAULT_DAYS } from '@/components/sla/SLAByPriorityTable';
import { SLATrendChart } from '@/components/sla/SLATrendChart';
import { SLABreachList } from '@/components/sla/SLABreachList';
import { Layout } from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

const DAYS_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '365 days', value: 365 },
];

export const SLADashboardPage = () => {
  const [days, setDays] = useState<number>(SLA_DEFAULT_DAYS);

  return (
    <Layout>
      <div className="p-6 mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">SLA Performance</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Monitor service level agreement metrics and performance across messages and tickets
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Period:</span>
            <div className="flex rounded-md border border-border overflow-hidden">
              {DAYS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDays(opt.value)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium transition-colors',
                    days === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="animate-in fade-in duration-500">
            <SLAOverviewCards days={days} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-500 delay-100">
            <SLAByChannelChart days={days} />
            <SLAByPriorityTable days={days} />
          </div>

          <div className="animate-in fade-in duration-500 delay-200">
            <SLATrendChart days={days} />
          </div>

          <div className="animate-in fade-in duration-500 delay-300">
            <SLABreachList days={days} />
          </div>
        </div>
      </div>
    </Layout>
  );
};
