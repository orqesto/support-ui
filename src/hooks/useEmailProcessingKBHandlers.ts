import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import { nextUtcMidnight } from '@/lib/utcClock';

type SetSessions = React.Dispatch<React.SetStateAction<Map<string, ProcessingSession>>>;

/** Mark the session an event just changed with the time of that event (see `updatedAt`). */
export const stampUpdated = (
  sessions: Map<string, ProcessingSession>,
  sessionKey: string,
  before: ProcessingSession | undefined
): Map<string, ProcessingSession> => {
  const after = sessions.get(sessionKey);
  if (after && after !== before) sessions.set(sessionKey, { ...after, updatedAt: Date.now() });
  return sessions;
};

type KBProgressEvent = {
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
  departmentSlug?: string; // May include department
  departmentId?: number;
  totalFinalized?: boolean; // True when backend knows the definitive total
  aiAnalysisCalls?: number; // Number of AI analysis completions
};

type KBCompletedEvent = {
  messageSourceId: number;
  /**
   * The daily KB token limit stopped the mine (backend B9): it waits for the reset and resumes by
   * itself — not a completion. `resumesAt` is the reset instant. Absent from an older backend.
   */
  paused?: boolean;
  resumesAt?: string;
  organizationId?: number;
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
  departmentSlug?: string;
  departmentId?: number;
  forced?: boolean;
  reason?: string;
};

type KBHandlerParams = {
  filterByOrganization?: number;
  setSessions: SetSessions;
};

