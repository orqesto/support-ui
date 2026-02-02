import { useState } from 'react';
import { messageService } from '@/services/message.service';

type KBProcessingDetails = {
  totalAttachments: number;
  processed: number;
  rejected: number;
  alreadyProcessed: number;
  qaPairExtracted: boolean;
  rejectedItems: Array<{ filename: string; reason: string; score?: number }>;
  processedItems: Array<{ filename: string; type: string }>;
};

type AlertState = {
  open: boolean;
  title: string;
  description: string;
  variant: 'success' | 'error' | 'warning' | 'info';
};

export const useResolveMessageToKB = () => {
  const [resolving, setResolving] = useState(false);

  const buildFeedbackMessage = (
    details?: KBProcessingDetails
  ): { description: string; hasIssues: boolean } => {
    let description = '✅ Message marked as resolved\n\n';
    let hasIssues = false;

    if (!details) {
      return { description, hasIssues };
    }

    const {
      totalAttachments,
      processed,
      rejected,
      alreadyProcessed,
      qaPairExtracted,
      processedItems,
      rejectedItems,
    } = details;

    hasIssues = rejected > 0;

    if (totalAttachments > 0) {
      description += `📎 Attachments: ${totalAttachments} total\n`;
      if (processed > 0) {
        description += `✅ Saved to KB: ${processed}\n`;
        processedItems
          .filter((item) => item.type !== 'Q&A')
          .forEach((item) => {
            description += `   • ${item.filename} (${item.type})\n`;
          });
      }
      if (alreadyProcessed > 0) {
        description += `⏭️  Already processed: ${alreadyProcessed}\n`;
      }
      if (rejected > 0) {
        description += `❌ Rejected: ${rejected}\n`;
        rejectedItems
          .filter((item) => item.reason !== 'Already processed')
          .forEach((item) => {
            description += `   • ${item.filename}\n     ${item.reason}\n`;
          });
      }
    }

    if (qaPairExtracted) {
      description += `\n💬 Q&A pair extracted from thread`;
    } else if (totalAttachments === 0) {
      description += 'No attachments to process';
    }

    return { description, hasIssues };
  };

  const resolveMessage = async (
    messageId: number,
    onSuccess?: () => Promise<void>
  ): Promise<{ alertState: AlertState; refresh: () => Promise<void> } | null> => {
    try {
      setResolving(true);
      const response = await messageService.resolve(messageId);

      const data = (response?.data ?? {}) as {
        documentationIds?: number[];
        details?: KBProcessingDetails;
      };

      const { description, hasIssues } = buildFeedbackMessage(data.details);

      // Don't refresh yet - return alert and refresh function
      // Caller will show alert first, THEN refresh when dialog closes
      return {
        alertState: {
          open: true,
          title: hasIssues ? 'Message Resolved (with issues)' : 'Message Resolved Successfully',
          description,
          variant: hasIssues ? 'warning' : 'success',
        },
        refresh: async () => {
          await onSuccess?.();
        },
      };
    } catch (error) {
      console.error('Failed to resolve message:', error);
      return {
        alertState: {
          open: true,
          title: 'Failed to Resolve',
          description:
            error instanceof Error ? error.message : 'Failed to resolve message and save to KB',
          variant: 'error',
        },
        refresh: async () => {
          await onSuccess?.();
        },
      };
    } finally {
      setResolving(false);
    }
  };

  return { resolving, resolveMessage };
};
