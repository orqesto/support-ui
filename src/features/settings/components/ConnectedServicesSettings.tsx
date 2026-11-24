import { useEffect, useMemo, useState } from 'react';
import { Plug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AIProvidersSettings } from './AIProvidersSettings';
import { CustomApiSection } from './customApi/CustomApiSection';
import { ChatWidgetSettings } from './ChatWidgetSettings';
import { MessageSourcesSettings } from './MessageSourcesSettings';
import { DatabaseConfigCard } from './providers/DatabaseConfigCard';
import { ObjectStorageConfigCard } from './providers/ObjectStorageConfigCard';
import { TicketAutomationSettings } from './TicketAutomationSettings';
import { ZendeskImportSettings } from './zendeskImport/ZendeskImportSettings';
import { Tabs } from '@/components/ui/Tabs';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';
import { firstVisibleId, useShowAdvanced, visibleSections } from '@/features/settings/advanced';
import { AdvancedToggle } from './AdvancedToggle';

type ServiceSection =
  | 'message-sources'
  | 'ticket-automation'
  | 'ai-providers'
  | 'chat-widgets'
  | 'object-storage'
  | 'database'
  | 'custom-apis'
  | 'import';

type Props = {
  /** Sub-section from parent hash (e.g. `/settings#integrations/ai-providers`). */
  section?: string;
};

export const ConnectedServicesSettings = ({ section }: Props) => {
  const navigate = useNavigate();
  const { hasPermission, isOrgAdmin } = usePermissions();
  // AI Providers, Object Storage, and Chat Widgets are per-workspace config an org admin
  // can own — gate them on MANAGE_INTEGRATIONS (which the save endpoints require anyway)
  // so the onboarding wizard's "set this up in Settings" promises are actually reachable.
  const canManageIntegrations = hasPermission(Permission.MANAGE_INTEGRATIONS);
  // Importing from Zendesk writes the whole workspace's history: org admins only, as the BE
  // routes require (a moderator sees Integrations but not Import).
  const canImport = hasPermission(Permission.MANAGE_ORGANIZATION);

  // Fold visibility into the section list so a deep-link a user can't see falls
  // back to the default rather than selecting a tab that renders blank.
  // Declared before the section logic that reads them. AI providers, storage, database and custom
  // APIs are infrastructure: behind "Show advanced settings" (settings simplification, 2026-11-23).
  const sections: Array<{ id: ServiceSection; label: string; description: string; advanced?: boolean }> = useMemo(
    () => [
      { id: 'message-sources', label: 'Message Sources', description: 'Configure Email, Gmail, Telegram, Slack inboxes' },
      { id: 'ticket-automation', label: 'Ticket Automation', description: 'Configure Jira and ticket workflows' },
      ...(canManageIntegrations
        ? [
            { id: 'ai-providers' as ServiceSection, label: 'AI Providers', description: 'Configure OpenAI, Anthropic and models', advanced: true },
            { id: 'object-storage' as ServiceSection, label: 'Object Storage', description: 'Store attachments in your own S3 bucket', advanced: true },
            { id: 'database' as ServiceSection, label: 'Database', description: 'Keep your data in your own Postgres', advanced: true },
            { id: 'chat-widgets' as ServiceSection, label: 'Chat Widgets', description: 'Create embeddable AI chat widgets' },
            { id: 'custom-apis' as ServiceSection, label: 'Custom APIs', description: 'Look up orders, shipments or bookings from your own systems', advanced: true },
          ]
        : []),
      ...(canImport
        ? [{ id: 'import' as ServiceSection, label: 'Import', description: 'Move your Zendesk tickets over as threads' }]
        : []),
    ],
    [canManageIntegrations, canImport]
  );
  const [showAdvanced] = useShowAdvanced();
  // A section a link asks for stays visible even when Advanced hides it.
  const shown = useMemo(
    () => visibleSections(sections, showAdvanced, section),
    [sections, showAdvanced, section]
  );
  const visibleIds = useMemo(() => shown.map((sect) => sect.id), [shown]);
  const initial =
    section && (visibleIds as string[]).includes(section)
      ? (section as ServiceSection)
      : 'message-sources';
  const [selected, setActive] = useState<ServiceSection>(initial);

  useEffect(() => {
    if (!section) return;
    if ((visibleIds as string[]).includes(section)) {
      setActive(section as ServiceSection);
    }
  }, [section, visibleIds]);

  // Clamp at render: the open section is always one that is shown.
  const active: ServiceSection = (visibleIds as string[]).includes(selected)
    ? selected
    : ((firstVisibleId(shown, 'message-sources') ?? 'message-sources') as ServiceSection);

  const goToSection = (next: ServiceSection) => {
    setActive(next);
    void navigate(`#integrations/${next}`, { replace: true });
  };

  // From the toggle only: leave a section that Advanced just hid.
  const onTurnOff = () => {
    // Only a section that Advanced off now hides is left; one still shown keeps your place.
    if (visibleSections(sections, false).some((sect) => sect.id === active)) return;
    const target = (firstVisibleId(visibleSections(sections, false), 'message-sources') ??
      'message-sources') as ServiceSection;
    setActive(target);
    void navigate(`#integrations/${target}`, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display flex gap-2 items-center text-xl font-semibold">
          <Plug className="w-5 h-5" />
          Integrations
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect message channels, ticket systems, and AI providers
        </p>
        <AdvancedToggle onTurnOff={onTurnOff} />
      </div>

      <Tabs<ServiceSection>
        tabs={shown.map((sect) => ({ id: sect.id, label: sect.label, description: sect.description }))}
        activeTab={active}
        onTabChange={goToSection}
        variant="simple"
        showIcons={false}
      >
        {active === 'message-sources' && <MessageSourcesSettings />}
        {active === 'ticket-automation' && <TicketAutomationSettings />}
        {canManageIntegrations && active === 'ai-providers' && (
          <AIProvidersSettings showModeSwitch={isOrgAdmin} showCostRates />
        )}
        {canManageIntegrations && active === 'object-storage' && <ObjectStorageConfigCard />}
        {canManageIntegrations && active === 'database' && <DatabaseConfigCard />}
        {canManageIntegrations && active === 'chat-widgets' && <ChatWidgetSettings />}
        {canManageIntegrations && active === 'custom-apis' && (
          <CustomApiSection canManageVendors={isOrgAdmin} />
        )}
        {canImport && active === 'import' && <ZendeskImportSettings />}
      </Tabs>
    </div>
  );
};
