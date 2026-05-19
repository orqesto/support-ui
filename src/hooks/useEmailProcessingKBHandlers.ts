import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';

type SetSessions = React.Dispatch<React.SetStateAction<Map<string, ProcessingSession>>>;

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
  departmentRole?: string; // May include department
  totalFinalized?: boolean; // True when backend knows the definitive total
  aiAnalysisCalls?: number; // Number of AI analysis completions
};

type KBCompletedEvent = {
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

type KBHandlerParams = {
  filterByDepartment?: string;
  filterByOrganization?: number;
  setSessions: SetSessions;
};

/** Returns event-handler functions for kb:progress and kb:completed socket events. */
export const makeKBHandlers = ({
  filterByDepartment,
  filterByOrganization,
  setSessions,
}: KBHandlerParams) => {
  // Handle KB progress events (different format from email events)
  const handleKBProgress = (data: unknown) => {
    const kbEvent = data as KBProgressEvent;

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
    ].filter((key): key is string => key !== null);

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
      const kbIntegrationId = kbEvent.messageSourceId;
      const departmentRole = kbEvent.departmentRole ?? 'general';
      const sessionKey = `${kbIntegrationId}-${departmentRole}`;

      // Only create if status is processing (not idle)
      if (kbEvent.status === 'processing' && kbEvent.messages.total > 0) {
        const newSession = {
          sessionKey,
          integrationId: kbIntegrationId,
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
    const kbEvent = data as KBCompletedEvent;

    // Try to find existing email processing session first
    const kbIntegrationId = kbEvent.messageSourceId;
    const possibleKeys = [
      `${kbIntegrationId}-general`,
      `${kbIntegrationId}-support`,
      `${kbIntegrationId}-sales`,
      `${kbIntegrationId}-billing`,
      kbEvent.departmentRole ? `${kbIntegrationId}-${kbEvent.departmentRole}` : null,
    ].filter((key): key is string => key !== null);

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
      const completedIntegrationId = kbEvent.messageSourceId;
      const departmentRole = kbEvent.departmentRole ?? 'general';
      const sessionKey = `${completedIntegrationId}-${departmentRole}`;

      // Create a brief completed session to show results
      if (kbEvent.messages.total > 0) {
        newSessions.set(sessionKey, {
          sessionKey,
          integrationId: completedIntegrationId,
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

  return { handleKBProgress, handleKBCompleted };
};
