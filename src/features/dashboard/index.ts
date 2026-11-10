/**
 * The dashboard feature (the dashboard's own tiles, its system-health and Telegram-activity hooks,
 * and the services only they call). This file is its only public entry: code outside
 * `src/features/dashboard/` imports from `@/features/dashboard`, never a deep path (ESLint
 * `boundaries/api-only-features`). Export only what pages or other features use.
 */
export { DashboardKBSection } from './components/DashboardKBSection';
export { DashboardQuickActions } from './components/DashboardQuickActions';
export { DashboardSkeleton } from './components/DashboardSkeleton';
export { DashboardSLASection, DashboardStatusBarSection } from './components/DashboardStatCards';
export { DashboardSystemStatus } from './components/DashboardSystemStatus';
export { useSystemHealth } from './hooks/useSystemHealth';
export { useTelegramProcessing } from './hooks/useTelegramProcessing';
export {
  ingestionService,
  type StartAllResponse,
  type StartTelegramResponse,
} from './services/ingestion.service';
export {
  telegramStartNotice,
  type TelegramBotView,
  type TelegramStartReport,
} from './services/telegramStartNotice';
