import { useEffect, useRef } from 'react';
import { COLUMNS } from '@/components/messages/kanbanColumns';
import { logger } from '@/lib/logger';
import type { MutableRefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { messageService } from '@/services/message.service';
import {
  useMessagesStore,
  defaultFilters,
  QUEUE_FILTERS,
  type FilterState,
} from '@/stores/messagesStore';
import type { Message } from '@/types';

export const VALID_STATUSES = [
  'all',
  'active',
  'awaiting_response',
  'client_replied',
  'suspicious',
  'not_analysed',
  'archived',
  'spam',
  'resolved',
] as const;
export const VALID_THREAD_STATUSES = ['all', 'open', 'in_progress', 'pending', 'closed'] as const;
// 'open' is what the Status control actually SENDS (unreviewed + replied fold into it)
// and it was missing here, so `?lifecycle=open` failed the whitelist and was dropped on
// every URL read. The dropdown has had this bug all along — it only became obvious once
// the saved views leaned on it, since Inbox / Mine / Unassigned all set lifecycle=open.
export const VALID_LIFECYCLES = [
  'all',
  'open',
  'unreviewed',
  'in_progress',
  'awaiting',
  'replied',
  'pending',
  'resolved',
  'closed',
] as const;
// Re-exported, NOT redeclared. A local copy of this list silently reset any queue value it
// had not been taught about — the filter applied, then the next URL sync wiped it.
export const VALID_QUEUES = QUEUE_FILTERS;
export const VALID_READ = ['all', 'read', 'unread'] as const;
export const VALID_AI_STATES = [
  'all',
  'needs_review',
  'needs_info',
  'ai_suggested',
  'in_human_work',
  'bot_handled',
  'lead',
  'contradiction',
] as const;
export const VALID_LINKED = ['all', 'has_ticket', 'has_jira'] as const;
export const VALID_LINKED_TICKET_STATUSES = [
  'all',
  'pending',
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;
export const VALID_PRIORITIES = ['all', 'low', 'medium', 'high', 'critical'] as const;
/** The three filters the API can invert — `NEGATABLE_FILTERS` server-side. Anything
 *  else in the param is dropped there, so it is dropped here too rather than round-tripping
 *  a name that will never do anything. */
export const VALID_NEGATE_KEYS = ['lifecycle', 'queue', 'aiState'] as const;
/** The API's four arrival buckets. Read unvalidated before, so `?ageRange=today` was
 *  stored and drew a token reading "today" over a list it was not filtering. */
export const VALID_AGE_RANGES = ['all', 'lt24h', '1to7d', '1to4w', 'gt1mo'] as const;

/** Keep the values a whitelist recognises, drop the rest. A CSV filter is several values
 *  in one param, and one bad entry must not cost the others. */
const validCsv = (raw: string | null, whitelist: readonly string[]): string | undefined => {
  if (!raw) return undefined;
  const kept = [...new Set(raw.split(',').map((part) => part.trim()).filter(Boolean))].filter(
    (value) => whitelist.includes(value)
  );
  return kept.length > 0 ? kept.join(',') : undefined;
};

/** A date param is only kept if it is one. `NaN` reaching the API as a timestamp is a
 *  500, and a silently wrong window is worse than no window. */
const validIso = (raw: string | null): string | undefined =>
  raw && !Number.isNaN(Date.parse(raw)) ? raw : undefined;

interface UseMessagesUrlSyncProps {
  urlSyncedRef: MutableRefObject<boolean>;
  // Holds the URL form of the last-fetched conv id (either the numeric id as a
  // string or a publicId like 'SUP-42'). Stored as string so the dedup compare
  // against `searchParams.get('id')` is a single equality check that works
  // identically for both URL forms.
  fetchedMessageIdRef: MutableRefObject<string | null>;
  fetchMessages: (page?: number, force?: boolean) => Promise<void>;
  selectedMessage: Message | null;
  setSelectedMessage: (msg: Message | null) => void;
  onFetchError?: (error: unknown) => void;
}

export const useMessagesUrlSync = ({
  urlSyncedRef,
  fetchedMessageIdRef,
  fetchMessages,
  setSelectedMessage,
  onFetchError,
}: UseMessagesUrlSyncProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const filters = useMessagesStore((state) => state.filters);
  const setFilters = useMessagesStore((state) => state.setFilters);
  const updateFilter = useMessagesStore((state) => state.updateFilter);

  // On mount: read URL params → store, then trigger initial fetch
  useEffect(() => {
    const init = async () => {
      const urlFilters: Partial<FilterState> = {};

      const urlStatus = searchParams.get('status');
      if (urlStatus && (VALID_STATUSES as readonly string[]).includes(urlStatus)) {
        urlFilters.status = urlStatus as FilterState['status'];
      }

      const urlThreadStatus = searchParams.get('threadStatus');
      if (
        urlThreadStatus &&
        (VALID_THREAD_STATUSES as readonly string[]).includes(urlThreadStatus)
      ) {
        urlFilters.threadStatus = urlThreadStatus as FilterState['threadStatus'];
      }

      const urlLifecycle = searchParams.get('lifecycle');
      if (urlLifecycle && (VALID_LIFECYCLES as readonly string[]).includes(urlLifecycle)) {
        urlFilters.lifecycle = urlLifecycle as FilterState['lifecycle'];
      }

      const urlQueue = searchParams.get('queue');
      if (urlQueue && (VALID_QUEUES as readonly string[]).includes(urlQueue)) {
        urlFilters.queue = urlQueue as FilterState['queue'];
      }

      // A quick-filter chip is a real filter, so it belongs in the URL like every other one.
      // Without this, `setFilters({ ...defaultFilters, ...urlFilters })` below silently resets
      // the chip to "All" on every URL sync — the selection would survive a click and vanish on
      // the next navigation, and a shared link would carry the wrong list.
      const urlColumn = searchParams.get('column');
      if (urlColumn && COLUMNS.some((col) => col.id === urlColumn)) {
        urlFilters.columnId = urlColumn;
      }

      const urlRead = searchParams.get('read');
      if (urlRead && (VALID_READ as readonly string[]).includes(urlRead)) {
        urlFilters.read = urlRead as FilterState['read'];
      }

      const urlAiState = searchParams.get('aiState');
      if (urlAiState && (VALID_AI_STATES as readonly string[]).includes(urlAiState)) {
        urlFilters.aiState = urlAiState as FilterState['aiState'];
      }

      const urlLinked = searchParams.get('linked');
      if (urlLinked && (VALID_LINKED as readonly string[]).includes(urlLinked)) {
        urlFilters.linked = urlLinked as FilterState['linked'];
      }

      const urlLinkedTicketStatus = searchParams.get('linkedTicketStatus');
      if (
        urlLinkedTicketStatus &&
        (VALID_LINKED_TICKET_STATUSES as readonly string[]).includes(urlLinkedTicketStatus)
      ) {
        urlFilters.linkedTicketStatus = urlLinkedTicketStatus as FilterState['linkedTicketStatus'];
      }

      const urlSource = searchParams.get('source');
      if (urlSource) urlFilters.messageSourceId = urlSource;

      const urlReceivedAt = searchParams.get('receivedAt');
      if (urlReceivedAt) urlFilters.receivedAt = urlReceivedAt;

      const urlAgeRange = searchParams.get('ageRange');
      if (urlAgeRange && (VALID_AGE_RANGES as readonly string[]).includes(urlAgeRange)) {
        urlFilters.ageRange = urlAgeRange as FilterState['ageRange'];
      }

      const urlDepartmentId = searchParams.get('departmentId');
      if (urlDepartmentId) urlFilters.departmentId = urlDepartmentId;

      // CSV: `?priority=high,critical` is one filter with two values.
      const urlPriority = validCsv(searchParams.get('priority'), VALID_PRIORITIES);
      if (urlPriority) urlFilters.priority = urlPriority;

      const urlNegate = validCsv(searchParams.get('negate'), VALID_NEGATE_KEYS);
      if (urlNegate) urlFilters.negate = urlNegate;

      const urlReceivedFrom = validIso(searchParams.get('receivedFrom'));
      if (urlReceivedFrom) urlFilters.receivedFrom = urlReceivedFrom;
      const urlReceivedTo = validIso(searchParams.get('receivedTo'));
      if (urlReceivedTo) urlFilters.receivedTo = urlReceivedTo;

      const urlAssigneeId = searchParams.get('assigneeId');
      if (urlAssigneeId) {
        urlFilters.assigneeId = urlAssigneeId === '0' ? 'unassigned' : urlAssigneeId;
      }

      const urlLabelId = searchParams.get('labelId');
      if (urlLabelId) urlFilters.labelId = urlLabelId;

      const urlSearch = searchParams.get('search');
      if (urlSearch) urlFilters.search = urlSearch;

      const urlSlaBreached = searchParams.get('slaBreached');
      const urlSlaAtRisk = searchParams.get('slaAtRisk');
      if (urlSlaBreached === 'true') urlFilters.slaBreached = true;
      if (urlSlaAtRisk === 'true') urlFilters.slaAtRisk = true;

      const urlHasAttachments = searchParams.get('hasAttachments');
      if (urlHasAttachments === 'true') urlFilters.hasAttachments = true;

      setFilters({ ...defaultFilters, ...urlFilters });

      urlSyncedRef.current = true;

      try {
        await fetchMessages(1);
      } catch (error) {
        logger.error('Failed to fetch messages:', error);
        onFetchError?.(error);
      }
    };
    init().catch((error) => {
      logger.error('Failed to initialize messages page:', error);
    });
  }, []);

  // Re-apply the `queue` filter from the URL on POST-mount navigations. The mount
  // effect above has [] deps so it runs once; when the Notification Center's
  // Suspicious/Spam queue rows navigate to ?queue=... while the Messages page is
  // already mounted, the URL changes but the store filter would otherwise stay
  // stale (list shows "all messages" until a full reload). Loop-safe: fires only
  // when the store and URL differ, and the filters→URL effect keeps them converged;
  // changing filters.queue drives the refetch in useMessagesData.
  useEffect(() => {
    if (!urlSyncedRef.current) return; // the mount effect owns the first pass
    const store = useMessagesStore.getState().filters;

    const urlQueue = searchParams.get('queue');
    const queue: FilterState['queue'] =
      urlQueue && (VALID_QUEUES as readonly string[]).includes(urlQueue)
        ? (urlQueue as FilterState['queue'])
        : 'all';
    if ((store.queue ?? 'all') !== queue) updateFilter('queue', queue);

    const urlRead = searchParams.get('read');
    const read: FilterState['read'] =
      urlRead && (VALID_READ as readonly string[]).includes(urlRead)
        ? (urlRead as FilterState['read'])
        : 'all';
    if ((store.read ?? 'all') !== read) updateFilter('read', read);
  }, [searchParams, updateFilter, urlSyncedRef]);

  // Sync filters → URL whenever they change. Read searchParams via ref to avoid a write→read loop.
  useEffect(() => {
    const params = new URLSearchParams();

    const messageIdParam = searchParamsRef.current.get('id');
    if (messageIdParam) params.set('id', messageIdParam);

    const modeParam = searchParamsRef.current.get('mode');
    if (modeParam) params.set('mode', modeParam);
    const senderParam = searchParamsRef.current.get('sender');
    if (senderParam) params.set('sender', senderParam);

    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.threadStatus && filters.threadStatus !== 'all')
      params.set('threadStatus', filters.threadStatus);
    if (filters.lifecycle && filters.lifecycle !== 'all')
      params.set('lifecycle', filters.lifecycle);
    if (filters.queue && filters.queue !== 'all') params.set('queue', filters.queue);
    if (filters.columnId && filters.columnId !== 'all') params.set('column', filters.columnId);
    if (filters.read && filters.read !== 'all') params.set('read', filters.read);
    if (filters.aiState && filters.aiState !== 'all') params.set('aiState', filters.aiState);
    if (filters.linked && filters.linked !== 'all') params.set('linked', filters.linked);
    if (
      filters.linked &&
      filters.linked !== 'all' &&
      filters.linkedTicketStatus &&
      filters.linkedTicketStatus !== 'all'
    ) {
      params.set('linkedTicketStatus', filters.linkedTicketStatus);
    }
    if (filters.messageSourceId && filters.messageSourceId !== 'all')
      params.set('source', filters.messageSourceId);
    // 🔒 Deliberately NOT written to the URL. This value is a correspondent's email
    // address; putting it here would leave it in the address bar, in history, and in
    // every link the user shares or saves. It is still READ below, so a link made
    // before this change keeps working — the point is that no new one carries PII.
    // The cost is that this one filter does not survive being copied out of the bar,
    // which is a smaller price than a third party's address in someone's history.
    if (filters.ageRange && filters.ageRange !== 'all') params.set('ageRange', filters.ageRange);
    if (filters.receivedFrom) params.set('receivedFrom', filters.receivedFrom);
    if (filters.receivedTo) params.set('receivedTo', filters.receivedTo);
    if (filters.negate) params.set('negate', filters.negate);
    if (filters.departmentId && filters.departmentId !== 'all')
      params.set('departmentId', filters.departmentId);
    if (filters.priority && filters.priority !== 'all') params.set('priority', filters.priority);
    if (filters.assigneeId && filters.assigneeId !== 'all') {
      params.set('assigneeId', filters.assigneeId === 'unassigned' ? '0' : filters.assigneeId);
    }
    if (filters.labelId && filters.labelId !== 'all') params.set('labelId', filters.labelId);
    if (filters.search) params.set('search', filters.search);
    if (filters.slaBreached) params.set('slaBreached', 'true');
    if (filters.slaAtRisk) params.set('slaAtRisk', 'true');
    if (filters.hasAttachments) params.set('hasAttachments', 'true');

    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  // Auto-open message from ?id= param. The param can be a numeric conv id
  // (legacy / unstamped) OR a publicId like 'SUP-42' (current). Pass the raw
  // string straight to messageService.getById — the BE's resolveConvIdFromParam
  // dual-resolves both forms. Avoids the prior `parseInt` path that turned
  // 'SUP-42' into NaN and silently dropped the open.
  useEffect(() => {
    const paramId = searchParams.get('id');
    const paramKind = searchParams.get('kind');
    // Cache key includes kind so a link with kind=event doesn't get blocked by
    // a prior non-kind fetch for the same id (would silently mis-resolve).
    const cacheKey = paramKind ? `${paramId}::${paramKind}` : paramId;

    if (paramId !== null && paramId !== '') {
      if (cacheKey === fetchedMessageIdRef.current) return;
      fetchedMessageIdRef.current = cacheKey;

      messageService
        .getById(paramId, paramKind === 'event' ? 'event' : undefined)
        .then((response) => {
          if (response.success && response.data) {
            setSelectedMessage(response.data);
          } else {
            fetchedMessageIdRef.current = null;
            setSearchParams(
              (prev) => {
                prev.delete('id');
                return prev;
              },
              { replace: true }
            );
          }
        })
        .catch((error) => {
          logger.error('Failed to fetch message:', error);
          fetchedMessageIdRef.current = null;
          setSearchParams(
            (prev) => {
              prev.delete('id');
              return prev;
            },
            { replace: true }
          );
        });
    } else {
      fetchedMessageIdRef.current = null;
      setSelectedMessage(null);
    }
  }, [searchParams, setSearchParams, fetchedMessageIdRef, setSelectedMessage]); // onFetchError intentionally excluded — callback ref is stable
};
