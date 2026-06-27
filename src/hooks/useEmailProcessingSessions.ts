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
  // DB-truth counters from BE PR #60. When the BE has verified that all batch
  // messages actually have metadata.analysis written, analyzedInDb reflects the
  // real count. missingAnalysis > 0 means queues drained but some messages
  // never got an ai-analysis job (cap-throttle path). Old BE clients omit
  // these — FE falls back to the legacy `analyzed` counter.
  analyzedInDb?: number;
  missingAnalysis?: number;
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
  // Sessions are derived entirely from the backend — the single source of truth.
  // On every (re)connect the server replays all active sessions for the org (see
  // websocketManager.getActiveSessionsForOrg, which even re-sends `complete` for
  // runs finished in the last 30s so reconnecting clients can't get stuck widgets).
  //
  // We intentionally do NOT restore processing state from localStorage. Persisting
  // live state and trusting it on reload created "zombie" sessions (total: 0, stale
  // timestamp) that rendered as permanently "stuck" and drove a reset render loop.
  // Start empty and let the server rehydrate.
  const [sessions, setSessions] = useState<Map<string, ProcessingSession>>(() => new Map());

  // We no longer persist live session state to localStorage (the backend replays
  // active sessions on reconnect). Clean up any blob written by older builds so a
  // previously-persisted zombie session can't linger.
  useEffect(() => {
    try {
      localStorage.removeItem('emailProcessing_sessions');
    } catch {
      /* ignore */
    }
  }, []);

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
