import {
  Folder,
  Clock,
  User,
  Target,
  ExternalLink,
  Bot,
  AlertTriangle,
  Ticket,
  GitBranch,
  Building2,
} from 'lucide-react';
import type { MessageThread } from '@/services/message.service';
import { Badge } from '@/components/ui/Badge';
import { useDepartments } from '@/hooks/useDepartments';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { getChannelIcon, getCategoryDisplay } from '@/lib/messageHelpers';
import { formatDate, formatAge, safeCssColor } from '@/lib/utils';
import { STAGE_COLORS } from '@/components/tickets/LeadQualificationPanel';
import { MessageSignalBadges } from './MessageSignalBadges';

type MessageListItemProps = {
  thread: MessageThread;
  onOpen: (thread: MessageThread) => void;
};

export const MessageListItem = ({ thread, onOpen }: MessageListItemProps) => {
  const msg = thread.latestMessage;
  const { data: allDepts = [] } = useDepartments();
  if (!msg) return null;
  // Wave 5 C-1: runner-up depts from the routing decision. Empty array = nothing to render.
  const nearMissNames =
    (msg.nearMissDepts ?? [])
      .map((deptId) => allDepts.find((dept) => dept.id === deptId)?.name)
      .filter((name): name is string => Boolean(name));
  const primaryDept = msg.departmentId
    ? allDepts.find((dept) => dept.id === msg.departmentId)
    : undefined;
  const needsRouting = msg.status === 'needs_routing';

  const analysis = msg.metadata?.analysis as { suggestedCategory?: string } | undefined;

  const receivedAt = (msg.metadata as { receivedAt?: string })?.receivedAt ?? msg.createdAt;

  const leadMeta = msg.metadata as
    | { leadQualifiedAt?: string; leadCategory?: string; leadState?: { stage: string } }
    | undefined;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-sm">
      <CardContent className="p-3">
        {/* Row 1: channel icon + sender + time + Open */}
        <div className="flex gap-2 items-center min-w-0">
          <span className="shrink-0 text-muted-foreground">{getChannelIcon(msg.channel)}</span>
          <span className="flex-1 min-w-0 text-sm font-semibold truncate">{thread.sender}</span>
          <span
            className="text-xs whitespace-nowrap text-muted-foreground shrink-0"
            title={`Received: ${formatDate(receivedAt)}`}
          >
            <Clock className="inline w-3 h-3 mr-0.5 -mt-0.5" />
            {formatAge(receivedAt)}
          </span>
          <Button variant="outline" onClick={() => onOpen(thread)} className="gap-1.5 shrink-0">
            <ExternalLink className="w-4 h-4" />
            Open
          </Button>
        </div>

        {/* Row 2: subject */}
        {msg.subject && (
          <p className="text-xs text-muted-foreground truncate mt-0.5 pl-5">{msg.subject}</p>
        )}

        {/* Row 2.5: primary dept badge (resolved by smart routing) + Wave 5 C-1 near-miss
            chips — routing engine had this conv close between depts; surface the
            runner-ups so agents in other depts can still discover the message. */}
        {(primaryDept || needsRouting || nearMissNames.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-1 pl-5">
            {needsRouting ? (
              <span
                className="inline-flex gap-1 items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                title="Routing engine found no winning department — awaiting manual triage"
              >
                <AlertTriangle className="w-3 h-3" />
                Needs routing
              </span>
            ) : (
              primaryDept && (
                <span
                  className="inline-flex gap-1 items-center px-1.5 py-0.5 text-[10px] font-medium rounded"
                  style={{
                    backgroundColor: primaryDept.color
                      ? `${safeCssColor(primaryDept.color)}22`
                      : undefined,
                    color: primaryDept.color ? safeCssColor(primaryDept.color) : undefined,
                  }}
                  title={`Routed to ${primaryDept.name}`}
                >
                  <Building2 className="w-3 h-3" />
                  {primaryDept.name}
                </span>
              )
            )}
            {nearMissNames.map((name) => (
              <span
                key={name}
                className="inline-flex gap-1 items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200"
                title="The routing engine considered this department too — close runner-up score"
              >
                <GitBranch className="w-3 h-3" />
                also matched: {name}
              </span>
            ))}
          </div>
        )}

        {/* Row 3: content preview */}
        <p className="pl-5 mt-1 text-sm break-words text-muted-foreground line-clamp-2">
          {msg.content ?? msg.subject ?? ''}
        </p>

        {/* Row 4: Assignee + linked ticket */}
        <div className="flex gap-2 items-center pl-5 mt-2">
          {msg.assigneeId && (
            <Badge
              variant="secondary"
              className="flex gap-1 items-center h-5 px-1.5"
              title={`Assigned to ${msg.assigneeName ?? 'User'}`}
            >
              <User className="w-2.5 h-2.5" />
              {msg.assigneeName ?? 'User'}
            </Badge>
          )}
          {thread.hasTicket && (
            <Badge
              variant={thread.linkedTicketStatus === 'in_progress' ? 'warning' : 'default'}
              className="flex gap-1 items-center h-5 px-1.5"
              title={
                thread.linkedTicketStatus
                  ? `Ticket · ${thread.linkedTicketStatus.replace('_', ' ')}`
                  : 'Ticket'
              }
            >
              <Ticket className="w-2.5 h-2.5" />Ticket
              {thread.linkedTicketStatus === 'in_progress' && <span>· In progress</span>}
            </Badge>
          )}
        </div>

        {/* Row 5: Signal badges + list-only badges + ID */}
        <div className="flex flex-wrap gap-1.5 items-center mt-1.5 pl-5">
          <MessageSignalBadges message={thread.latestIncomingMessage ?? msg} size="sm" />

          {/* Category */}
          {analysis?.suggestedCategory && getCategoryDisplay(analysis.suggestedCategory) && (
            <Badge
              variant="secondary"
              className="flex gap-1 items-center h-5 px-1.5"
              title="AI Suggested Category"
            >
              <Folder className="w-2.5 h-2.5" />
              {getCategoryDisplay(analysis.suggestedCategory)}
            </Badge>
          )}

          {/* Lead — single badge showing stage or fallback */}
          {thread.isLead &&
            (() => {
              const stage = leadMeta?.leadState?.stage;
              if (stage !== undefined && stage in STAGE_COLORS) {
                return (
                  <Badge
                    variant={STAGE_COLORS[stage]}
                    className="flex gap-1 items-center h-5 px-1.5"
                    title={`Lead · ${stage.replace(/_/g, ' ')}`}
                  >
                    <Target className="w-2.5 h-2.5" />
                    {STAGE_COLORS[stage] === 'danger' && <AlertTriangle className="w-2.5 h-2.5" />}
                    {stage.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
                  </Badge>
                );
              }
              return (
                <Badge
                  variant="default"
                  className="flex gap-1 items-center h-5 px-1.5"
                  title="Qualified lead"
                >
                  <Target className="w-2.5 h-2.5" />
                  Lead
                </Badge>
              );
            })()}

          {/* Bot replied */}
          {(msg.metadata?.autoReply as { sent?: boolean } | undefined)?.sent && (
            <Badge
              variant="secondary"
              className="flex gap-1 items-center h-5 px-1.5"
              title="Auto-reply sent by bot"
            >
              <Bot className="w-2.5 h-2.5" />
              Bot Replied
            </Badge>
          )}

          {/* Labels */}
          {(msg.labels as { id: number; name: string; color: string }[] | undefined)?.map(
            (label) => (
              <Badge
                key={label.id}
                variant="secondary"
                className="flex gap-1 items-center h-5 px-1.5"
                title={label.name}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: safeCssColor(label.color) }}
                />
                {label.name}
              </Badge>
            )
          )}

          {/* ID */}
          <span className="ml-auto font-mono text-xs text-muted-foreground shrink-0">
            #{msg.id}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
