import { useState } from 'react';
import { Mail, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { TicketComments } from './TicketComments';
import { TicketAttachments } from './TicketAttachments';
import { formatDate } from '@/lib/utils';
import type { Message } from '@/types';

type Tab = 'comments' | 'attachments' | 'messages';

type TicketPanelTabsProps = {
  ticketId: number;
  hasJiraLink: boolean;
  linkedMessages: Message[];
  loadingMessages: boolean;
};

export function TicketPanelTabs({
  ticketId,
  hasJiraLink,
  linkedMessages,
  loadingMessages,
}: TicketPanelTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('comments');
  const [commentCount, setCommentCount] = useState(0);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'comments', label: 'Comments', badge: commentCount > 0 ? commentCount : undefined },
    { id: 'attachments', label: 'Attachments' },
    {
      id: 'messages',
      label: 'Messages',
      badge: linkedMessages.length > 0
        ? new Set(linkedMessages.map((m) => m.threadId ?? `solo-${m.id}`)).size
        : undefined,
    },
  ];

  return (
    <div className="pt-6 border-t">
      {/* Tab bar */}
      <div className="flex border-b border-border mb-4">
        {tabs.map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {badge !== undefined && (
              <span
                className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold ${
                  activeTab === id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-foreground/15 text-foreground/70'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

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
        <TicketAttachments ticketId={ticketId} />
      </div>

      {/* Messages */}
      <div className={activeTab !== 'messages' ? 'hidden' : ''}>
        {loadingMessages ? (
          <p className="py-4 text-sm text-center text-muted-foreground">Loading messages…</p>
        ) : linkedMessages.length === 0 ? (
          <p className="py-4 text-sm text-center text-muted-foreground">No linked messages.</p>
        ) : (
          <div className="space-y-2">
            {(() => {
              // Group by threadId; messages without one are shown individually
              const groups = new Map<string, typeof linkedMessages>();
              for (const msg of linkedMessages) {
                const key = msg.threadId ?? `solo-${msg.id}`;
                const arr = groups.get(key) ?? [];
                arr.push(msg);
                groups.set(key, arr);
              }
              return Array.from(groups.values()).map((msgs) => {
                const sorted = [...msgs].sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
                const root = sorted.find((m) => !m.parentMessageId) ?? sorted[0];
                const count = sorted.length;
                return (
                  <Link
                    key={root.id}
                    to={`/messages?id=${root.id}`}
                    className="flex gap-3 items-start p-3 rounded-lg border transition-colors bg-muted border-border hover:bg-accent group"
                  >
                    <div className="p-2 rounded bg-blue-500/10 flex-shrink-0">
                      <Mail className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-2 items-center mb-1">
                        <Badge variant="secondary" className="text-xs">{root.channel}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(root.createdAt)}</span>
                        {count > 1 && (
                          <span className="text-xs text-muted-foreground">{count} messages</span>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{root.sender}</p>
                      {root.subject && (
                        <p className="text-sm truncate text-muted-foreground group-hover:text-blue-500 transition-colors">
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
      </div>

    </div>
  );
}
