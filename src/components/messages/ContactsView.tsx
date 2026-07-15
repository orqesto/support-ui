import { useState, useCallback, useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Mail, MessageSquare, Ticket, Target } from 'lucide-react';
import { ContactProfilePanel } from '@/components/contacts/ContactProfilePanel';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { formatAge, formatDate } from '@/lib/utils';
import {
  messageService,
  type MessageContact,
  type MessageContactSubject,
  type PaginationMeta,
} from '@/services/message.service';
import type { Message } from '@/types';

type ContactsViewProps = {
  apiFilters: Record<string, string>;
  focusSender?: string;
  onOpenMessage: (message: Message) => void;
  onPaginationChange?: (pagination: PaginationMeta) => void;
};

type SubjectState = {
  loading: boolean;
  data: MessageContactSubject[] | null;
};

type SortKey = 'recent' | 'messages' | 'name' | 'unread';

const SORTS: Record<string, { label: string; fn: (lhs: MessageContact, rhs: MessageContact) => number }> = {
  recent: {
    label: 'Recent',
    fn: (lhs, rhs) => new Date(rhs.lastMessageAt).getTime() - new Date(lhs.lastMessageAt).getTime(),
  },
  messages: { label: 'Most messages', fn: (lhs, rhs) => rhs.messageCount - lhs.messageCount },
  name: { label: 'Name', fn: (lhs, rhs) => lhs.sender.localeCompare(rhs.sender) },
  unread: {
    label: 'Unread first',
    fn: (lhs, rhs) =>
      Number(rhs.hasUnread) - Number(lhs.hasUnread) ||
      new Date(rhs.lastMessageAt).getTime() - new Date(lhs.lastMessageAt).getTime(),
  },
};

