import { useEffect, useMemo, useState } from 'react';
import { Plug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AIProvidersSettings } from './AIProvidersSettings';
import { ChatWidgetSettings } from './ChatWidgetSettings';
import { MessageSourcesSettings } from './MessageSourcesSettings';
import { ObjectStorageConfigCard } from './providers/ObjectStorageConfigCard';
import { TicketAutomationSettings } from './TicketAutomationSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';

type ServiceSection =
  | 'message-sources'
  | 'ticket-automation'
  | 'ai-providers'
  | 'chat-widgets'
  | 'object-storage';

type Props = {
  isGlobalAdmin: boolean;
  /** Sub-section from parent hash (e.g. `/settings#integrations/ai-providers`). */
  section?: string;
};

export const ConnectedServicesSettings = ({ isGlobalAdmin, section }: Props) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  // AI Providers + Object Storage are per-org config an org admin can own — gate
  // them on MANAGE_INTEGRATIONS (which the save endpoints require anyway) so the
  // onboarding wizard's "set this up in Settings" promises are actually reachable.
  // Chat Widgets stays global-admin-only.
  const canManageIntegrations = hasPermission(Permission.MANAGE_INTEGRATIONS);

  // Fold visibility into the section list so a deep-link a user can't see falls
  // back to the default rather than selecting a tab that renders blank.
  const visibleIds = useMemo<ServiceSection[]>(
    () => [
      'message-sources',
      'ticket-automation',
      ...(canManageIntegrations ? (['ai-providers', 'object-storage'] as ServiceSection[]) : []),
      ...(isGlobalAdmin ? (['chat-widgets'] as ServiceSection[]) : []),
    ],
    [isGlobalAdmin, canManageIntegrations]
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
        ]
      : []),
    ...(isGlobalAdmin
      ? [{ id: 'chat-widgets' as ServiceSection, label: 'Chat Widgets', description: 'Create embeddable AI chat widgets' }]
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

      <div className="flex gap-2 p-1 rounded-lg border bg-muted/50">
        {sections.map((sect) => (
          <button
            key={sect.id}
            onClick={() => goToSection(sect.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-md transition-all ${
              active === sect.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
            title={sect.description}
          >
            {sect.label}
          </button>
        ))}
      </div>

      {active === 'message-sources' && <MessageSourcesSettings />}
      {active === 'ticket-automation' && <TicketAutomationSettings />}
      {canManageIntegrations && active === 'ai-providers' && <AIProvidersSettings />}
      {canManageIntegrations && active === 'object-storage' && <ObjectStorageConfigCard />}
      {isGlobalAdmin && active === 'chat-widgets' && <ChatWidgetSettings />}
    </div>
  );
};
