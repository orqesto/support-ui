/**
 * The settings feature: the workspace settings screens (profile, workspace, teams and users, AI,
 * integrations and channels, storage providers, Zendesk import, custom-API settings UI), the
 * user/organisation modals, and the settings services, hooks, stores and utils. This file is its
 * only public entry: code outside `src/features/settings/` imports from `@/features/settings`,
 * never a deep path (ESLint `boundaries/api-only-features`). Export only what pages or other
 * features use. Files inside the feature import each other directly, never through this index.
 */
export { AIConfigSettings } from './components/AIConfigSettings';
export { AIProvidersSettings } from './components/AIProvidersSettings';
export { ConnectedServicesSettings } from './components/ConnectedServicesSettings';
export { DocumentationSettings } from './components/DocumentationSettings';
export { NotificationPreferencesSettings } from './components/NotificationPreferencesSettings';
export { OrganizationSettings } from './components/OrganizationSettings';
export { ProfileSettings } from './components/ProfileSettings';
export { RulesSettings } from './components/RulesSettings';
export { SCIMConfigSettings } from './components/SCIMConfigSettings';
export { SSOConfigSettings } from './components/SSOConfigSettings';
export { SlackNotificationsSettings } from './components/SlackNotificationsSettings';
export { SystemSettings } from './components/SystemSettings';
export { overTeamLimitText, TeamsSettings } from './components/TeamsSettings';
export { WorkspaceDetailsSettings } from './components/WorkspaceDetailsSettings';
export { EndpointWizard } from './components/customApi/EndpointWizard';
export { hostOf } from './components/customApi/LookupHealthLine';
export { TemplateGuide } from './components/customApi/TemplateGuide';
export {
  CATEGORY_RECORD_LABELS,
  CATEGORY_TAB_LABELS,
  type CustomApiCategory,
  readCategory,
} from './components/customApi/categories';
export {
  CUSTOM_API_LOOKUP_ROUTE,
  CUSTOM_API_TEMPLATE_ROUTE,
  CUSTOM_APIS_SETTINGS_PATH,
  customApiLookupPath,
} from './components/customApi/lookupPaths';
export { EmailIntegrationCard } from './components/integrations/EmailIntegrationCard';
export { GmailIntegrationCard } from './components/integrations/GmailIntegrationCard';
export { SlackIntegrationCard } from './components/integrations/SlackIntegrationCard';
export { TelegramIntegrationCard } from './components/integrations/TelegramIntegrationCard';
export { WhatsAppIntegrationCard } from './components/integrations/WhatsAppIntegrationCard';
export {
  kbFullHeldLine,
  kbFullHoldLine,
  retryOwedWithheldLine,
  runStoppedLine,
} from './components/integrations/kbRangeCopy';
export { formatRetry, HOLD_LABEL, holdSeverity } from './components/integrations/syncHold';
export type { AlertState } from './components/integrations/types';
export { CreateOrganizationModal } from './components/modals/CreateOrganizationModal';
export { CreateUserModal } from './components/modals/CreateUserModal';
export { InviteUserModal } from './components/modals/InviteUserModal';
export { UserSkillsModal } from './components/modals/UserSkillsModal';
export {
  DatabaseConfigCard,
  describeMove,
  STATUS_BADGE,
  STATUS_LABEL,
} from './components/providers/DatabaseConfigCard';
export {
  isPlatformStorage,
  ObjectStorageConfigCard,
} from './components/providers/ObjectStorageConfigCard';
export { UserDepartmentsField } from './components/users/UserDepartmentsField';
export { UserRoutingSkillsCard } from './components/users/UserRoutingSkillsCard';
export { useAiDraftsOff, useRefreshAiDrafts } from './hooks/useAiDraftsOff';
export { useGmailOAuthAvailability } from './hooks/useGmailOAuthAvailability';
export { invitationService } from './services/invitation.service';
export {
  DEFAULT_PLATFORM_THRESHOLDS,
  fillPlatformThresholds,
  PLATFORM_SLACK_SIGNALS,
  platformSlackAlertsService,
  type PlatformSlackConnection,
  type PlatformSlackSignal,
  type PlatformSlackStatus,
  type PlatformSlackThresholds,
  SLACK_BOT_SCOPES,
  type SlackChannelList,
  type SlackPostRetention,
  slackTeamKey,
  type SlackTestResult,
} from './services/slackNotifications.service';
export { useUsersStore } from './stores/usersStore';
export { getUserRowCapabilities } from './utils/userListCapabilities';
export { ZENDESK_AS_THREADS } from './components/zendeskImport/zendeskImportSummary';
