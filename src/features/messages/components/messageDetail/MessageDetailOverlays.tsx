import type { MutableRefObject } from 'react';
import type { Message } from '@/types';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { HoldDialog } from '@/components/shared/HoldDialog';
import { SimilarMessagesDialog } from '@/features/messages/components/SimilarMessagesDialog';
import { WhatsAppTemplatePicker } from '@/features/messages/components/WhatsAppTemplatePicker';
import { AssignOnReplyDialog } from '../AssignOnReplyDialog';
import type { AssignOnReplyPrompt } from '../assignOnReplyPrompt';
import type { SendAction } from '../ComposerSendButton';
import { MessageDetailConfirmDialogs } from '../MessageDetailConfirmDialogs';
import { PromoteToKbDialog } from '../PromoteToKbDialog';
import type { MessageDetailProps, Setter } from './types';
import type { useConversationActions } from './useConversationActions';
import type { useDetailDialogs } from './useDetailDialogs';
import type { useGhostAnswer } from './useGhostAnswer';
import type { useReplyComposerState } from './useReplyComposerState';
import type { useReplySend } from './useReplySend';
import type { useThreadActions } from './useThreadActions';

/** MessageDetail's dialogs: templates, KB promotion, ownership, confirms, hold, replace, similar. */
export function MessageDetailOverlays({
  message,
  dialogs,
  replyState,
  send,
  conv,
  ghost,
  threadActions,
  assignPrompt,
  setAssignPrompt,
  onClose,
  sendHoldOpen,
  setSendHoldOpen,
  afterSendRef,
  similarOpen,
  setSimilarOpen,
}: {
  message: Message;
  dialogs: ReturnType<typeof useDetailDialogs>;
  replyState: ReturnType<typeof useReplyComposerState>;
  send: ReturnType<typeof useReplySend>;
  conv: ReturnType<typeof useConversationActions>;
  ghost: ReturnType<typeof useGhostAnswer>;
  threadActions: ReturnType<typeof useThreadActions>;
  assignPrompt: AssignOnReplyPrompt | null;
  setAssignPrompt: Setter<AssignOnReplyPrompt | null>;
  onClose: MessageDetailProps['onClose'];
  sendHoldOpen: boolean;
  setSendHoldOpen: Setter<boolean>;
  afterSendRef: MutableRefObject<{ action: SendAction; hold?: { reason: string; until: Date } }>;
  similarOpen: boolean;
  setSimilarOpen: Setter<boolean>;
}) {
  const {
    submitting,
    promoteToKbOpen,
    setPromoteToKbOpen,
    rejectDialogOpen,
    setRejectDialogOpen,
    reopenDialogOpen,
    setReopenDialogOpen,
    resolveConfirmOpen,
    setResolveConfirmOpen,
    notCustomerWorkOpen,
    setNotCustomerWorkOpen,
    closeConfirmOpen,
    setCloseConfirmOpen,
    markReadPromptOpen,
    setMarkReadPromptOpen,
  } = dialogs;
  const { templatesOpen, setTemplatesOpen, templates, templatesLoading, templateError } =
    replyState;
  const {
    performSend,
    handleSend,
    rememberSendAction,
    handleSendTemplate,
    collision,
    sendAnyway,
    cancelCollision,
  } = send;
  const { handleResolveWithoutReply, handleClose, applyRead } = conv;
  const { pendingGhost, setPendingGhost, applyGhostAnswer, handleGhostClick } = ghost;
  const { handleRefresh, handleNotCustomerWork, handleReject, handleReopen } = threadActions;
  return (
    <>
      <WhatsAppTemplatePicker
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
        loading={templatesLoading}
        sending={submitting}
        error={templateError}
        onSend={(templateId, parameters) => void handleSendTemplate(templateId, parameters)}
      />

      <PromoteToKbDialog
        messageId={message.id}
        isOpen={promoteToKbOpen}
        onClose={() => setPromoteToKbOpen(false)}
        onPromoted={handleRefresh}
      />

      {/* Confirm dialogs */}
      <AssignOnReplyDialog
        prompt={assignPrompt}
        sending={submitting}
        onChoose={(assign) => void performSend(assign)}
        onCancel={() => setAssignPrompt(null)}
      />
      <MessageDetailConfirmDialogs
        message={message}
        rejectDialogOpen={rejectDialogOpen}
        setRejectDialogOpen={setRejectDialogOpen}
        reopenDialogOpen={reopenDialogOpen}
        setReopenDialogOpen={setReopenDialogOpen}
        resolveConfirmOpen={resolveConfirmOpen}
        notCustomerWorkOpen={notCustomerWorkOpen}
        setNotCustomerWorkOpen={setNotCustomerWorkOpen}
        onNotCustomerWork={handleNotCustomerWork}
        setResolveConfirmOpen={setResolveConfirmOpen}
        closeConfirmOpen={closeConfirmOpen}
        setCloseConfirmOpen={setCloseConfirmOpen}
        markReadPromptOpen={markReadPromptOpen}
        setMarkReadPromptOpen={setMarkReadPromptOpen}
        onReject={handleReject}
        onReopen={handleReopen}
        onResolveToKB={handleResolveWithoutReply}
        onCloseThread={handleClose}
        onMarkReadAndClose={async () => {
          // Await the mark-read so a failure surfaces (toast + revert) while the
          // panel is still mounted, rather than as an orphaned toast post-close.
          await applyRead(true);
          onClose?.();
        }}
        onKeepUnreadAndClose={() => onClose?.()}
      />

      <HoldDialog
        open={sendHoldOpen}
        onOpenChange={setSendHoldOpen}
        title="Send and put on hold"
        description="The reply goes out, then the thread leaves the active list until the recheck date. Say why, so whoever picks it up knows what it is waiting for."
        confirmText="Send and put on hold"
        busy={submitting}
        onConfirm={(hold) => {
          setSendHoldOpen(false);
          rememberSendAction('hold');
          afterSendRef.current = { action: 'hold', hold };
          void handleSend();
        }}
      />

      {/* Thread presence send guard: someone replied or is writing — the server's question. */}
      <ConfirmDialog
        open={collision !== null}
        onOpenChange={(open) => {
          if (!open) cancelCollision();
        }}
        onConfirm={sendAnyway}
        title="Someone got here first"
        description={collision ?? ''}
        confirmText="Send anyway"
        cancelText="Cancel"
        variant="warning"
      />

      <ConfirmDialog
        open={pendingGhost !== null}
        onOpenChange={(open) => {
          if (!open) setPendingGhost(null);
        }}
        onConfirm={() => {
          if (pendingGhost) applyGhostAnswer(pendingGhost.answer, pendingGhost.source);
        }}
        title="Replace your reply with this answer?"
        description="What you have written so far will be replaced."
        confirmText="Replace"
        variant="warning"
      />

      {/* Similar messages dialog */}
      {similarOpen && (
        <SimilarMessagesDialog
          messageId={message.id}
          open={similarOpen}
          onClose={() => setSimilarOpen(false)}
          onSelectAnswer={(answer, source) => {
            handleGhostClick(answer, source ?? '');
            setSimilarOpen(false);
          }}
        />
      )}
    </>
  );
}
