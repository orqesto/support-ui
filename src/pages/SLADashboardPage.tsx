import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SLAOverviewCards } from '@/components/sla/SLAOverviewCards';
import { SLAByChannelChart } from '@/components/sla/SLAByChannelChart';
import { SLAByPriorityTable, SLA_DEFAULT_DAYS } from '@/components/sla/SLAByPriorityTable';
import { SLATrendChart } from '@/components/sla/SLATrendChart';
import { SLABreachList } from '@/components/sla/SLABreachList';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import {
  dayPresets,
  periodFromSearch,
  periodToPickerValue,
  pickerValueToPeriod,
  type ReportPeriod,
} from '@/lib/reportPeriod';

const DAYS_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '365 days', value: 365 },
];

export const SLADashboardPage = () => {
  const [searchParams] = useSearchParams();
  // Arriving from the dashboard's "Avg First Response" tile, which sends the window its
  // number was computed over. Only a period this page can actually select is honoured —
  // anything else would leave the selector showing no active button while the charts
  // displayed a window nobody could see or change.
  // A custom range (?from=&to=) is honoured too: the picker shows it.
  const [period, setPeriod] = useState<ReportPeriod>(() =>
    periodFromSearch(searchParams, SLA_DEFAULT_DAYS, DAYS_OPTIONS.map((opt) => opt.value))
  );
  const { days } = period;

  return (
    <>
      <div className="p-6 mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">SLA Performance</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Monitor service level agreement metrics and performance across threads and tickets
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Period:</span>
            <DateRangePicker
              ariaLabel="Period"
              presets={dayPresets(DAYS_OPTIONS.map((opt) => ({ days: opt.value, label: opt.label })))}
              value={periodToPickerValue(period)}
              onChange={(next) => setPeriod(pickerValueToPeriod(next))}
              maxSpanDays={365}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="animate-in fade-in duration-500">
            <SLAOverviewCards days={days} period={period} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-500 delay-100">
            <SLAByChannelChart days={days} period={period} />
            <SLAByPriorityTable days={days} period={period} />
          </div>

          <div className="animate-in fade-in duration-500 delay-200">
            <SLATrendChart days={days} period={period} />
          </div>

          <div className="animate-in fade-in duration-500 delay-300">
            <SLABreachList days={days} period={period} />
          </div>
        </div>
      </div>
    </>
  );
};
