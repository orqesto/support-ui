import { useEffect, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

type ProcessingStatus = 'idle' | 'started' | 'processing' | 'complete' | 'error';

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
  filterByDepartment?: string;
  filterByOrganization?: number;
  setState: React.Dispatch<React.SetStateAction<EmailProcessingState>>;
};

export const useEmailProcessingSessions = ({
  filterByDepartment,
  filterByOrganization,
  setState,
}: UseEmailProcessingSessionsParams) => {
  // Track multiple processing sessions by sessionKey (integrationId-departmentRole)
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
      logger.error('[useEmailProcessing] Failed to restore sessions:', error);
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
