import { useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import type { MutableRefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { messageService } from '@/services/message.service';
import { useMessagesStore, defaultFilters, type FilterState } from '@/stores/messagesStore';
import type { Message } from '@/types';

const VALID_STATUSES = [
  'all',
  'active',
  'awaiting_response',
  'client_replied',
  'suspicious',
  'not_analysed',
  'spam',
  'resolved',
] as const;
const VALID_THREAD_STATUSES = ['all', 'open', 'in_progress', 'pending', 'closed'] as const;
const VALID_AI_STATES = [
  'all',
  'needs_review',
  'needs_info',
  'ai_suggested',
  'in_human_work',
  'bot_handled',
  'lead',
  'contradiction',
] as const;
const VALID_LINKED = ['all', 'has_ticket', 'has_jira'] as const;
const VALID_LINKED_TICKET_STATUSES = [
  'all',
  'pending',
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;
const VALID_PRIORITIES = ['all', 'low', 'medium', 'high', 'critical'] as const;

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

      const urlDepartmentId = searchParams.get('departmentId');
      if (urlDepartmentId) urlFilters.departmentId = urlDepartmentId;

      const urlPriority = searchParams.get('priority');
      if (urlPriority && (VALID_PRIORITIES as readonly string[]).includes(urlPriority)) {
        urlFilters.priority = urlPriority as FilterState['priority'];
      }

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
