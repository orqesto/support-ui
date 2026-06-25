import { useEffect, useState } from 'react';
import { Plug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AIProvidersSettings } from './AIProvidersSettings';
import { ChatWidgetSettings } from './ChatWidgetSettings';
import { MessageSourcesSettings } from './MessageSourcesSettings';
import { TicketAutomationSettings } from './TicketAutomationSettings';

type ServiceSection = 'message-sources' | 'ticket-automation' | 'ai-providers' | 'chat-widgets';

const KNOWN_SERVICE_SECTIONS: ServiceSection[] = [
  'message-sources',
  'ticket-automation',
  'ai-providers',
  'chat-widgets',
];
const isServiceSection = (value: string): value is ServiceSection =>
  (KNOWN_SERVICE_SECTIONS as string[]).includes(value);

type Props = {
  isGlobalAdmin: boolean;
  /** Sub-section from parent hash (e.g. `/settings#integrations/ai-providers`). */
  section?: string;
};

export const ConnectedServicesSettings = ({ isGlobalAdmin, section }: Props) => {
  const navigate = useNavigate();
  const initial = section && isServiceSection(section) ? section : 'message-sources';
  const [active, setActive] = useState<ServiceSection>(initial);

  useEffect(() => {
    if (section && isServiceSection(section)) setActive(section);
  }, [section]);

  const goToSection = (next: ServiceSection) => {
    setActive(next);
    navigate(`#integrations/${next}`, { replace: true });
  };

  const sections = [
    { id: 'message-sources' as ServiceSection, label: 'Message Sources', description: 'Configure Email, Gmail, Telegram, Slack inboxes' },
    { id: 'ticket-automation' as ServiceSection, label: 'Ticket Automation', description: 'Configure Jira and ticket workflows' },
    ...(isGlobalAdmin
      ? [
          { id: 'ai-providers' as ServiceSection, label: 'AI Providers', description: 'Configure OpenAI, Anthropic and models' },
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
      {isGlobalAdmin && active === 'ai-providers' && <AIProvidersSettings />}
      {isGlobalAdmin && active === 'chat-widgets' && <ChatWidgetSettings />}
    </div>
  );
};
