import { useState, type ReactNode } from 'react';
import { Mail, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TicketComments } from './TicketComments';
import { TicketAttachments } from './TicketAttachments';
import { TicketThreads } from './TicketThreads';
import { formatDate } from '@/lib/utils';
import type { Message } from '@/types';
import type { TicketThread } from '@/services/ticketThreads.service';
import { getConvUrlId } from '@/lib/messageHelpers';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';

type Tab = 'messages' | 'comments' | 'attachments' | 'details';

type TicketPanelTabsProps = {
  ticketId: number;
  hasJiraLink: boolean;
  linkedMessages: Message[];
  loadingMessages: boolean;
  /** The ticket's status — which threads a reply ticks by default. */
  ticketStatus?: string;
  /** The page shows the reach strip above the description and needs the thread list for it. */
  onThreadsChange?: (threads: TicketThread[]) => void;
  /**
   * The sidebar's properties, shown as a fourth tab when the page is too narrow for the sidebar
   * (as the design's Details tab). Absent: no Details tab.
   */
  details?: ReactNode;
};

export function TicketPanelTabs({
  ticketId,
  hasJiraLink,
  linkedMessages,
  loadingMessages,
  ticketStatus,
  onThreadsChange,
  details,
}: TicketPanelTabsProps) {
  // Threads first (Tickets v3): a ticket is the threads it explains and the update they are owed.
  const [chosenTab, setActiveTab] = useState<Tab>('messages');
  // Details exists only while the sidebar is folded in; widening the page falls back to Threads.
  const activeTab: Tab = chosenTab === 'details' && !details ? 'messages' : chosenTab;
  const [commentCount, setCommentCount] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  // What the ticket's own list reports: a count, 'unavailable' (older backend — count the
  // fallback list instead), or null (loading / failed — no number).
  const [threadCount, setThreadCount] = useState<number | 'unavailable' | null>(null);
  // Same reason as the copy-link buttons: a conversation link that carries the org code
  // 404s in the wrong workspace instead of resolving to a different conversation.
  const orgCode = useCurrentOrgCode();

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    {
      id: 'messages',
      label: 'Threads',
      // A thread count either way: the ticket's own list when the backend has it, else the
      // older inbox-based list grouped by thread.
      badge:
        typeof threadCount === 'number'
          ? threadCount > 0
            ? threadCount
            : undefined
          : threadCount === 'unavailable' && linkedMessages.length > 0
            ? new Set(linkedMessages.map((msg) => msg.externalThreadId ?? `solo-${msg.id}`)).size
            : undefined,
    },
    { id: 'comments', label: 'Comments', badge: commentCount > 0 ? commentCount : undefined },
    { id: 'attachments', label: 'Files', badge: fileCount > 0 ? fileCount : undefined },
    ...(details ? [{ id: 'details' as const, label: 'Details' }] : []),
  ];

  return (
    <div className="space-y-3">
      {/* Tab bar — sticks to the top of the ticket while its threads scroll under it. */}
      <div
        role="tablist"
        className="flex overflow-x-auto sticky top-0 z-[5] gap-0.5 -mx-0.5 px-0.5 whitespace-nowrap border-b border-border bg-background [scrollbar-width:none]"
      >
        {tabs.map(({ id, label, badge }) => (
          <Button
            key={id}
            variant="ghost"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={`font-display h-10 gap-1.5 px-3 text-[13px] rounded-none border-b-2 -mb-px hover:bg-transparent ${
              activeTab === id
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {badge !== undefined && (
              <span
                className={`grid place-items-center min-w-[18px] h-[18px] px-[5px] rounded-full font-mono text-[10.5px] ${
                  activeTab === id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {badge}
              </span>
            )}
          </Button>
        ))}
      </div>

      {activeTab === 'details' && (
        <Card padding="none" className="rounded-[10px] shadow-none">
          {details}
        </Card>
      )}

      {/* Comments — always mounted to preserve socket subscriptions */}
      <div className={activeTab !== 'comments' ? 'hidden' : ''}>
        <TicketComments
          ticketId={ticketId}
          hasJiraLink={hasJiraLink}
          onCountChange={setCommentCount}
        />
      </div>

      {/* Attachments — always mounted to preserve socket subscriptions */}
      <div className={activeTab !== 'attachments' ? 'hidden' : ''}>
        <TicketAttachments ticketId={ticketId} onCountChange={setFileCount} />
      </div>

      {/* Messages — every thread the ticket covers (2026-09-30); the older inbox-based list is
          the fallback for a backend that predates it. */}
      <div className={activeTab !== 'messages' ? 'hidden' : ''}>
        <TicketThreads
          ticketId={ticketId}
          onCountChange={setThreadCount}
          ticketStatus={ticketStatus}
          onThreadsChange={onThreadsChange}
          showReachStrip={false}
          fallback={
            <>
              {loadingMessages ? (
                <p className="py-4 text-sm text-center text-muted-foreground">Loading threads…</p>
              ) : linkedMessages.length === 0 ? (
                <p className="py-4 text-sm text-center text-muted-foreground">No linked threads.</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    // Group by threadId; messages without one are shown individually
                    const groups = new Map<string, typeof linkedMessages>();
                    for (const msg of linkedMessages) {
                      const key = msg.externalThreadId ?? `solo-${msg.id}`;
                      const arr = groups.get(key) ?? [];
                      arr.push(msg);
                      groups.set(key, arr);
                    }
                    return Array.from(groups.values()).map((msgs) => {
                      const sorted = [...msgs].sort(
                        (msgA, msgB) =>
                          new Date(msgA.createdAt).getTime() - new Date(msgB.createdAt).getTime()
                      );
                      const root = sorted[0];
                      const count = sorted.length;
                      return (
                        <Link
                          key={root.id}
                          to={`/threads?id=${getConvUrlId(root, orgCode)}`}
                          className="flex gap-3 items-start p-3 rounded-lg border transition-colors bg-muted border-border hover:bg-accent group"
                        >
                          <div className="p-2 rounded bg-muted flex-shrink-0">
                            <Mail className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex gap-2 items-center mb-1">
                              <Badge variant="secondary" className="text-xs">
                                {root.channel}
                              </Badge>
                              <span className="font-mono text-xs text-muted-foreground">
                                {formatDate(root.createdAt)}
                              </span>
                              {count > 1 && (
                                <span className="text-xs text-muted-foreground">
                                  {count} messages
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium truncate">{root.sender}</p>
                            {root.subject && (
                              <p className="text-sm truncate text-muted-foreground group-hover:text-primary transition-colors">
                                {root.subject}
                              </p>
                            )}
                          </div>
                          <ExternalLinkIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      );
                    });
                  })()}
                </div>
              )}
            </>
          }
        />
      </div>
    </div>
  );
}