/** Returns event-handler functions for kb:progress and kb:completed socket events. */
export const makeKBHandlers = ({ filterByOrganization, setSessions }: KBHandlerParams) => {
  // Handle KB progress events (different format from email events)
  const handleKBProgress = (data: unknown) => {
    const kbEvent = data as KBProgressEvent;

    // Filter by organization if specified - ignore events from other organizations
    if (filterByOrganization && kbEvent.organizationId !== filterByOrganization) {
      return;
    }

    const integrationId = kbEvent.messageSourceId;
    const sessionKey = `${integrationId}`;

    setSessions((prev) => {
      const newSessions = new Map(prev);

      const existingKey: string | null = newSessions.has(sessionKey) ? sessionKey : null;

      // If existing session found, merge KB data into it
      if (existingKey) {
        const existing = newSessions.get(existingKey);
        if (!existing) {
          return newSessions;
        }

        // Merge KB progress into existing session
        // For standalone KB sessions (no email fetch behind them), also update top-level
        // counters. A session an email fetch is driving keeps Found/Processed for the fetch.
        const isStandaloneKB =
          !existing.emailTotal && !existing.hasEmailFetch && existing.stage === 'kb-processing';

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
          // While this session moves again its pause is not shown — not "the pause is over": a
          // session reopened before its reset keeps parked work, and a paused kb:completed sets it
          // again (be R11 B(a)).
          kbPausedUntil: undefined,
          kbPauseStoppedEarly: undefined,
        };

        newSessions.set(existingKey, updatedSession);
        return stampUpdated(newSessions, existingKey, existing);
      }

      // No existing session found - KB event without email session
      // This can happen if:
      // 1. KB processing started before email polling (bulk import)
      // 2. Page refreshed after email session completed but KB still running
      // 3. Email processing completed and cleaned up, but KB still running
      // CREATE a new session for standalone KB processing
      const departmentSlug = kbEvent.departmentSlug ?? 'info';
      const departmentId = kbEvent.departmentId;

      // Only create if status is processing (not idle)
      if (kbEvent.status === 'processing' && kbEvent.messages.total > 0) {
        const newSession = {
          sessionKey,
          integrationId,
          integrationName: kbEvent.messageSourceName,
          departmentSlug,
          departmentId,
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

      return stampUpdated(newSessions, sessionKey, undefined);
    });
  };

  // Handle KB completed events
  const handleKBCompleted = (data: unknown) => {
    const kbEvent = data as KBCompletedEvent;

    if (filterByOrganization && kbEvent.organizationId !== filterByOrganization) {
      return;
    }

    const kbIntegrationId = kbEvent.messageSourceId;
    const kbSessionKey = `${kbIntegrationId}`;
    const completionStatus = kbEvent.forced ? 'error' : 'complete';

    // Paused at the daily KB limit: NOT a completion. The session stops moving but keeps its
    // progress, and says when it resumes — never 100% / "complete" over unmined conversations.
    if (kbEvent.paused === true) {
      const kbPausedUntil = kbEvent.resumesAt ?? nextUtcMidnight();
      setSessions((prev) => {
        const existing = prev.get(kbSessionKey);
        if (!existing && !(kbEvent.messages?.total > 0)) return prev;
        const next = new Map(prev);
        const processed = kbEvent.messages?.processed ?? existing?.kbMessagesProcessed ?? 0;
        const total = kbEvent.messages?.total ?? existing?.kbMessagesTotal ?? 0;
        next.set(kbSessionKey, {
          ...(existing ?? {
            sessionKey: kbSessionKey,
            integrationId: kbIntegrationId,
            integrationName: kbEvent.messageSourceName,
            departmentSlug: kbEvent.departmentSlug ?? 'info',
            departmentId: kbEvent.departmentId,
            stage: 'kb-processing',
            total,
            current: processed,
            processed,
            successful: kbEvent.messages.successful,
            failed: kbEvent.messages.failed,
            skipped: kbEvent.messages.skipped,
            // `messages.total` leaves the parked jobs out, so processed === total is no finish:
            // a paused session never reads 100% (FE audit pass 19, NIT).
            progress: total > 0 && processed < total ? Math.round((processed / total) * 100) : 0,
            timestamp: Date.now(),
          }),
          // A session that existed keeps its own progress below 100; at 100 or more it is set to
          // 0 (not known), never left at 100: a standalone KB session's progress is processed /
          // total, and with the parked jobs left out of the total its last kb:progress can read
          // 100 (FE audit pass 20, NIT).
          ...(existing && existing.progress >= 100 ? { progress: 0 } : {}),
          status: 'idle',
          isProcessing: false,
          kbMessagesTotal: total,
          kbMessagesProcessed: processed,
          kbPausedUntil,
          // A timeout / manual force-end also carries `paused` (be R12 B(b)): its unreported jobs
          // are not parked work, so the panel must not promise they resume (FE pass 13, LOW).
          kbPauseStoppedEarly:
            kbEvent.forced === true && kbEvent.reason !== 'kb_token_limit'
              ? (kbEvent.reason ?? 'unknown')
              : undefined,
        });
        // The pause is an event of this session: stamp it, as every other branch does.
        return stampUpdated(next, kbSessionKey, existing);
      });
      return;
    }

    setSessions((prev) => {
      const newSessions = new Map(prev);

      const existingKey: string | null = newSessions.has(kbSessionKey) ? kbSessionKey : null;

      // If existing session found, merge KB completion into it
      if (existingKey) {
        const existing = newSessions.get(existingKey);
        if (!existing) {
          return newSessions;
        }
        newSessions.set(existingKey, {
          ...existing,
          status: completionStatus,
          isProcessing: false,
          progress: kbEvent.forced ? existing.progress : 100,
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
          // A plain end closes any earlier pause: a paused end then a plain one with no
          // kb:progress between kept the stale pause line over "complete" (FE pass 13, NIT).
          kbPausedUntil: undefined,
          kbPauseStoppedEarly: undefined,
        });
        return newSessions;
      }

      // No existing session found - KB completed without email session
      // Create a completed session to show the final results
      const departmentSlug = kbEvent.departmentSlug ?? 'info';
      const departmentId = kbEvent.departmentId;

      // Create a brief completed session to show results (skip forced completions — no useful data to show)
      if (kbEvent.messages.total > 0 && !kbEvent.forced) {
        newSessions.set(kbSessionKey, {
          sessionKey: kbSessionKey,
          integrationId: kbIntegrationId,
          integrationName: kbEvent.messageSourceName,
          departmentSlug,
          departmentId,
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

  return { handleKBProgress, handleKBCompleted };
};
