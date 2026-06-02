import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { logger } from '@/lib/logger';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import { makeKBHandlers } from '@/hooks/useEmailProcessingKBHandlers';

type ProcessingStatus = 'idle' | 'started' | 'processing' | 'complete' | 'error';

type EmailProcessingEvent = {
  type: 'started' | 'found' | 'processing' | 'processed' | 'complete' | 'error' | 'linked';
  integrationId?: number;
  integrationName?: string;
  organizationId?: number; // Organization this integration belongs to
  departmentSlug?: string; // Department this integration belongs to
  departmentId?: number; // Numeric dept ID (Phase 6+)
  data?: {
    total?: number;
    current?: number;
    messageId?: string;
    sender?: string;
    subject?: string;
    status?: string; // Stage: 'fetching', 'analyzing', 'kb-processing', 'complete'
    aiSuggestion?: string;
    processed?: number;
    analyzed?: number; // Number of messages that went through AI analysis
    failed?: number;
    skipped?: number;
    error?: string;
    found?: number; // Number of messages fetched so far (used in 'found' events)
    linkedReplies?: number; // Sent folder replies linked to existing threads
    // Performance timing fields (in milliseconds)
    fetchTime?: number;
    processTime?: number;
    totalTime?: number;
  };
};

type EmailProcessingState = {
  status: ProcessingStatus;
  stage?: string;
  total: number;
  current: number;
  processed: number;
  failed: number;
  error?: string;
  isProcessing: boolean;
  fetchTime?: number;
  processTime?: number;
  totalTime?: number;
};

type UseEmailProcessingSocketParams = {
  enabled: boolean;
  filterByOrganization?: number;
  setSessions: React.Dispatch<React.SetStateAction<Map<string, ProcessingSession>>>;
  setState: React.Dispatch<React.SetStateAction<EmailProcessingState>>;
};

