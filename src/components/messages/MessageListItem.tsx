import {
  Folder,
  Clock,
  User,
  Target,
  ExternalLink,
  Bot,
  AlertTriangle,
  Ticket,
} from 'lucide-react';
import type { Department } from '@/types';
import type { MessageThread } from '@/services/message.service';
import { Badge } from '@/components/ui/Badge';
import { useDepartments } from '@/hooks/useDepartments';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { getChannelIcon, getCategoryDisplay } from '@/lib/messageHelpers';
import { stripHtml } from '@/lib/stripHtml';
import { formatDate, formatAge, safeCssColor } from '@/lib/utils';
import { STAGE_COLORS } from '@/components/tickets/LeadQualificationPanel';
import { DepartmentBadge } from './DepartmentBadge';
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
  const nearMissDepts = (msg.nearMissDepts ?? [])
    .map((deptId) => allDepts.find((dept) => dept.id === deptId))
    .filter((dept): dept is Department => Boolean(dept));
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
        {/* Row 0: top metadata — id + age. Same anchor pattern as KanbanCard. */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {/* Row 2.5: primary dept badge (resolved by smart routing) + Wave 5 C-1 near-miss
            chips — routing engine had this conv close between depts; surface the
            runner-ups so agents in other depts can still discover the message. */}
          {((primaryDept ?? needsRouting) || nearMissDepts.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {needsRouting ? (
                <DepartmentBadge variant="needs" />
              ) : (
                primaryDept && <DepartmentBadge variant="primary" dept={primaryDept} />
              )}
              {nearMissDepts.map((dept) => (
                <DepartmentBadge key={dept.id} variant="near-miss" dept={dept} />
              ))}
            </div>
          )}
          <span className="font-mono shrink-0">#{msg.id}</span>
          <Tooltip content={`Received: ${formatDate(receivedAt)}`} size="sm">
            <span className="whitespace-nowrap shrink-0">
              <Clock className="inline w-3 h-3 mr-0.5 -mt-0.5" />
              {formatAge(receivedAt)}
            </span>
          </Tooltip>
        </div>

        {/* Row 1: channel icon + sender + Open */}
        <div className="flex gap-2 items-center min-w-0 mt-1">
          <span className="shrink-0 text-muted-foreground">{getChannelIcon(msg.channel)}</span>
          <span className="flex-1 min-w-0 text-sm font-semibold truncate">{thread.sender}</span>
          <Button variant="outline" onClick={() => onOpen(thread)} className="gap-1.5 shrink-0">
            <ExternalLink className="w-4 h-4" />
            Open
          </Button>
        </div>

        {/* Row 2: subject */}
        {msg.subject && (
          <p className="text-xs text-muted-foreground truncate mt-0.5 pl-5">{msg.subject}</p>
        )}

        {/* Row 3: content preview. Show the customer's most recent message —
            same source the Kanban uses for its signal badges — so the
            preview reads as "what did the customer say?", not "what was the
            most recent event on this thread?" (which on a brand-new conv is
            the bot acknowledgment, full of `<p>…</p>` markup and a tracking
            URL that's just noise to an agent triaging the inbox). Falls
            back to the latest message overall when there's somehow no
            customer-side event yet. stripHtml so HTML-content events still
            render as plain text. */}
        <p className="pl-5 mt-1 text-sm break-words text-muted-foreground line-clamp-2">
          {stripHtml(thread.latestIncomingMessage?.content ?? msg.content ?? '')}
        </p>

        {/* Row 4: Assignee + linked ticket */}
        <div className="flex gap-2 items-center pl-5 mt-2">
          {msg.assigneeId && (
            <Tooltip content={`Assigned to ${msg.assigneeName ?? 'User'}`} size="sm">
              <Badge variant="secondary" className="flex gap-1 items-center h-5 px-1.5">
                <User className="w-2.5 h-2.5" />
                {msg.assigneeName ?? 'User'}
              </Badge>
            </Tooltip>
          )}
          {thread.hasTicket && (
            <Tooltip
              content={
                thread.linkedTicketStatus
                  ? `Ticket · ${thread.linkedTicketStatus.replace('_', ' ')}`
                  : 'Ticket'
              }
              size="sm"
            >
              <Badge
                variant={thread.linkedTicketStatus === 'in_progress' ? 'warning' : 'default'}
                className="flex gap-1 items-center h-5 px-1.5"
              >
                <Ticket className="w-2.5 h-2.5" />
                Ticket
                {thread.linkedTicketStatus === 'in_progress' && <span>· In progress</span>}
              </Badge>
            </Tooltip>
          )}
        </div>

        {/* Row 5: Signal badges + list-only badges + ID */}
        <div className="flex flex-wrap gap-1.5 items-center mt-1.5 pl-5">
          <MessageSignalBadges message={thread.latestIncomingMessage ?? msg} size="sm" />

          {/* Category */}
          {analysis?.suggestedCategory && getCategoryDisplay(analysis.suggestedCategory) && (
            <Tooltip content="AI Suggested Category" size="sm">
              <Badge variant="secondary" className="flex gap-1 items-center h-5 px-1.5">
                <Folder className="w-2.5 h-2.5" />
                {getCategoryDisplay(analysis.suggestedCategory)}
              </Badge>
            </Tooltip>
          )}

          {/* Lead — single badge showing stage or fallback */}
          {thread.isLead &&
            (() => {
              const stage = leadMeta?.leadState?.stage;
              if (stage !== undefined && stage in STAGE_COLORS) {
                return (
                  <Tooltip content={`Lead · ${stage.replace(/_/g, ' ')}`} size="sm">
                    <Badge
                      variant={STAGE_COLORS[stage]}
                      className="flex gap-1 items-center h-5 px-1.5"
                    >
                      <Target className="w-2.5 h-2.5" />
                      {STAGE_COLORS[stage] === 'danger' && (
                        <AlertTriangle className="w-2.5 h-2.5" />
                      )}
                      {stage.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
                    </Badge>
                  </Tooltip>
                );
              }
              return (
                <Tooltip content="Qualified lead" size="sm">
                  <Badge variant="default" className="flex gap-1 items-center h-5 px-1.5">
                    <Target className="w-2.5 h-2.5" />
                    Lead
                  </Badge>
                </Tooltip>
              );
            })()}

          {/* Bot replied */}
          {(msg.metadata?.autoReply as { sent?: boolean } | undefined)?.sent && (
            <Tooltip content="Auto-reply sent by bot" size="sm">
              <Badge variant="secondary" className="flex gap-1 items-center h-5 px-1.5">
                <Bot className="w-2.5 h-2.5" />
                Bot Replied
              </Badge>
            </Tooltip>
          )}

          {/* Labels (gap #16: source tag drives a small "via" hint). */}
          {(msg.labels as { id: number; name: string; color: string; source?: 'conversation' | 'ticket' | 'contact' }[] | undefined)?.map(
            (label) => (
              <Tooltip
                key={label.id}
                content={
                  label.source === 'contact'
                    ? `${label.name} — inherited from contact`
                    : label.source === 'ticket'
                      ? `${label.name} — via linked ticket`
                      : label.name
                }
                size="sm"
              >
                <Badge variant="secondary" className="flex gap-1 items-center h-5 px-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: safeCssColor(label.color) }}
                  />
                  {label.name}
                  {label.source === 'contact' && (
                    <span className="text-[10px] text-muted-foreground/80 ml-0.5">·contact</span>
                  )}
                </Badge>
              </Tooltip>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
};
