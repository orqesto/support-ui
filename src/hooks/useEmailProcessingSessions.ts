import { useEffect, useState, useCallback, useRef } from 'react';
import { logger } from '@/lib/logger';

type ProcessingStatus = 'idle' | 'started' | 'processing' | 'complete' | 'error';

export type ProcessingSession = {
  sessionKey: string; // integrationId (string)
  integrationId: number;
  integrationName: string;
  departmentSlug?: string; // Department this integration belongs to
  departmentId?: number; // Numeric dept ID (Phase 6+)
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
  linkedReplies?: number; // Sent folder replies linked to existing threads
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

type UseEmailProcessingSessionsParams = {
  filterByOrganization?: number;
  setState: React.Dispatch<React.SetStateAction<EmailProcessingState>>;
};

export const useEmailProcessingSessions = ({
  filterByOrganization,
  setState,
}: UseEmailProcessingSessionsParams) => {
  // Track multiple processing sessions by sessionKey (integrationId)
  // Restore sessions from localStorage on mount
  const [sessions, setSessions] = useState<Map<string, ProcessingSession>>(() => {
    try {
      const saved = localStorage.getItem('emailProcessing_sessions');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed)) return new Map();
        const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
        const filtered = (parsed as Array<unknown>).filter((entry): entry is [string, ProcessingSession] => {
          if (!Array.isArray(entry) || entry.length !== 2) return false;
          const [key, session] = entry as [unknown, unknown];
          if (typeof key !== 'string') return false;
          if (!session || typeof session !== 'object') return false;
          const sess = session as Record<string, unknown>;
          if (typeof sess['status'] !== 'string') return false;
          const timestamp = typeof sess['timestamp'] === 'number' ? sess['timestamp'] : Date.now();
          if (sess['status'] === 'complete' || sess['status'] === 'error') return false;
          if (timestamp <= thirtyMinutesAgo) return false;
          // Drop stale sessions using old integrationId-departmentSlug key format
          if (/^\d+-\w+$/.test(key)) return false;
          return true;
        });
        return new Map(filtered);
      }
    } catch (error) {
      logger.error('[useEmailProcessing] Failed to restore sessions:', error);
    }
    return new Map();
  });

  // Persist minimal session state to localStorage — omit counts/metadata to limit
  // operational data exposure on shared machines (only restore UI state on refresh).
  useEffect(() => {
    if (sessions.size > 0) {
      try {
        const sessionArray = Array.from(sessions.entries()).map(([key, session]) => [
          key,
          {
            sessionKey: session.sessionKey,
            integrationId: session.integrationId,
            integrationName: session.integrationName,
            status: session.status,
            timestamp: session.timestamp,
            isProcessing: session.isProcessing,
          },
        ]);
        localStorage.setItem('emailProcessing_sessions', JSON.stringify(sessionArray));
      } catch (error) {
        logger.error('[useEmailProcessing] Failed to save sessions:', error);
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
            logger.warn(`[useEmailProcessing] Session ${key} timed out after 20 minutes`);
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

  // Clear all sessions when organization changes (admin switching context)
  // Skip on first render to avoid wiping restored sessions from localStorage
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (filterByOrganization) {
      setSessions(new Map());
      // Clear localStorage for stale organization
      localStorage.removeItem('emailProcessing_sessions');
    }
  }, [filterByOrganization]);

  const removeSession = useCallback(
    (sessionKey: string) => {
      setSessions((prev) => {
        const updated = new Map(prev);
        updated.delete(sessionKey);
        // Also clear from localStorage
        localStorage.removeItem(`emailProcessingWidget_${sessionKey}_closed`);
        localStorage.removeItem(`emailProcessingWidget_${sessionKey}_position`);
        localStorage.removeItem(`emailProcessingWidget_${sessionKey}_dismissed`);

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
    },
    [setState]
  );

  return { sessions, setSessions, removeSession };
};
