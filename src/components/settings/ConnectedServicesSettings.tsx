import { useState } from 'react';
import { Plug } from 'lucide-react';
import { AIProvidersSettings } from './AIProvidersSettings';
import { ChatWidgetSettings } from './ChatWidgetSettings';
import { MessageSourcesSettings } from './MessageSourcesSettings';
import { TicketAutomationSettings } from './TicketAutomationSettings';

type ServiceSection = 'message-sources' | 'ticket-automation' | 'ai-providers' | 'chat-widgets';

type Props = { isGlobalAdmin: boolean };

export const ConnectedServicesSettings = ({ isGlobalAdmin }: Props) => {
  const [active, setActive] = useState<ServiceSection>('message-sources');

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
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-md transition-all ${
              active === s.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
            title={s.description}
          >
            {s.label}
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
