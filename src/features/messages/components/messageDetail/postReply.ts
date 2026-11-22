import {
  messageService,
  type AiDraft,
  type ReplyAssignIntent,
  type ReplyCollision,
  type ReplyRecipients,
} from '@/services/message.service';

/**
 * The reply's POST as the composer sends it: with files on the multipart path, without them on the
 * JSON one. "Send, resolve & save to KB" rides on the reply itself (`resolveInSend` is both the
 * resolve and the save). Answers the raw body (afterSendNotes reads what did not finish).
 */
export const postReply = (
  threadId: number,
  reply: {
    composer: string;
    selectedFiles: File[];
    resolveInSend: boolean;
    aiSource: string | null;
    idempotencyKey?: string;
    aiDraft: AiDraft | null;
    recipients?: ReplyRecipients;
    assign?: ReplyAssignIntent;
    guard?: ReplyCollision;
  }
): Promise<unknown> => {
  const { composer, selectedFiles, resolveInSend, aiSource, idempotencyKey, aiDraft } = reply;
  const { recipients, assign, guard } = reply;
  return selectedFiles.length > 0
    ? messageService.replyWithAttachments(
        threadId,
        composer,
        selectedFiles,
        resolveInSend,
        aiSource !== null,
        aiSource ?? undefined,
        idempotencyKey,
        aiDraft ?? undefined,
        recipients,
        assign,
        guard,
        resolveInSend
      )
    : messageService.reply(
        threadId,
        composer,
        resolveInSend,
        aiSource !== null,
        aiSource ?? undefined,
        idempotencyKey,
        aiDraft ?? undefined,
        undefined,
        recipients,
        assign,
        guard,
        resolveInSend
      );
};
