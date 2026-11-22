import { useCallback } from 'react';
import { messageService } from '@/services/message.service';
import { logger } from '@/lib/logger';
import { resolveSendFailureMessage } from '@/features/messages/components/sendErrorMessage';
import { keyForPayload } from './sendKey';
import type { MessageDetailProps, Setter } from './types';
import type { useReplyComposerState } from './useReplyComposerState';

/** WhatsApp approved templates: the picker's list and the send (split out of useReplySend). */
export function useTemplateSend({
  messageId,
  replyState,
  setSubmitting,
  setThreadRefreshKey,
  onReplied,
  onRefresh,
}: {
  messageId: number;
  replyState: ReturnType<typeof useReplyComposerState>;
  setSubmitting: Setter<boolean>;
  setThreadRefreshKey: Setter<number>;
} & Pick<MessageDetailProps, 'onReplied' | 'onRefresh'>) {
  const {
    sendBusyRef,
    templateIdempotencyKeyRef,
    setTemplateError,
    setTemplatesOpen,
    setTemplatesLoading,
    setTemplates,
  } = replyState;
  const handleOpenTemplates = useCallback(async () => {
    setTemplateError(null);
    setTemplatesOpen(true);
    setTemplatesLoading(true);
    try {
      setTemplates(await messageService.listWhatsAppTemplates(messageId));
    } finally {
      // The service already swallows a missing endpoint into an empty list, so the picker
      // shows its "nothing approved yet" state rather than an error the agent cannot act on.
      setTemplatesLoading(false);
    }
  }, [messageId, setTemplateError, setTemplates, setTemplatesLoading, setTemplatesOpen]);

  const handleSendTemplate = useCallback(
    async (templateId: number, parameters: string[]) => {
      if (sendBusyRef.current) return;
      sendBusyRef.current = true;
      setSubmitting(true);
      setTemplateError(null);
      // Same idempotency contract as a normal reply: reuse the token on a retry of the SAME
      // template and parameters so a success-but-timeout cannot bill the tenant for a second one;
      // another template or other parameters get their own. Never the text reply's token
      // (templateIdempotencyKeyRef).
      const idempotencyKey = keyForPayload(
        templateIdempotencyKeyRef,
        JSON.stringify([templateId, parameters])
      );
      try {
        await messageService.reply(
          messageId,
          '',
          false,
          false,
          undefined,
          idempotencyKey,
          undefined,
          { templateId, parameters }
        );
        templateIdempotencyKeyRef.current = null;
        setTemplatesOpen(false);
        setThreadRefreshKey((key) => key + 1);
        onReplied?.();
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to send WhatsApp template:', err);
        // Shown inside the picker, not as a toast: every refusal here names something the
        // agent can fix in the dialog they are already looking at.
        setTemplateError(resolveSendFailureMessage(err));
      } finally {
        sendBusyRef.current = false;
        setSubmitting(false);
      }
    },
    [
      messageId,
      onRefresh,
      onReplied,
      templateIdempotencyKeyRef,
      sendBusyRef,
      setSubmitting,
      setTemplateError,
      setTemplatesOpen,
      setThreadRefreshKey,
    ]
  );
  return { handleOpenTemplates, handleSendTemplate };
}
