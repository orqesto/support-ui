/**
 * The statistics feature (Statistics page tabs + SLA dashboard). This file is its only public entry:
 * code outside `src/features/statistics/` imports from `@/features/statistics`, never a deep path
 * (ESLint `boundaries/api-only-features`). Export only what pages or other features use.
 */
export { DiagnosticsTab } from './components/DiagnosticsTab';
export { PerformanceTab } from './components/PerformanceTab';
export { SLABreachList } from './components/SLABreachList';
export { SLAByChannelChart } from './components/SLAByChannelChart';
export { SLAByPriorityTable, SLA_DEFAULT_DAYS } from './components/SLAByPriorityTable';
export { SLAOverviewCards } from './components/SLAOverviewCards';
export { SLATrendChart } from './components/SLATrendChart';
export { StatisticsOverviewTab } from './components/StatisticsOverviewTab';
export { StatisticsTeamTab } from './components/StatisticsTeamTab';
export { TokenUsageTab } from './components/TokenUsageTab';
export { useStatisticsFetch } from './hooks/useStatisticsFetch';
export { slaService } from './services/sla.service';
export {
  statisticsService,
  type AIStatsData,
  type LabelStatEntry,
  type MessageStatsData,
  type SLASummary,
  type SpeedToLeadData,
  type StatisticsData,
  type UserStatEntry,
} from './services/statistics.service';
