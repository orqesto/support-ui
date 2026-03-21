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
    status?: string; // Stage: 'fetching', 'analyzing', 'kb-processing', 'complete'
    aiSuggestion?: string;
    processed?: number;
    analyzed?: number; // Number of messages that went through AI analysis
    failed?: number;
    error?: string;
    found?: number; // Number of messages fetched so far (used in 'found' events)
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
  stage?: string; // Current stage: 'fetching', 'analyzing', 'kb-processing', 'complete'
  total: number;
  emailTotal?: number; // Original email total (preserved during KB processing)
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
  // KB message processing progress
  kbMessagesTotal?: number;
  kbMessagesProcessed?: number;
  kbMessagesSuccessful?: number;
  kbMessagesFailed?: number;
  kbMessagesSkipped?: number;
  kbTotalFinalized?: boolean; // True when backend knows the definitive total (IMAP batch complete)
};

type EmailProcessingState = {
  status: ProcessingStatus;
  stage?: string; // Current stage: 'fetching', 'analyzing', 'kb-processing', 'complete'
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
    stage: undefined,
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
          // Filter by department if specified - prevents cross-department widgets on reload
          if (filterByDepartment && session.departmentRole !== filterByDepartment) {
            return false;
          }
          // Filter by organization if specified - prevents cross-organization widgets on reload
          // Note: organizationId not stored in session, so we can't filter by it during restoration
          // This is OK because organization context changes clear all sessions (lines 179-185)
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
    } else {
      // Clear stale data when all sessions are removed
      localStorage.removeItem('emailProcessing_sessions');
    }
  }, [sessions]);

  // Auto-timeout stuck sessions after 20 minutes (increased for throttled processing with large datasets)
  useEffect(() => {
    const TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

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
            console.warn(`[useEmailProcessing] Session ${key} timed out after 20 minutes`);
            updated.set(key, {
              ...session,
              status: 'error',
              error:
                'Processing timeout (20 min) - integration may have connection issues or large dataset',
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

  // Auto-reset legacy 'complete' status after a delay
  // This ensures ALL hook instances (DashboardPage, Layout, etc.) clear the status,
  // not just the one whose widget calls removeSession
  useEffect(() => {
    if (state.status === 'complete') {
      const timer = setTimeout(() => {
        setState({
          status: 'idle',
          total: 0,
          current: 0,
          processed: 0,
          failed: 0,
          isProcessing: false,
        });
      }, 20000); // 20s — matches widget close delay + buffer
      return () => clearTimeout(timer);
    }
  }, [state.status]);

  // Clear all sessions when organization changes (admin switching context)
  useEffect(() => {
    if (filterByOrganization) {
      setSessions(new Map());
      // Clear localStorage for stale organization
      localStorage.removeItem('emailProcessing_sessions');
    }
  }, [filterByOrganization]);

  // Filter sessions when department filter changes (user switching departments)
  useEffect(() => {
    if (filterByDepartment) {
      setSessions((prev) => {
        const filtered = new Map<string, ProcessingSession>();
        for (const [key, session] of prev.entries()) {
          // Only keep sessions matching the selected department
          if (session.departmentRole === filterByDepartment) {
            filtered.set(key, session);
          }
        }
        return filtered;
      });
    }
  }, [filterByDepartment]);

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
              // Reset ALL counters for new cycle - stale counts from previous sessions
              // cause confusing display (e.g. Found: 0, Processed: 100 after deletion)
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
                analyzed: 0,
                isProcessing: true,
                progress: 0,
                timestamp: Date.now(), // NEW timestamp for THIS cycle (detect overlapping cycles)
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
                  departmentRole,
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
                  console.warn(`[Email Processing] Resetting stale session (${sessionAge}ms old)`, {
                    sessionKey,
                    oldTotal: existing.total,
                    newTotal: eventTotal,
                  });
                  newSessions.set(sessionKey, {
                    sessionKey,
                    integrationId: existing.integrationId,
                    integrationName: existing.integrationName,
                    departmentRole: existing.departmentRole,
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
                  console.warn(
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
                  console.warn(
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
                  emailTotal, // Preserve original email count
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
                  // Initialize KB counters to 0
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
                  // Initialize KB counters to 0
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
          }

          return newSessions;
        });
      }

      // Maintain backward compatibility with legacy single-session state
      // Skip global events when department filtering is active to prevent cross-department interference
      if (filterByDepartment && !event.integrationId) {
        // Ignoring global event - department filter active
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
        organizationId?: number;
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
        totalFinalized?: boolean; // True when backend knows the definitive total
        aiAnalysisCalls?: number; // Number of AI analysis completions
      };

      // Filter by department if specified - ignore events from other departments
      if (
        filterByDepartment &&
        kbEvent.departmentRole &&
        kbEvent.departmentRole !== filterByDepartment
      ) {
        return;
      }

      // Filter by organization if specified - ignore events from other organizations
      if (filterByOrganization && kbEvent.organizationId !== filterByOrganization) {
        return;
      }

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

          // Merge KB progress into existing session
          // For standalone KB sessions (no emailTotal), also update top-level counters
          const isStandaloneKB = !existing.emailTotal && existing.stage === 'kb-processing';

          // Once totalFinalized is true, never decrease the total (prevents visual jumps
          // from backend sending different totals for different mailboxes)
          const incomingTotal = kbEvent.messages.total;
          const existingFinalized = existing.kbTotalFinalized;
          const newKBTotal =
            existingFinalized && existing.kbMessagesTotal
              ? Math.max(existing.kbMessagesTotal, incomingTotal)
              : incomingTotal;
          // Ensure processed never exceeds total
          const newKBProcessed = Math.min(kbEvent.messages.processed, newKBTotal);
          // Calculate progress that never goes backwards
          const newProgress = newKBTotal > 0 ? Math.round((newKBProcessed / newKBTotal) * 100) : 0;
          const safeProgress = Math.max(newProgress, existing.progress ?? 0);

          const updatedSession = {
            ...existing,
            stage: 'kb-processing',
            isProcessing: kbEvent.status === 'processing',
            // Always update analyzed from KB events (aiAnalysisCalls tracks AI completions)
            analyzed:
              kbEvent.aiAnalysisCalls ?? kbEvent.messages.successful ?? existing.analyzed ?? 0,
            // Update top-level counters for standalone KB sessions
            ...(isStandaloneKB
              ? {
                  total: newKBTotal,
                  current: newKBProcessed,
                  processed: newKBProcessed,
                  successful: kbEvent.messages.successful,
                  failed: kbEvent.messages.failed,
                  skipped: kbEvent.messages.skipped,
                  progress: safeProgress,
                }
              : {}),
            // KB entry counters (how many saved)
            kbEntriesTotal: kbEvent.kbEntries?.total ?? existing.kbEntriesTotal ?? 0,
            kbQAPairs: kbEvent.kbEntries?.qaPairs ?? existing.kbQAPairs ?? 0,
            kbStandaloneKnowledge:
              kbEvent.kbEntries?.standaloneKnowledge ?? existing.kbStandaloneKnowledge ?? 0,
            kbDocuments: kbEvent.kbEntries?.documents ?? existing.kbDocuments ?? 0,
            // KB message processing progress
            kbMessagesTotal: newKBTotal,
            kbMessagesProcessed: newKBProcessed,
            kbMessagesSuccessful: kbEvent.messages.successful,
            kbMessagesFailed: kbEvent.messages.failed,
            kbMessagesSkipped: kbEvent.messages.skipped,
            kbTotalFinalized: kbEvent.totalFinalized ?? existing.kbTotalFinalized ?? false,
          };

          newSessions.set(existingKey, updatedSession);
          return newSessions;
        }

        // No existing session found - KB event without email session
        // This can happen if:
        // 1. KB processing started before email polling (bulk import)
        // 2. Page refreshed after email session completed but KB still running
        // 3. Email processing completed and cleaned up, but KB still running
        // CREATE a new session for standalone KB processing
        const integrationId = kbEvent.messageSourceId;
        const departmentRole = kbEvent.departmentRole ?? 'general';
        const sessionKey = `${integrationId}-${departmentRole}`;

        // Only create if status is processing (not idle)
        if (kbEvent.status === 'processing' && kbEvent.messages.total > 0) {
          const newSession = {
            sessionKey,
            integrationId,
            integrationName: kbEvent.messageSourceName,
            departmentRole,
            status: 'processing' as const,
            stage: 'kb-processing',
            total: kbEvent.messages.total,
            current: kbEvent.messages.processed,
            processed: kbEvent.messages.processed,
            successful: kbEvent.messages.successful,
            failed: kbEvent.messages.failed,
            skipped: kbEvent.messages.skipped,
            isProcessing: true,
            progress: kbEvent.progress ?? 0,
            timestamp: Date.now(),
            // KB entry counters (how many saved)
            kbEntriesTotal: kbEvent.kbEntries?.total ?? 0,
            kbQAPairs: kbEvent.kbEntries?.qaPairs ?? 0,
            kbStandaloneKnowledge: kbEvent.kbEntries?.standaloneKnowledge ?? 0,
            kbDocuments: kbEvent.kbEntries?.documents ?? 0,
            // KB message processing progress (how many analyzed)
            kbMessagesTotal: kbEvent.messages.total,
            kbMessagesProcessed: kbEvent.messages.processed,
            kbMessagesSuccessful: kbEvent.messages.successful,
            kbMessagesFailed: kbEvent.messages.failed,
            kbMessagesSkipped: kbEvent.messages.skipped,
            kbTotalFinalized: kbEvent.totalFinalized ?? false,
          };

          newSessions.set(sessionKey, newSession);
        }

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
            // KB message processing progress (how many analyzed)
            kbMessagesTotal: kbEvent.messages?.total,
            kbMessagesProcessed: kbEvent.messages?.processed,
            kbMessagesSuccessful: kbEvent.messages?.successful,
            kbMessagesFailed: kbEvent.messages?.failed,
            kbMessagesSkipped: kbEvent.messages?.skipped,
            kbTotalFinalized: true, // Completed = total is known
          });
          return newSessions;
        }

        // No existing session found - KB completed without email session
        // Create a completed session to show the final results
        const integrationId = kbEvent.messageSourceId;
        const departmentRole = kbEvent.departmentRole ?? 'general';
        const sessionKey = `${integrationId}-${departmentRole}`;

        // Create a brief completed session to show results
        if (kbEvent.messages.total > 0) {
          newSessions.set(sessionKey, {
            sessionKey,
            integrationId,
            integrationName: kbEvent.messageSourceName,
            departmentRole,
            status: 'complete',
            stage: 'kb-processing',
            total: kbEvent.messages.total,
            current: kbEvent.messages.processed,
            processed: kbEvent.messages.processed,
            successful: kbEvent.messages.successful,
            failed: kbEvent.messages.failed,
            skipped: kbEvent.messages.skipped,
            isProcessing: false,
            progress: 100,
            timestamp: Date.now(),
            totalTime: kbEvent.duration,
            kbEntriesTotal: kbEvent.kbEntries?.total,
            kbQAPairs: kbEvent.kbEntries?.qaPairs,
            kbStandaloneKnowledge: kbEvent.kbEntries?.standaloneKnowledge,
            kbDocuments: kbEvent.kbEntries?.documents,
          });
        }

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

      // Reset legacy single-session state when no active sessions remain
      if (updated.size === 0) {
        setState({
          status: 'idle',
          total: 0,
          current: 0,
          processed: 0,
          failed: 0,
          isProcessing: false,
        });
      }

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
