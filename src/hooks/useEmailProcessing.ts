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
      console.log(
        `[useEmailProcessing] Organization filter changed to ${filterByOrganization}, clearing all sessions`
      );
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

      // DEBUG: Log all events to see what we're receiving
      console.log('[useEmailProcessing] Event received:', {
        type: event.type,
        integrationId: event.integrationId,
        integrationName: event.integrationName,
        hasData: !!event.data,
        data: event.data,
      });

      // If integrationId is provided, track this session separately
      if (event.integrationId) {
        // Filter by department if specified - ignore events from other departments
        if (
          filterByDepartment &&
          event.departmentRole &&
          event.departmentRole !== filterByDepartment
        ) {
          console.log(
            `[useEmailProcessing] Ignoring event from ${event.departmentRole}, current filter: ${filterByDepartment}`
          );
          return;
        }

        // Filter by organization if specified - ignore events from other organizations
        if (filterByOrganization && event.organizationId !== filterByOrganization) {
          console.log(
            `[useEmailProcessing] Ignoring event from org ${event.organizationId}, current filter: ${filterByOrganization}`
          );
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
              newSessions.set(sessionKey, {
                sessionKey,
                integrationId,
                integrationName,
                departmentRole, // Use normalized value
                status: 'started',
                total: 0,
                current: 0,
                processed: 0,
                failed: 0,
                isProcessing: true,
                progress: 0,
                timestamp: Date.now(), // Track when session started
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
                const current = event.data?.current ?? 0;
                const total = event.data?.total ?? existing.total;
                const newProgress = total > 0 ? (current / total) * 100 : 0;

                // Only clamp progress if we're in the same phase (total same/increased)
                // Don't clamp if current decreased (new phase like AI analysis after email fetch)
                const isNewPhase = current < (existing.current ?? 0);
                const clampedProgress = isNewPhase
                  ? newProgress // New phase: use actual progress
                  : Math.max(existing.progress ?? 0, newProgress); // Same phase: prevent backwards

                // Reactivate if completed but more processing events arrive (AI analysis after email fetch)
                const shouldReactivate = existing.status === 'complete' && current < total;

                // Keep isProcessing true if:
                // 1. We're getting processing events (implicit - we're in this case)
                // 2. Not all messages are done yet (current < total)
                // 3. OR status is still 'processing' (not complete/error)
                const stillProcessing =
                  current < total ||
                  (existing.status !== 'complete' && existing.status !== 'error');

                newSessions.set(sessionKey, {
                  ...existing,
                  status: shouldReactivate ? 'processing' : existing.status,
                  current,
                  total,
                  progress: clampedProgress,
                  isProcessing: stillProcessing,
                });
              } else {
                // Create session if it doesn't exist (page refresh during processing)
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

            case 'processed':
              if (existing) {
                newSessions.set(sessionKey, {
                  ...existing,
                  processed: existing.processed + 1,
                });
              } else {
                // Create minimal session if processing in progress but page was refreshed
                newSessions.set(sessionKey, {
                  sessionKey,
                  integrationId,
                  integrationName,
                  departmentRole, // Use normalized value
                  status: 'processing',
                  total: 0,
                  current: 0,
                  processed: 1,
                  failed: 0,
                  isProcessing: true,
                  progress: 0,
                  timestamp: Date.now(), // Track when session started
                });
              }
              break;

            case 'complete':
              if (existing) {
                const processed = event.data?.processed ?? existing.processed;
                const failed = event.data?.failed ?? existing.failed;
                newSessions.set(sessionKey, {
                  ...existing,
                  status: 'complete',
                  processed,
                  failed,
                  isProcessing: false,
                  progress: 100,
                  fetchTime: event.data?.fetchTime,
                  processTime: event.data?.processTime,
                  totalTime: event.data?.totalTime,
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
        console.log('[useEmailProcessing] Ignoring global event - organization filter active');
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

        // No existing session, create new one with KB prefix
        const sessionKey = `kb-${kbEvent.messageSourceId}`;
        newSessions.set(sessionKey, {
          sessionKey,
          integrationId: kbEvent.messageSourceId,
          integrationName: kbEvent.messageSourceName || 'Knowledge Base',
          departmentRole: kbEvent.departmentRole ?? 'general',
          status: kbEvent.status === 'processing' ? 'processing' : 'idle',
          total: kbEvent.messages.total,
          current: kbEvent.messages.processed, // Total processed count
          processed: kbEvent.messages.processed, // Total processed (successful + failed + skipped)
          successful: kbEvent.messages.successful, // Successfully analyzed
          failed: kbEvent.messages.failed,
          skipped: kbEvent.messages.skipped, // Skipped (irrelevant/low quality)
          isProcessing: kbEvent.status === 'processing',
          progress: kbEvent.progress,
          kbEntriesTotal: kbEvent.kbEntries?.total,
          kbQAPairs: kbEvent.kbEntries?.qaPairs,
          kbStandaloneKnowledge: kbEvent.kbEntries?.standaloneKnowledge,
          kbDocuments: kbEvent.kbEntries?.documents,
        });
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

        // No existing session, create new KB session
        const sessionKey = `kb-${kbEvent.messageSourceId}`;
        newSessions.set(sessionKey, {
          sessionKey,
          integrationId: kbEvent.messageSourceId,
          integrationName: kbEvent.messageSourceName || 'Knowledge Base',
          departmentRole: kbEvent.departmentRole ?? 'general',
          status: 'complete',
          total: kbEvent.messages.total,
          current: kbEvent.messages.total,
          processed: kbEvent.messages.successful,
          failed: kbEvent.messages.failed,
          isProcessing: false,
          progress: 100,
          totalTime: kbEvent.duration,
          kbEntriesTotal: kbEvent.kbEntries?.total,
          kbQAPairs: kbEvent.kbEntries?.qaPairs,
          kbStandaloneKnowledge: kbEvent.kbEntries?.standaloneKnowledge,
          kbDocuments: kbEvent.kbEntries?.documents,
        });

        // Auto-remove completed KB-only sessions after 1 minute
        setTimeout(() => {
          setSessions((p) => {
            const updated = new Map(p);
            updated.delete(sessionKey);
            return updated;
          });
        }, 60000);

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
