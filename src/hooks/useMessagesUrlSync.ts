import { useEffect } from 'react';
import { logger } from '@/lib/logger';
import type { MutableRefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { messageService } from '@/services/message.service';
import { useMessagesStore, defaultFilters, type FilterState } from '@/stores/messagesStore';
import { useAuthStore } from '@/stores/authStore';
import type { Message } from '@/types';

interface UseMessagesUrlSyncProps {
  urlSyncedRef: MutableRefObject<boolean>;
  fetchedMessageIdRef: MutableRefObject<number | null>;
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

  const filters = useMessagesStore((state) => state.filters);
  const setFilters = useMessagesStore((state) => state.setFilters);
  const _currentUser = useAuthStore((state) => state.user);

  // On mount: read URL params → store, then trigger initial fetch
  useEffect(() => {
    const init = async () => {
    const urlFilters: Partial<FilterState> = {};

    const urlView = searchParams.get('view');
    if (urlView && ['all', 'active', 'suspicious', 'not_analysed', 'resolved'].includes(urlView)) {
      urlFilters.view = urlView as FilterState['view'];
    }
    const urlProcessed = searchParams.get('processed');
    if (
      urlProcessed &&
      ['all', 'open', 'in_progress', 'pending', 'closed'].includes(urlProcessed)
    ) {
      urlFilters.processed = urlProcessed as FilterState['processed'];
    }
    const urlChannel = searchParams.get('channel');
    if (urlChannel && ['all', 'email', 'telegram', 'slack'].includes(urlChannel)) {
      urlFilters.channel = urlChannel as FilterState['channel'];
    }
    const urlMessageSource = searchParams.get('source');
    if (urlMessageSource) {
      urlFilters.messageSourceId = urlMessageSource;
    }
    if (searchParams.get('spam') === 'true') { urlFilters.showSpam = true; }
    if (searchParams.get('suspicious') === 'true') { urlFilters.showSuspicious = true; }
    if (searchParams.get('excludeSpam') === 'true') { urlFilters.excludeSpam = true; }
    if (searchParams.get('showKBOnly') === 'true') { urlFilters.showKBOnly = true; }
    if (searchParams.get('excludeKB') === 'true') { urlFilters.excludeKB = true; }
    if (searchParams.get('worthy') === 'true') { urlFilters.showWorthy = true; }
    if (searchParams.get('needsInfo') === 'true') { urlFilters.showNeedsInfo = true; }
    if (searchParams.get('attachments') === 'true') { urlFilters.hasAttachments = true; }
    if (searchParams.get('replies') === 'true') { urlFilters.hasReplies = true; }
    const urlTicket = searchParams.get('ticket');
    if (urlTicket === 'true' || urlTicket === 'false') {
      urlFilters.hasTicket = urlTicket === 'true';
    }
    if (searchParams.get('failed') === 'true') { urlFilters.showFailed = true; }
    if (searchParams.get('leads') === 'true') { urlFilters.isLead = true; }
    if (searchParams.get('qualifiedLeads') === 'true') { urlFilters.isQualifiedLead = true; }
    if (searchParams.get('awaitingCustomerResponse') === 'true') { urlFilters.awaitingCustomerResponse = true; }
    if (searchParams.get('customerResponded') === 'true') { urlFilters.customerResponded = true; }
    const urlAssigneeId = searchParams.get('assigneeId');
    if (urlAssigneeId) {
      urlFilters.assigneeId = urlAssigneeId === '0' ? 'unassigned' : urlAssigneeId;
    }
    const urlSearch = searchParams.get('search');
    if (urlSearch) { urlFilters.search = urlSearch; }
    const urlDept = searchParams.get('dept');
    if (urlDept && ['support', 'sales', 'billing', 'general', 'hr'].includes(urlDept)) {
      urlFilters.departmentRole = urlDept as FilterState['departmentRole'];
    }
    if (searchParams.get('needsHumanReview') === 'true') {
      urlFilters.needsHumanReview = true;
    }
    const urlAgeRange = searchParams.get('ageRange');
    if (urlAgeRange && ['lt24h', '1to7d', '1to4w', 'gt1mo'].includes(urlAgeRange)) {
      urlFilters.ageRange = urlAgeRange as FilterState['ageRange'];
    }

    // Apply URL params on top of persisted filters.
    // If URL has explicit params, merge them in. Otherwise keep persisted state as-is.
    if (Object.keys(urlFilters).length > 0) {
      setFilters({ ...defaultFilters, ...urlFilters });
    }

    urlSyncedRef.current = true;

    try {
      await fetchMessages(1);
    } catch (error) {
      logger.error('Failed to fetch messages:', error);
      onFetchError?.(error);
    }
    };
    init().catch((error) => { logger.error('Failed to initialize messages page:', error); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync filters → URL whenever they change
  useEffect(() => {
    const params = new URLSearchParams();

    const messageIdParam = searchParams.get('id');
    if (messageIdParam) params.set('id', messageIdParam);

    // Preserve display mode params set outside of filter store
    const modeParam = searchParams.get('mode');
    if (modeParam) params.set('mode', modeParam);
    const senderParam = searchParams.get('sender');
    if (senderParam) params.set('sender', senderParam);

    if (filters.view && filters.view !== 'active') params.set('view', filters.view);
    if (filters.processed && filters.processed !== 'all') params.set('processed', filters.processed);
    if (filters.channel && filters.channel !== 'all') params.set('channel', filters.channel);
    if (filters.messageSourceId && filters.messageSourceId !== 'all') params.set('source', filters.messageSourceId);
    if (filters.showSpam) params.set('spam', 'true');
    if (filters.showSuspicious) params.set('suspicious', 'true');
    if (filters.excludeSpam) params.set('excludeSpam', 'true');
    if (filters.showWorthy) params.set('worthy', 'true');
    if (filters.showNeedsInfo) params.set('needsInfo', 'true');
    if (filters.hasAttachments) params.set('attachments', 'true');
    if (filters.hasReplies) params.set('replies', 'true');
    if (filters.hasTicket !== undefined) params.set('ticket', filters.hasTicket.toString());
    if (filters.showFailed) params.set('failed', 'true');
    if (filters.isLead) params.set('leads', 'true');
    if (filters.isQualifiedLead) params.set('qualifiedLeads', 'true');
    if (filters.showKBOnly) params.set('showKBOnly', 'true');
    if (filters.excludeKB) params.set('excludeKB', 'true');
    if (filters.awaitingCustomerResponse) params.set('awaitingCustomerResponse', 'true');
    if (filters.customerResponded) params.set('customerResponded', 'true');
    if (filters.assigneeId && filters.assigneeId !== 'all') {
      params.set('assigneeId', filters.assigneeId === 'unassigned' ? '0' : filters.assigneeId);
    }
    if (filters.search) params.set('search', filters.search);
    if (filters.departmentRole && filters.departmentRole !== 'all') params.set('dept', filters.departmentRole);
    if (filters.needsHumanReview) params.set('needsHumanReview', 'true');
    if (filters.ageRange) params.set('ageRange', filters.ageRange);

    setSearchParams(params, { replace: true });
  }, [filters, searchParams, setSearchParams]);

  // Auto-open message from ?id= param
  useEffect(() => {
    const messageIdParam = searchParams.get('id');
    const paramId = messageIdParam ? parseInt(messageIdParam) : null;

    if (paramId) {
      if (paramId === fetchedMessageIdRef.current) return;
      fetchedMessageIdRef.current = paramId;

      messageService
        .getById(paramId)
        .then((response) => {
          if (response.success && response.data) {
            setSelectedMessage(response.data);
          }
        })
        .catch((error) => {
          logger.error('Failed to fetch message:', error);
          fetchedMessageIdRef.current = null;
          setSearchParams((prev) => { prev.delete('id'); return prev; }, { replace: true });
        });
    } else {
      fetchedMessageIdRef.current = null;
      setSelectedMessage(null);
    }
  }, [searchParams, setSearchParams, fetchedMessageIdRef, setSelectedMessage]);
};