export const useEmailProcessingSocket = ({
  enabled,
  filterByOrganization,
  setSessions,
  setState,
}: UseEmailProcessingSocketParams) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Always get socket instance (for connection status)
    const socketInstance = getSocket();
    setSocket(socketInstance);

    // Skip event subscription if disabled
    if (!enabled) {
      return () => {
        releaseSocket();
      };
    }

    const handleProcessing = (data: unknown) => {
      const event = data as EmailProcessingEvent;

      // If integrationId is provided, track this session separately
      if (event.integrationId) {
        // Filter by organization — reject events with missing or mismatched organizationId
        if (
          filterByOrganization &&
          (event.organizationId === null ||
            event.organizationId === undefined ||
            event.organizationId !== filterByOrganization)
        ) {
          logger.warn('[useEmailProcessing] Event filtered by organization:', {
            filterByOrganization,
            eventOrgId: event.organizationId,
            eventType: event.type,
          });
          return;
        }

        setSessions((prev) => {
          const newSessions = new Map(prev);
          const integrationId = event.integrationId as number;
          const integrationName = event.integrationName ?? `Integration ${integrationId}`;
          const departmentSlug = event.departmentSlug ?? 'general';
          const departmentId = event.departmentId;
          const sessionKey = `${integrationId}`;
          const existing = newSessions.get(sessionKey);

          switch (event.type) {
            case 'started':
              // Reset ALL counters for new cycle - stale counts from previous sessions
              // cause confusing display (e.g. Found: 0, Processed: 100 after deletion)
              newSessions.set(sessionKey, {
                sessionKey,
                integrationId,
                integrationName,
                departmentSlug,
                departmentId,
                status: 'started',
                total: 0,
                current: 0,
                processed: 0,
                failed: 0,
                analyzed: 0,
                isProcessing: true,
                progress: 0,
                timestamp: Date.now(),
                kbEntriesTotal: 0,
                kbQAPairs: 0,
                kbDocuments: 0,
                kbStandaloneKnowledge: 0,
              });
              break;

            case 'found': {
              const total = event.data?.total ?? 0;
              const found = event.data?.found ?? 0;
              if (existing) {
                const fetchedCount = found > 0 ? found : (existing.processed ?? 0);
                newSessions.set(sessionKey, {
                  ...existing,
                  status: 'processing',
                  stage: existing.stage === 'kb-processing' ? 'kb-processing' : 'fetching',
                  total,
                  processed: fetchedCount,
                  isProcessing: true, // Explicitly set when messages are found
                });
              } else {
                // Create session from 'found' event if 'started' was missed
                // (e.g. WebSocket connected after processing began)
                newSessions.set(sessionKey, {
                  sessionKey,
                  integrationId,
                  integrationName,
                  departmentSlug,
                  departmentId,
                  status: 'processing',
                  stage: 'fetching',
                  total,
                  current: 0,
                  processed: found > 0 ? found : 0,
                  failed: 0,
                  isProcessing: true,
                  progress: 0,
                  timestamp: Date.now(),
                  kbEntriesTotal: 0,
                  kbQAPairs: 0,
                  kbDocuments: 0,
                  kbStandaloneKnowledge: 0,
                });
              }
              break;
            }

            case 'processing':
              if (existing) {
                const eventCurrent = event.data?.current ?? 0;
                const eventTotal = event.data?.total ?? 0;
                const eventStage = event.data?.status; // Get stage from event data

                // Check if the existing session is VERY old (stale from previous page load)
                const sessionAge = Date.now() - (existing.timestamp ?? 0);
                const isStaleSession = sessionAge > 60000; // Older than 60 seconds
                const isRecentlyReset = sessionAge < 30000; // Within 30 seconds of reset

                // If session is very old AND new total is different, this is a NEW cycle
                // Reset the session with the new data
                if (isStaleSession && eventTotal > 0 && eventTotal !== existing.total) {
                  logger.warn(`[Email Processing] Resetting stale session (${sessionAge}ms old)`, {
                    sessionKey,
                    oldTotal: existing.total,
                    newTotal: eventTotal,
                  });
                  newSessions.set(sessionKey, {
                    sessionKey,
                    integrationId: existing.integrationId,
                    integrationName: existing.integrationName,
                    departmentSlug: existing.departmentSlug,
                    status: 'processing',
                    total: eventTotal,
                    current: eventCurrent,
                    processed: existing.processed ?? 0,
                    failed: existing.failed ?? 0,
                    analyzed: existing.analyzed ?? 0,
                    isProcessing: true,
                    progress: eventTotal > 0 ? (eventCurrent / eventTotal) * 100 : 0,
                    timestamp: Date.now(), // New timestamp
                  });
                  break;
                }

                // After reset, reject events with HIGHER totals (old session events)
                if (isRecentlyReset && eventTotal > existing.total && existing.total > 0) {
                  logger.warn(
                    `[Email Processing] Ignoring old event after reset: ${eventTotal} > ${existing.total}`,
                    { sessionKey, eventTotal, existingTotal: existing.total, sessionAge }
                  );
                  return newSessions; // Skip this event
                }

                // IGNORE stale events from overlapping cycles (lower total than current)
                if (
                  eventTotal > 0 &&
                  eventTotal < existing.total &&
                  existing.total > 20 &&
                  !isRecentlyReset
                ) {
                  logger.warn(
                    `[Email Processing] Ignoring stale event: ${eventTotal} < ${existing.total}`,
                    { sessionKey, eventTotal, existingTotal: existing.total, sessionAge }
                  );
                  return newSessions; // Skip this event entirely
                }

                // Detect phase change: total changes significantly (e.g., 312 → 50)
                const isNewPhase = eventTotal > 0 && eventTotal !== existing.total;
                const isKBPhase = eventStage === 'kb-processing';

                // Preserve email total: update during email phases, freeze during KB phase
                const emailTotal = isKBPhase
                  ? (existing.emailTotal ?? existing.total) // Freeze at KB start
                  : eventTotal || existing.total; // Keep updating during email processing

                // Use event data to update current/total (shows active phase progress)
                // If new phase but eventCurrent is 0, keep old values until phase actually starts
                // Also never let current go back to 0 if it was previously > 0
                const rawCurrent =
                  (isNewPhase && eventCurrent === 0) || (eventCurrent === 0 && existing.current > 0)
                    ? existing.current
                    : eventCurrent;
                const total =
                  isNewPhase && eventCurrent === 0 ? existing.total : eventTotal || existing.total;
                // Cap current at total to prevent impossible states like "100 / 52"
                const current = total > 0 ? Math.min(rawCurrent, total) : rawCurrent;

                const newProgress = total > 0 ? (current / total) * 100 : 0;

                // Reactivate if status was complete
                const shouldReactivate = existing.status === 'complete';

                // Only clamp if total hasn't changed (prevents flickering)
                // Allow progress to decrease when new messages are found (isNewPhase)
                // ALSO reset progress when reactivating from complete status
                const clampedProgress =
                  isNewPhase || shouldReactivate
                    ? newProgress
                    : Math.max(existing.progress ?? 0, newProgress);

                // Keep isProcessing true when getting processing events
                const stillProcessing = true;

                // Once in KB-processing stage, don't let email:processing events revert it
                const preserveKBStage =
                  existing.stage === 'kb-processing' && eventStage !== 'kb-processing';
                newSessions.set(sessionKey, {
                  ...existing,
                  status: shouldReactivate ? 'processing' : existing.status,
                  stage: preserveKBStage ? existing.stage : eventStage,
                  current,
                  total,
                  emailTotal,
                  ...(event.data?.analyzed !== undefined && { analyzed: event.data.analyzed }),
                  ...(event.data?.skipped !== undefined && { skipped: event.data.skipped }),
                  progress: clampedProgress,
                  isProcessing: stillProcessing,
                });
              } else if ((event.data?.current ?? 0) > 0) {
                // Create session only if current > 0 (avoid showing "0/128" on initial events)
                newSessions.set(sessionKey, {
                  sessionKey,
                  integrationId,
                  integrationName,
                  departmentSlug,
                  departmentId,
                  status: 'processing',
                  total: event.data?.total ?? 0,
                  current: event.data?.current ?? 0,
                  processed: 0,
                  failed: 0,
                  isProcessing: true,
                  progress: 0,
                  timestamp: Date.now(),
                  kbEntriesTotal: 0,
                  kbQAPairs: 0,
                  kbDocuments: 0,
                  kbStandaloneKnowledge: 0,
                });
              }
              break;

            case 'error':
              if (existing) {
                newSessions.set(sessionKey, {
                  ...existing,
                  failed: existing.failed + 1,
                  ...(existing.status === 'idle' && {
                    status: 'error',
                    error: event.data?.error,
                    isProcessing: false,
                  }),
                });
              }
              break;

            case 'processed':
              if (existing) {
                // Backend sends cumulative count, not incremental
                const processed = event.data?.processed ?? existing.processed;
                // Use backend-provided analyzed count if available (avoids frontend/backend drift).
                // Fall back to incrementing only if backend doesn't send it.
                const analyzed =
                  existing.stage === 'kb-processing'
                    ? (existing.analyzed ?? 0) // KB events manage this directly
                    : (event.data?.analyzed ?? (existing.analyzed ?? 0) + 1); // Fallback: increment per event
                newSessions.set(sessionKey, {
                  ...existing,
                  processed,
                  analyzed, // Track AI-analyzed messages
                });
              } else {
                // Create minimal session if processing in progress but page was refreshed
                newSessions.set(sessionKey, {
                  sessionKey,
                  integrationId,
                  integrationName,
                  departmentSlug,
                  departmentId,
                  status: 'processing',
                  total: event.data?.total ?? 0,
                  current: 0,
                  processed: event.data?.processed ?? 1,
                  analyzed: 1,
                  failed: 0,
                  isProcessing: true,
                  progress: 0,
                  timestamp: Date.now(),
                  kbEntriesTotal: 0,
                  kbQAPairs: 0,
                  kbDocuments: 0,
                  kbStandaloneKnowledge: 0,
                });
              }
              break;

            case 'complete':
              if (existing) {
                // Use final totals from backend (already cumulative, not batch)
                // Backend sends the TOTAL processed count, not incremental
                const processed = event.data?.processed ?? existing.processed;
                const failed = event.data?.failed ?? existing.failed;
                const total = event.data?.total ?? existing.total;
                const current = processed; // Set current to processed count so widget shows "128/128" not "0/128"
                // Preserve existing analyzed count - only use event value if it's > 0
                const analyzed =
                  (event.data?.analyzed ?? 0) > 0 ? event.data?.analyzed : existing.analyzed;
                newSessions.set(sessionKey, {
                  ...existing,
                  status: 'complete',
                  current,
                  total,
                  processed,
                  failed,
                  analyzed,
                  skipped: event.data?.skipped ?? existing.skipped,
                  isProcessing: false,
                  progress: 100,
                  fetchTime: event.data?.fetchTime ?? existing.fetchTime,
                  processTime: event.data?.processTime ?? existing.processTime,
                  totalTime: event.data?.totalTime ?? existing.totalTime,
                });
              } else {
                // No existing session — backend skipped (all messages already in DB)
                // Still create a brief complete session so the widget can show "no new messages"
                newSessions.set(sessionKey, {
                  sessionKey,
                  integrationId,
                  integrationName,
                  departmentSlug,
                  departmentId,
                  status: 'complete',
                  stage: undefined,
                  total: event.data?.total ?? 0,
                  current: event.data?.processed ?? 0,
                  processed: event.data?.processed ?? 0,
                  failed: event.data?.failed ?? 0,
                  analyzed: event.data?.analyzed ?? 0,
                  skipped: event.data?.skipped ?? 0,
                  isProcessing: false,
                  progress: 100,
                  timestamp: Date.now(),
                  fetchTime: event.data?.fetchTime,
                  processTime: event.data?.processTime,
                  totalTime: event.data?.totalTime,
                  kbEntriesTotal: 0,
                  kbQAPairs: 0,
                  kbDocuments: 0,
                  kbStandaloneKnowledge: 0,
                });
              }
              break;

            case 'linked':
              if (existing) {
                newSessions.set(sessionKey, {
                  ...existing,
                  linkedReplies: event.data?.linkedReplies ?? existing.linkedReplies,
                });
              }
              break;
          }

          return newSessions;
        });
      }

      // Skip global events when organization filtering is active
      if (filterByOrganization && !event.integrationId) {
        return;
      }

      switch (event.type) {
        case 'started':
          setState({
            status: 'started',
            total: 0,
            current: 0,
            processed: 0,
            failed: 0,
            isProcessing: true,
          });
          break;

        case 'found':
          setState((prev) => ({
            ...prev,
            status: 'processing',
            total: event.data?.total ?? 0,
          }));
          break;

        case 'processing':
          setState((prev) => ({
            ...prev,
            status: 'processing',
            current: event.data?.current ?? 0,
            total: event.data?.total ?? prev.total,
          }));
          break;

        case 'processed':
          setState((prev) => ({
            ...prev,
            processed: prev.processed + 1,
          }));
          break;

        case 'complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            total: event.data?.total ?? prev.total,
            processed: event.data?.processed ?? 0,
            failed: event.data?.failed ?? 0,
            isProcessing: false,
            fetchTime: event.data?.fetchTime,
            processTime: event.data?.processTime,
            totalTime: event.data?.totalTime,
          }));
          break;

        case 'error':
          setState((prev) => ({
            ...prev,
            failed: prev.failed + 1,
            ...(prev.status === 'idle' && {
              status: 'error',
              error: event.data?.error,
              isProcessing: false,
            }),
          }));
          break;
      }
    };

    // KB handlers are extracted to keep this file under the line limit
    const { handleKBProgress, handleKBCompleted } = makeKBHandlers({
      filterByOrganization,
      setSessions,
    });

    // Subscribe to events with automatic deduplication
    subscribeToEvent('email:processing', handleProcessing);
    subscribeToEvent('kb:progress', handleKBProgress);
    subscribeToEvent('kb:completed', handleKBCompleted);

    return () => {
      unsubscribeFromEvent('email:processing', handleProcessing);
      unsubscribeFromEvent('kb:progress', handleKBProgress);
      unsubscribeFromEvent('kb:completed', handleKBCompleted);
      releaseSocket();
    };
  }, [enabled, filterByOrganization, setSessions, setState]);

  return { socket };
};
