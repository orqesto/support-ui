import { Mail, MessageSquare, Clock, Folder, Target, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { Message } from '@/types';
import { MessageSignalBadges } from './MessageSignalBadges';
import { getCategoryDisplay } from '@/lib/messageHelpers';
import { STAGE_COLORS } from '@/components/tickets/LeadQualificationPanel';

type MessageBadgesProps = {
  message: Message;
};

const getChannelIcon = (channel: string | null | undefined) => {
  switch (channel) {
    case 'email':
      return <Mail className="w-5 h-5" />;
    case 'slack':
    case 'telegram':
    case 'chat':
      return <MessageSquare className="w-5 h-5" />;
    default:
      return <Mail className="w-5 h-5" />;
  }
};

export const MessageBadges = ({ message }: MessageBadgesProps) => {
  const analysis = message.metadata?.analysis as
    | { suggestedCategory?: string }
    | undefined;
  const leadMeta = message.metadata as
    | { leadState?: { stage: string } }
    | undefined;
  const stage = leadMeta?.leadState?.stage;

  return (
    <div className="flex gap-3 items-center">
      <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/10">
        {getChannelIcon(message.channel)}
      </div>
      <div className="flex-1">
        <div className="flex flex-wrap gap-2 items-center">
          <MessageSignalBadges message={message} size="md" />
          {message.awaitingCustomerResponse && (
            <Badge variant="warning" className="flex gap-1 items-center" title="Waiting for customer to respond">
              <Clock className="w-4 h-4" />
              Awaiting Response
            </Badge>
          )}
          {analysis?.suggestedCategory && getCategoryDisplay(analysis.suggestedCategory) && (
            <Badge variant="secondary" className="flex gap-1 items-center" title="AI Suggested Category">
              <Folder className="w-4 h-4" />
              {getCategoryDisplay(analysis.suggestedCategory)}
            </Badge>
          )}
          {message.isLead && stage !== undefined && stage in STAGE_COLORS && (
            <Badge variant={STAGE_COLORS[stage]} className="flex gap-1 items-center" title={`Lead · ${stage.replace(/_/g, ' ')}`}>
              <Target className="w-4 h-4" />
              {STAGE_COLORS[stage] === 'danger' && <AlertTriangle className="w-4 h-4" />}
              {stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Badge>
          )}
          {message.isLead && (stage === undefined || !(stage in STAGE_COLORS)) && (
            <Badge variant="default" className="flex gap-1 items-center">
              <Target className="w-4 h-4" />
              Lead
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
};
