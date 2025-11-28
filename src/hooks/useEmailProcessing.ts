import { useEffect, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';

type ProcessingStatus = 'idle' | 'started' | 'processing' | 'complete' | 'error';

type EmailProcessingEvent = {
  type: 'started' | 'found' | 'processing' | 'processed' | 'complete' | 'error';
  integrationId?: number;
  integrationName?: string;
  organizationId?: number; // Organization this integration belongs to
  departmentRole?: string; // Department this integration belongs to
  data?: {
    total?: number;
    current?: number;
    messageId?: string;
    sender?: string;
    subject?: string;
    status?: string;
    aiSuggestion?: string;
    processed?: number;
    analyzed?: number; // Number of messages that went through AI analysis
    failed?: number;
    error?: string;
    // Performance timing fields (in milliseconds)
    fetchTime?: number;
    processTime?: number;
    totalTime?: number;
  };
};

export type ProcessingSession = {
  sessionKey: string; // Composite key: integrationId-departmentRole
  integrationId: number;
  integrationName: string;
  departmentRole?: string; // Department this integration belongs to
  status: ProcessingStatus;
  total: number;
  current: number;
  processed: number; // Total processed (successful + failed + skipped)
  analyzed?: number; // Number of messages that went through AI analysis
  successful?: number; // Successfully analyzed
  failed: number; // Failed to process
  skipped?: number; // Skipped (irrelevant/low quality)
  error?: string;
  isProcessing: boolean;
  // Performance timing (in milliseconds)
  fetchTime?: number;
  processTime?: number;
  totalTime?: number;
  progress: number;
  timestamp?: number; // For localStorage cleanup
  // KB entries stats (for KB ingestion)
  kbEntriesTotal?: number;
  kbQAPairs?: number;
  kbStandaloneKnowledge?: number;
  kbDocuments?: number;
};

type EmailProcessingState = {
  status: ProcessingStatus;
  total: number;
  current: number;
  processed: number;
  failed: number;
  error?: string;
  isProcessing: boolean;
  // Performance timing (in milliseconds)
  fetchTime?: number;
  processTime?: number;
  totalTime?: number;
};

export const useEmailProcessing = (
  enabled = true,
  filterByDepartment?: string,
  filterByOrganization?: number
) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<EmailProcessingState>({
    status: 'idle',
    total: 0,
    current: 0,
    processed: 0,
    failed: 0,
    isProcessing: false,
  });

  // NEW: Track multiple processing sessions by sessionKey (integrationId-departmentRole)
  // Restore sessions from localStorage on mount
  const [sessions, setSessions] = useState<Map<string, ProcessingSession>>(() => {
    try {
      const saved = localStorage.getItem('emailProcessing_sessions');
      if (saved) {
        const parsed = JSON.parse(saved) as Array<[string, ProcessingSession]>;
        // Only restore active sessions from last 30 minutes
        const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
        const filtered = parsed.filter(([_, session]) => {
          // Add timestamp if not present (for backward compatibility)
          const timestamp = session.timestamp ?? Date.now();
          // Skip completed/error sessions - they should auto-remove
          if (session.status === 'complete' || session.status === 'error') {
            return false;
          }
          return timestamp > thirtyMinutesAgo;
        });
        return new Map(filtered);
      }
    } catch (error) {
      console.error('[useEmailProcessing] Failed to restore sessions:', error);
    }
    return new Map();
  });

  // Persist sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.size > 0) {
      try {
        const sessionArray = Array.from(sessions.entries());
        localStorage.setItem('emailProcessing_sessions', JSON.stringify(sessionArray));
      } catch (error) {
        console.error('[useEmailProcessing] Failed to save sessions:', error);
      }
    }
  }, [sessions]);

  // Auto-timeout stuck sessions after 10 minutes (increased for large KB processing)
  useEffect(() => {
    const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

    const checkInterval = setInterval(() => {
      const now = Date.now();
      setSessions((prev) => {
        const updated = new Map(prev);
        let hasChanges = false;

        for (const [key, session] of updated.entries()) {
          const isStuck =
            (session.status === 'processing' || session.status === 'started') &&
            session.timestamp &&
            now - session.timestamp > TIMEOUT_MS;

          if (isStuck) {
            console.warn(`[useEmailProcessing] Session ${key} timed out after 10 minutes`);
            updated.set(key, {
              ...session,
              status: 'error',
              error:
                'Processing timeout (5 min) - integration may have connection issues or large dataset',
              isProcessing: false,
            });
            hasChanges = true;
          }
        }

        return hasChanges ? updated : prev;
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(checkInterval);
  }, []);

  // Clear all sessions when organization changes (admin switching context)
  useEffect(() => {
    if (filterByOrganization) {
      setSessions(new Map());
      // Clear localStorage for stale organization
      localStorage.removeItem('emailProcessing_sessions');
    }
  }, [filterByOrganization]);

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
        // Filter by department if specified - ignore events from other departments
        if (
          filterByDepartment &&
          event.departmentRole &&
          event.departmentRole !== filterByDepartment
        ) {
          return;
        }

        // Filter by organization if specified - ignore events from other organizations
        if (filterByOrganization && event.organizationId !== filterByOrganization) {
          return;
        }

        setSessions((prev) => {
          const newSessions = new Map(prev);
          const integrationId = event.integrationId as number;
          const integrationName = event.integrationName ?? `Integration ${integrationId}`;
          const departmentRole = event.departmentRole ?? 'general';
          // Use composite key: integrationId-departmentRole
          const sessionKey = `${integrationId}-${departmentRole}`;
          const existing = newSessions.get(sessionKey);

          switch (event.type) {
            case 'started':
              // Preserve processed/failed counts from previous cycles (accumulate)
              // Only reset progress counters for the new cycle
              newSessions.set(sessionKey, {
                sessionKey,
                integrationId,
                integrationName,
                departmentRole, // Use normalized value
                status: 'started',
                total: 0,
                current: 0,
                processed: existing?.processed ?? 0, // Keep accumulated count
                failed: existing?.failed ?? 0, // Keep accumulated count
                analyzed: existing?.analyzed ?? 0, // Keep accumulated analyzed count
                isProcessing: true,
                progress: 0,
                timestamp: existing?.timestamp ?? Date.now(), // Keep original start time
              });
              break;

            case 'found':
              if (existing) {
                const total = event.data?.total ?? 0;
                newSessions.set(sessionKey, {
                  ...existing,
                  status: 'processing',
                  total,
                  isProcessing: true, // Explicitly set when messages are found
                });
              }
              break;

            case 'processing':
              if (existing) {
                const eventCurrent = event.data?.current ?? 0;
                const eventTotal = event.data?.total ?? 0;

                // Detect phase change: total changes significantly (e.g., 128 → 5)
                const isNewPhase = eventTotal > 0 && eventTotal !== existing.total;

                // Use event data to update current/total (shows active phase progress)
                // If new phase but eventCurrent is 0, keep old values until phase actually starts
                // Also never let current go back to 0 if it was previously > 0
                const current =
                  (isNewPhase && eventCurrent === 0) || (eventCurrent === 0 && existing.current > 0)
                    ? existing.current
                    : eventCurrent;
                const total =
                  isNewPhase && eventCurrent === 0 ? existing.total : eventTotal || existing.total;

                const newProgress = total > 0 ? (current / total) * 100 : 0;
                const clampedProgress = Math.max(existing.progress ?? 0, newProgress);

                // Reactivate if status was complete
                const shouldReactivate = existing.status === 'complete';

                // Keep isProcessing true when getting processing events
                const stillProcessing = true;

                newSessions.set(sessionKey, {
                  ...existing,
                  status: shouldReactivate ? 'processing' : existing.status,
                  current,
                  total,
                  // Update analyzed if provided by analyzing stage
                  ...(event.data?.analyzed !== undefined && { analyzed: event.data.analyzed }),
                  progress: clampedProgress,
                  isProcessing: stillProcessing,
                });
              } else if ((event.data?.current ?? 0) > 0) {
                // Create session only if current > 0 (avoid showing "0/128" on initial events)
                newSessions.set(sessionKey, {
                  sessionKey,
                  integrationId,
                  integrationName,
                  departmentRole, // Use normalized value
                  status: 'processing',
                  total: event.data?.total ?? 0,
                  current: event.data?.current ?? 0,
                  processed: 0,
                  failed: 0,
                  isProcessing: true,
                  progress: 0,
                  timestamp: Date.now(), // Track when session started
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
                  }),
                });
              }
              break;

            case 'processed':
              if (existing) {
                // Backend sends cumulative count, not incremental
                const processed = event.data?.processed ?? existing.processed;
                // Increment analyzed count for each processed event (messages going through AI)
                const analyzed = (existing.analyzed ?? 0) + 1;
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
                  departmentRole, // Use normalized value
                  status: 'processing',
                  total: event.data?.total ?? 0,
                  current: 0,
                  processed: event.data?.processed ?? 1,
                  analyzed: 1, // Start counting analyzed messages
                  failed: 0,
                  isProcessing: true,
                  progress: 0,
                  timestamp: Date.now(), // Track when session started
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
                  current, // Set to processed count
                  total, // Update total if provided
                  processed,
                  failed,
                  analyzed, // Use preserved or updated analyzed count
                  isProcessing: false,
                  progress: 100,
                  fetchTime: event.data?.fetchTime,
                  processTime: event.data?.processTime,
                  totalTime: event.data?.totalTime,
                });
              }
              break;

            // eslint-disable-next-line no-duplicate-case
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
          }

          return newSessions;
        });
      }

      // Maintain backward compatibility with legacy single-session state
      // Skip global events when department filtering is active to prevent cross-department interference
      if (filterByDepartment && !event.integrationId) {
        console.log('[useEmailProcessing] Ignoring global event - department filter active');
        return;
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

        // eslint-disable-next-line no-duplicate-case
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

    // Handle KB progress events (different format from email events)
    const handleKBProgress = (data: unknown) => {
      const kbEvent = data as {
        messageSourceId: number;
        status: string;
        messageSourceName: string;
        progress: number;
        messages: {
          total: number;
          processed: number;
          successful: number;
          failed: number;
          skipped: number;
        };
        kbEntries?: {
          total: number;
          qaPairs: number;
          standaloneKnowledge: number;
          documents: number;
        };
        departmentRole?: string; // May include department
      };

      // Try to find existing email processing session first
      // Check all possible session keys for this integration
      const integrationId = kbEvent.messageSourceId;
      const possibleKeys = [
        `${integrationId}-general`,
        `${integrationId}-support`,
        `${integrationId}-sales`,
        `${integrationId}-billing`,
        kbEvent.departmentRole ? `${integrationId}-${kbEvent.departmentRole}` : null,
      ].filter((k): k is string => k !== null);

      setSessions((prev) => {
        const newSessions = new Map(prev);

        // Try to find existing session for this integration
        let existingKey: string | null = null;
        for (const key of possibleKeys) {
          if (newSessions.has(key)) {
            existingKey = key;
            break;
          }
        }

        // If existing session found, merge KB data into it
        if (existingKey) {
          const existing = newSessions.get(existingKey);
          if (!existing) {
            return newSessions;
          }
          // Prevent progress from jumping backwards when total increases
          const clampedProgress = Math.max(existing.progress ?? 0, kbEvent.progress ?? 0);
          newSessions.set(existingKey, {
            ...existing,
            status: kbEvent.status === 'processing' ? 'processing' : existing.status,
            total: Math.max(existing.total, kbEvent.messages.total),
            current: Math.max(existing.current, kbEvent.messages.processed),
            processed: Math.max(existing.processed, kbEvent.messages.processed),
            successful: kbEvent.messages.successful,
            failed: Math.max(existing.failed, kbEvent.messages.failed),
            skipped: kbEvent.messages.skipped,
            progress: clampedProgress,
            kbEntriesTotal: kbEvent.kbEntries?.total,
            kbQAPairs: kbEvent.kbEntries?.qaPairs,
            kbStandaloneKnowledge: kbEvent.kbEntries?.standaloneKnowledge,
            kbDocuments: kbEvent.kbEntries?.documents,
          });
          return newSessions;
        }

        // No existing session found - KB event without email session
        // This can happen if:
        // 1. KB processing started before email polling (bulk import)
        // 2. Page refreshed after email session completed but KB still running
        // For now, ignore orphan KB events to prevent duplicate widgets
        return newSessions;
      });
    };

    // Handle KB completed events
    const handleKBCompleted = (data: unknown) => {
      const kbEvent = data as {
        messageSourceId: number;
        status: string;
        messageSourceName: string;
        messages: {
          total: number;
          processed: number;
          successful: number;
          failed: number;
          skipped: number;
        };
        kbEntries?: {
          total: number;
          qaPairs: number;
          standaloneKnowledge: number;
          documents: number;
        };
        duration?: number;
        departmentRole?: string;
      };

      // Try to find existing email processing session first
      const integrationId = kbEvent.messageSourceId;
      const possibleKeys = [
        `${integrationId}-general`,
        `${integrationId}-support`,
        `${integrationId}-sales`,
        `${integrationId}-billing`,
        kbEvent.departmentRole ? `${integrationId}-${kbEvent.departmentRole}` : null,
      ].filter((k): k is string => k !== null);

      setSessions((prev) => {
        const newSessions = new Map(prev);

        // Try to find existing session for this integration
        let existingKey: string | null = null;
        for (const key of possibleKeys) {
          if (newSessions.has(key)) {
            existingKey = key;
            break;
          }
        }

        // If existing session found, merge KB completion into it
        if (existingKey) {
          const existing = newSessions.get(existingKey);
          if (!existing) {
            return newSessions;
          }
          newSessions.set(existingKey, {
            ...existing,
            status: 'complete',
            isProcessing: false,
            progress: 100,
            totalTime: kbEvent.duration,
            kbEntriesTotal: kbEvent.kbEntries?.total,
            kbQAPairs: kbEvent.kbEntries?.qaPairs,
            kbStandaloneKnowledge: kbEvent.kbEntries?.standaloneKnowledge,
            kbDocuments: kbEvent.kbEntries?.documents,
          });
          return newSessions;
        }

        // No existing session found - KB completed without email session
        // Ignore to prevent creating orphan completed sessions
        return newSessions;
      });
    };

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
  }, [enabled, filterByDepartment, filterByOrganization]);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      total: 0,
      current: 0,
      processed: 0,
      failed: 0,
      isProcessing: false,
    });
  }, []);

  const removeSession = useCallback((sessionKey: string) => {
    setSessions((prev) => {
      const updated = new Map(prev);
      updated.delete(sessionKey);
      // Also clear from localStorage
      localStorage.removeItem(`emailProcessingWidget_${sessionKey}_closed`);
      localStorage.removeItem(`emailProcessingWidget_${sessionKey}_position`);
      return updated;
    });
  }, []);

  const progress = state.total > 0 ? (state.current / state.total) * 100 : 0;

  return {
    socket,
    ...state,
    progress,
    reset,
    removeSession,
    sessions, // Map of integration sessions for multi-widget display
  };
};