function ContactRow({
  contact,
  apiFilters,
  active,
  onOpenMessage,
  onViewProfile,
}: {
  contact: MessageContact;
  apiFilters: Record<string, string>;
  active: boolean;
  onOpenMessage: (message: Message) => void;
  onViewProfile: (email: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subjectState, setSubjectState] = useState<SubjectState>({ loading: false, data: null });
  const [openingId, setOpeningId] = useState<number | null>(null);

  const loadSubjects = useCallback(async () => {
    setSubjectState({ loading: true, data: null });
    try {
      const response = await messageService.getContactSubjects(contact.sender, apiFilters);
      setSubjectState({ loading: false, data: response.data ?? [] });
    } catch {
      setSubjectState({ loading: false, data: [] });
    }
  }, [contact.sender, apiFilters]);

  const handleToggle = useCallback(async () => {
    if (!expanded && subjectState.data === null) await loadSubjects();
    setExpanded((val) => !val);
  }, [expanded, subjectState.data, loadSubjects]);

  const handleSubjectClick = useCallback(
    async (subject: MessageContactSubject) => {
      setOpeningId(subject.latestMessageId);
      try {
        const response = await messageService.getById(subject.latestMessageId);
        if (response.success && response.data) onOpenMessage(response.data);
      } catch {
        // silently fail
      } finally {
        setOpeningId(null);
      }
    },
    [onOpenMessage]
  );

  return (
    <div
      className={`group transition-colors ${
        active ? 'bg-primary/5' : 'hover:bg-muted/50'
      }`}
    >
      <div className="flex items-stretch">
        {/* Full-height expand column — separate hit target from the row's open action */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleToggle();
          }}
          title={expanded ? 'Collapse topics' : `Show ${contact.subjectCount} topics`}
          className={`flex justify-center items-center self-stretch w-9 shrink-0 border-r transition-colors ${
            expanded
              ? 'bg-muted/70 border-border'
              : 'border-transparent hover:bg-muted'
          }`}
        >
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
          />
        </button>

        {/* Identity / signals — click opens the profile */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onViewProfile(contact.sender)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onViewProfile(contact.sender);
            }
          }}
          className="flex flex-1 gap-3 items-center py-2 pr-3 pl-2.5 min-w-0 cursor-pointer"
        >
          <ContactAvatar email={contact.sender} size={30} />

          <div className="flex-1 min-w-0">
            <div className="flex gap-2 items-center min-w-0">
              <span
                className={`truncate text-sm ${contact.hasUnread ? 'font-bold' : 'font-semibold'} text-foreground`}
              >
                {contact.sender}
              </span>
              {contact.isLead && (
                <span className="inline-flex gap-1 items-center px-1.5 h-[19px] rounded-md text-[10.5px] font-bold tracking-wide bg-primary/10 text-primary shrink-0">
                  <Target className="w-3 h-3" /> LEAD
                </span>
              )}
              {contact.hasUnread && (
                <span
                  className="w-[7px] h-[7px] rounded-full bg-warning shrink-0"
                  title="Unread messages"
                />
              )}
            </div>
          </div>

          {/* Tier-2 reference signals */}
          <div className="hidden sm:flex gap-3 items-center text-muted-foreground shrink-0">
            {contact.hasTicket && (
              <span title="Has open ticket">
                <Ticket className="w-3.5 h-3.5" />
              </span>
            )}
            <span
              className="inline-flex gap-1 items-center text-xs tabular-nums"
              title={`${contact.messageCount} messages`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {contact.messageCount}
            </span>
            <span
              className="text-xs tabular-nums whitespace-nowrap w-12 text-right"
              title={`${contact.subjectCount} topics`}
            >
              {contact.subjectCount} {contact.subjectCount === 1 ? 'topic' : 'topics'}
            </span>
          </div>

          <div className="hidden sm:block w-px h-6 bg-border" />

          <span
            className="text-xs text-muted-foreground w-9 text-right tabular-nums shrink-0"
            title={formatDate(contact.lastMessageAt)}
          >
            {formatAge(contact.lastMessageAt)}
          </span>

          <ArrowRight className="w-4 h-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
      </div>

      {/* Expanded topics — nested under the contact */}
      {expanded && (
        <div className="pb-1.5 pl-[34px] pr-3">
          <div className="pl-3 border-l border-border">
            {subjectState.loading && (
              <div className="py-2 space-y-2">
                {(['s1', 's2'] as const).map((key) => (
                  <div key={key} className="h-4 rounded animate-pulse bg-muted" />
                ))}
              </div>
            )}
            {!subjectState.loading && subjectState.data?.length === 0 && (
              <p className="px-2 py-2.5 text-xs text-muted-foreground">No conversations found.</p>
            )}
            {!subjectState.loading &&
              subjectState.data?.map((subject) => (
                <button
                  key={subject.normalizedSubject}
                  type="button"
                  disabled={openingId === subject.latestMessageId}
                  onClick={() => void handleSubjectClick(subject)}
                  className="group/topic flex items-center gap-3 w-full px-2 py-1.5 rounded-md text-left hover:bg-muted/60 transition-colors disabled:opacity-60"
                >
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                  <span className="flex-1 text-[12.5px] truncate text-muted-foreground group-hover/topic:text-foreground">
                    {subject.displaySubject || '(no subject)'}
                  </span>
                  {subject.isLead && <Target className="w-3 h-3 text-primary shrink-0" />}
                  {subject.hasTicket && <Ticket className="w-3 h-3 text-muted-foreground shrink-0" />}
                  <span className="inline-flex gap-1 items-center text-[11px] text-muted-foreground tabular-nums">
                    <MessageSquare className="w-3 h-3" />
                    {subject.messageCount}
                  </span>
                  <span className="text-[11px] text-muted-foreground w-9 text-right tabular-nums">
                    {openingId === subject.latestMessageId ? '…' : formatAge(subject.lastMessageAt)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SenderFocusView({
  sender,
  apiFilters,
  onBack,
  onOpenMessage,
}: {
  sender: string;
  apiFilters: Record<string, string>;
  onBack: () => void;
  onOpenMessage: (message: Message) => void;
}) {
  const [subjects, setSubjects] = useState<MessageContactSubject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    void messageService
      .getContactSubjects(sender, apiFilters)
      .then((res) => setSubjects(res.data ?? []))
      .catch(() => setSubjects([]))
      .finally(() => setLoading(false));
  }, [sender, apiFilters]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 px-2">
          <ArrowLeft className="w-4 h-4" />
          All contacts
        </Button>
        <span className="text-sm font-medium truncate">{sender}</span>
      </div>

      {loading && (
        <div className="space-y-2">
          {(['s1', 's2', 's3'] as const).map((key) => (
            <Card key={key}>
              <CardContent className="p-4">
                <div className="h-4 rounded animate-pulse bg-muted w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && subjects?.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No conversations found.
          </CardContent>
        </Card>
      )}

      {!loading && subjects && subjects.length > 0 && (
        <div className="space-y-2">
          {subjects.map((subject) => (
            <Card
              key={subject.normalizedSubject}
              className="cursor-pointer transition-colors hover:bg-muted/50"
              onClick={() => {
                if (openingId) return;
                setOpeningId(subject.latestMessageId);
                void messageService
                  .getById(subject.latestMessageId)
                  .then((res) => {
                    if (res.success && res.data) onOpenMessage(res.data);
                  })
                  .catch(() => undefined)
                  .finally(() => setOpeningId(null));
              }}
            >
              <CardContent className="flex gap-3 justify-between items-center p-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{subject.displaySubject ?? '(no subject)'}</p>
                  <p className="text-xs text-muted-foreground">
                    {subject.messageCount} message{subject.messageCount !== 1 ? 's' : ''} ·{' '}
                    {formatDate(subject.lastMessageAt)}
                  </p>
                </div>
                {openingId === subject.latestMessageId && (
                  <span className="text-xs text-muted-foreground">Opening…</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContactsView({
  apiFilters,
  focusSender,
  onOpenMessage,
  onPaginationChange,
}: ContactsViewProps) {
  const [, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('recent');
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);

  const filtersKey = JSON.stringify(apiFilters);
  // BE `messageContactController.getContacts` is dept-scoped via X-Department-Context.
  const selectedDeptKey = useDepartmentContextKey();

  const fetchContacts = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const response = await messageService.getContacts(apiFilters, page, 50);
        if (response.success && response.data) {
          setContacts(response.data);
          setPagination(response.pagination);
          onPaginationChange?.(response.pagination);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    },
    // selectedDeptKey is a refresh trigger via the axios interceptor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtersKey, selectedDeptKey]
  );

  useEffect(() => {
    void fetchContacts(1);
  }, [fetchContacts]);

  // Sort reorders the loaded page; org-wide search/filter is handled server-side
  // by MessagesPage's filter bar (so we don't duplicate a search input here).
  const visible = useMemo(() => [...contacts].sort(SORTS[sort].fn), [contacts, sort]);

  if (focusSender) {
    return (
      <SenderFocusView
        sender={focusSender}
        apiFilters={apiFilters}
        onBack={() =>
          setSearchParams(
            (params) => {
              params.delete('sender');
              params.delete('mode');
              return params;
            },
            { replace: true }
          )
        }
        onOpenMessage={onOpenMessage}
      />
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card border-border">
      {/* Toolbar */}
      <div className="flex flex-shrink-0 gap-2 justify-between items-center px-4 py-3 border-b border-border">
        <div className="flex gap-2 items-baseline">
          <h2 className="text-base font-bold tracking-tight text-foreground">Contacts</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{pagination.total}</span>
        </div>
        <div className="flex gap-1 items-center px-1 h-8 rounded-lg bg-muted">
          <span className="pl-2 pr-0.5 text-[11px] text-muted-foreground">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-7 pr-1 text-xs font-medium bg-transparent outline-none cursor-pointer text-foreground"
          >
            {Object.entries(SORTS).map(([key, sortDef]) => (
              <option key={key} value={key}>
                {sortDef.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {loading &&
          (['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const).map((key, idx) => (
            <div key={key} className="flex gap-3 items-center px-4 py-2.5">
              <div className="w-[30px] h-[30px] rounded-full animate-pulse bg-muted shrink-0" />
              <div
                className="h-3.5 rounded animate-pulse bg-muted"
                style={{ width: `${35 + (idx % 3) * 15}%` }}
              />
            </div>
          ))}

        {!loading &&
          visible.map((contact) => (
            <ContactRow
              key={contact.sender}
              contact={contact}
              apiFilters={apiFilters}
              active={profileEmail === contact.sender}
              onOpenMessage={onOpenMessage}
              onViewProfile={setProfileEmail}
            />
          ))}

        {!loading && visible.length === 0 && (
          <div className="grid place-items-center py-16 text-center">
            <div>
              <Mail className="mx-auto mb-3 w-7 h-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No senders match your current filters.</p>
            </div>
          </div>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div className="px-4 py-3 border-t border-border">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={(page) => void fetchContacts(page)}
            loading={loading}
          />
        </div>
      )}

      {profileEmail && (
        <ContactProfilePanel
          email={profileEmail}
          onClose={() => setProfileEmail(null)}
          onChanged={() => void fetchContacts(pagination.page)}
        />
      )}
    </div>
  );
}
