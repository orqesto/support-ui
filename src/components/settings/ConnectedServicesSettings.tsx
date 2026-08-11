import { useEffect, useMemo, useState } from 'react';
import { Plug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AIProvidersSettings } from './AIProvidersSettings';
import { ChatWidgetSettings } from './ChatWidgetSettings';
import { MessageSourcesSettings } from './MessageSourcesSettings';
import { ObjectStorageConfigCard } from './providers/ObjectStorageConfigCard';
import { TicketAutomationSettings } from './TicketAutomationSettings';
import { Tabs } from '@/components/ui/Tabs';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';

type ServiceSection =
  | 'message-sources'
  | 'ticket-automation'
  | 'ai-providers'
  | 'chat-widgets'
  | 'object-storage';

type Props = {
  /** Sub-section from parent hash (e.g. `/settings#integrations/ai-providers`). */
  section?: string;
};

export const ConnectedServicesSettings = ({ section }: Props) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  // AI Providers, Object Storage, and Chat Widgets are per-workspace config an org admin
  // can own — gate them on MANAGE_INTEGRATIONS (which the save endpoints require anyway)
  // so the onboarding wizard's "set this up in Settings" promises are actually reachable.
  const canManageIntegrations = hasPermission(Permission.MANAGE_INTEGRATIONS);

  // Fold visibility into the section list so a deep-link a user can't see falls
  // back to the default rather than selecting a tab that renders blank.
  const visibleIds = useMemo<ServiceSection[]>(
    () => [
      'message-sources',
      'ticket-automation',
      ...(canManageIntegrations
        ? (['ai-providers', 'object-storage', 'chat-widgets'] as ServiceSection[])
        : []),
    ],
    [canManageIntegrations]
  );
  const initial =
    section && (visibleIds as string[]).includes(section)
      ? (section as ServiceSection)
      : 'message-sources';
  const [active, setActive] = useState<ServiceSection>(initial);

  useEffect(() => {
    if (!section) return;
    if ((visibleIds as string[]).includes(section)) {
      setActive(section as ServiceSection);
    }
  }, [section, visibleIds]);

  const goToSection = (next: ServiceSection) => {
    setActive(next);
    navigate(`#integrations/${next}`, { replace: true });
  };

  const sections = [
    { id: 'message-sources' as ServiceSection, label: 'Message Sources', description: 'Configure Email, Gmail, Telegram, Slack inboxes' },
    { id: 'ticket-automation' as ServiceSection, label: 'Ticket Automation', description: 'Configure Jira and ticket workflows' },
    ...(canManageIntegrations
      ? [
          { id: 'ai-providers' as ServiceSection, label: 'AI Providers', description: 'Configure OpenAI, Anthropic and models' },
          { id: 'object-storage' as ServiceSection, label: 'Object Storage', description: 'Store attachments in your own S3 bucket' },
          { id: 'chat-widgets' as ServiceSection, label: 'Chat Widgets', description: 'Create embeddable AI chat widgets' },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex gap-2 items-center text-xl font-semibold">
          <Plug className="w-5 h-5" />
          Integrations
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect message channels, ticket systems, and AI providers
        </p>
      </div>

      <Tabs<ServiceSection>
        tabs={sections.map((sect) => ({ id: sect.id, label: sect.label, description: sect.description }))}
        activeTab={active}
        onTabChange={goToSection}
        variant="simple"
        showIcons={false}
      >
        {active === 'message-sources' && <MessageSourcesSettings />}
        {active === 'ticket-automation' && <TicketAutomationSettings />}
        {canManageIntegrations && active === 'ai-providers' && <AIProvidersSettings />}
        {canManageIntegrations && active === 'object-storage' && <ObjectStorageConfigCard />}
        {canManageIntegrations && active === 'chat-widgets' && <ChatWidgetSettings />}
      </Tabs>
    </div>
  );
};
