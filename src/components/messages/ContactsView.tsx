import { useState, useCallback, useEffect } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Mail,
  MessageSquare,
  Ticket,
  Target,
  Clock,
  User,
} from 'lucide-react';
import { ContactProfilePanel } from '@/components/contacts/ContactProfilePanel';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { formatDate } from '@/lib/utils';
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

function ContactRow({
  contact,
  apiFilters,
  initialExpanded,
  onOpenMessage,
  onViewProfile,
}: {
  contact: MessageContact;
  apiFilters: Record<string, string>;
  initialExpanded?: boolean;
  onOpenMessage: (message: Message) => void;
  onViewProfile: (email: string) => void;
}) {
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const [subjectState, setSubjectState] = useState<SubjectState>({ loading: false, data: null });
  const [openingId, setOpeningId] = useState<number | null>(null);

  useEffect(() => {
    if (initialExpanded && subjectState.data === null) {
      setSubjectState({ loading: true, data: null });
      void messageService
        .getContactSubjects(contact.sender, apiFilters)
        .then((response) => {
          setSubjectState({ loading: false, data: response.data ?? [] });
        })
        .catch(() => {
          setSubjectState({ loading: false, data: [] });
        });
    }
  }, []);

  const handleExpand = useCallback(async () => {
    if (!expanded && subjectState.data === null) {
      setSubjectState({ loading: true, data: null });
      try {
        const response = await messageService.getContactSubjects(contact.sender, apiFilters);
        setSubjectState({ loading: false, data: response.data ?? [] });
      } catch {
        setSubjectState({ loading: false, data: [] });
      }
    }
    setExpanded((val) => !val);
  }, [expanded, subjectState.data, contact.sender, apiFilters]);

  const handleSubjectClick = useCallback(
    async (subject: MessageContactSubject) => {
      setOpeningId(subject.latestMessageId);
      try {
        const response = await messageService.getById(subject.latestMessageId);
        if (response.success && response.data) {
          onOpenMessage(response.data);
        }
      } catch {
        // silently fail
      } finally {
        setOpeningId(null);
      }
    },
    [onOpenMessage]
  );

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Contact header row */}
        <div
          role="button"
          tabIndex={0}
          className="flex gap-3 items-center px-4 py-3 w-full text-left transition-colors hover:bg-muted/50 cursor-pointer"
          onClick={() => void handleExpand()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              void handleExpand();
            }
          }}
        >
          <span className="text-muted-foreground">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <div className="flex flex-1 gap-2 items-center min-w-0">
            <Mail className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="font-medium truncate">{contact.sender}</span>
          </div>
          <div className="flex flex-wrap gap-2 justify-end items-center shrink-0">
            {contact.isLead && (
              <Badge variant="default" className="flex gap-1 items-center text-xs">
                <Target className="w-3 h-3" />
                Lead
              </Badge>
            )}
            {contact.hasTicket && (
              <Badge variant="secondary" className="flex gap-1 items-center text-xs">
                <Ticket className="w-3 h-3" />
                Has Ticket
              </Badge>
            )}
            {contact.hasUnread && (
              <Badge variant="warning" className="flex gap-1 items-center text-xs">
                Unread
              </Badge>
            )}
            <span className="flex gap-1 items-center text-xs text-muted-foreground">
              <MessageSquare className="w-3 h-3" />
              {contact.messageCount}
            </span>
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {contact.subjectCount} {contact.subjectCount === 1 ? 'topic' : 'topics'}
            </span>
            <span className="flex gap-1 items-center text-xs whitespace-nowrap text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatDate(contact.lastMessageAt)}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="flex gap-1 items-center h-7 shrink-0"
              onClick={(event) => {
                event.stopPropagation();
                onViewProfile(contact.sender);
              }}
            >
              <User className="w-3 h-3" />
              Profile
            </Button>
          </div>
        </div>

        {/* Expanded subjects */}
        {expanded && (
          <div className="border-t divide-y">
            {subjectState.loading && (
              <div className="px-10 py-3 space-y-2">
                {(['s1', 's2'] as const).map((key) => (
                  <div key={key} className="h-4 rounded animate-pulse bg-muted" />
                ))}
              </div>
            )}
            {!subjectState.loading && subjectState.data?.length === 0 && (
              <p className="px-10 py-3 text-sm text-muted-foreground">No conversations found.</p>
            )}
            {!subjectState.loading &&
              subjectState.data?.map((subject) => (
                <button
                  key={subject.normalizedSubject}
                  className="flex w-full items-center gap-3 px-10 py-2.5 text-left hover:bg-muted/40 transition-colors disabled:opacity-60"
                  disabled={openingId === subject.latestMessageId}
                  onClick={() => void handleSubjectClick(subject)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{subject.displaySubject}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end items-center shrink-0">
                    {subject.isLead && (
                      <Badge variant="default" className="flex gap-1 items-center text-xs">
                        <Target className="w-3 h-3" />
                        Lead
                      </Badge>
                    )}
                    {subject.hasTicket && (
                      <Badge variant="secondary" className="flex gap-1 items-center text-xs">
                        <Ticket className="w-3 h-3" />
                        Ticket
                      </Badge>
                    )}
                    <span className="flex gap-1 items-center text-xs text-muted-foreground">
                      <MessageSquare className="w-3 h-3" />
                      {subject.messageCount}
                    </span>
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDate(subject.lastMessageAt)}
                    </span>
                    {openingId === subject.latestMessageId && (
                      <span className="text-xs text-muted-foreground">Opening…</span>
                    )}
                  </div>
                </button>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
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

  if (loading) {
    return (
      <div className="space-y-2">
        {(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const).map((key, idx) => (
          <Card key={key}>
            <CardContent className="p-4">
              <div
                className="h-4 rounded animate-pulse bg-muted"
                style={{ width: `${40 + (idx % 3) * 15}%` }}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Mail className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">No contacts found</h3>
          <p className="text-muted-foreground">No senders match your current filters.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {contacts.map((contact) => (
        <ContactRow
          key={contact.sender}
          contact={contact}
          apiFilters={apiFilters}
          initialExpanded={focusSender ? contact.sender === focusSender : undefined}
          onOpenMessage={onOpenMessage}
          onViewProfile={setProfileEmail}
        />
      ))}
      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={(page) => void fetchContacts(page)}
          loading={loading}
        />
      )}
      {profileEmail && (
        <ContactProfilePanel email={profileEmail} onClose={() => setProfileEmail(null)} />
      )}
    </div>
  );
}
