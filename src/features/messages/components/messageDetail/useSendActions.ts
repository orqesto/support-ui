import { useCallback, type MutableRefObject } from 'react';
import { isBlankRichText } from '@/lib/stripHtml';
import { writeSendAction, type SendAction } from '../ComposerSendButton';
import type { Setter } from './types';

/** What happens after the reply is out (Send ▾): resolve, save to the KB, hold, or nothing. */
export type AfterSend = { action: SendAction; hold?: { reason: string; until: Date } };

/**
 * The Send ▾ choices around one send (useReplySend's `handleSend`): send with an after-send action,
 * remember the agent's pick as the button's face, and the hold dialog's confirm. Every one does
 * nothing while a send waits or is out (`sendBusyRef`), so a later press never changes what that
 * send does after it is out.
 */
export function useSendActions({
  composer,
  blocked = false,
  handleSend,
  afterSendRef,
  sendBusyRef,
  setSendHoldOpen,
  setSendAction,
  currentUserId,
}: {
  composer: string;
  /** No reply can be sent on this thread (the composer says why): no choice sends or asks. */
  blocked?: boolean;
  handleSend: () => Promise<void>;
  afterSendRef: MutableRefObject<AfterSend>;
  sendBusyRef: MutableRefObject<boolean>;
  setSendHoldOpen: Setter<boolean>;
  setSendAction: Setter<SendAction>;
  currentUserId: number | null;
}) {
  // Sends with an action WITHOUT remembering it: the Send ▾ face, which already shows the choice.
  const handleSendWith = useCallback(
    (action: SendAction) => {
      // A send is waiting or out: this press is not another one, and must not change what that
      // one does after it is out.
      if (sendBusyRef.current || blocked) return;
      if (isBlankRichText(composer)) return;
      // On hold needs its reason and recheck date first — asked BEFORE anything is sent.
      if (action === 'hold') {
        setSendHoldOpen(true);
        return;
      }
      afterSendRef.current = { action };
      void handleSend();
    },
    [composer, blocked, handleSend, afterSendRef, sendBusyRef, setSendHoldOpen]
  );
  const rememberSendAction = useCallback(
    (action: SendAction) => {
      setSendAction(action);
      writeSendAction(currentUserId ?? undefined, action);
    },
    [currentUserId, setSendAction]
  );
  // A Send ▾ menu pick: the agent's choice. Remembered as the face — On hold only once its dialog
  // is confirmed, so a cancelled hold does not turn every later Send into a hold dialog.
  const handleSendPick = useCallback(
    (action: SendAction) => {
      if (sendBusyRef.current || blocked) return;
      if (action !== 'hold') rememberSendAction(action);
      handleSendWith(action);
    },
    [blocked, handleSendWith, rememberSendAction, sendBusyRef]
  );
  /** The hold dialog's confirm: the reply goes out, then the thread is put on hold. */
  const sendWithHold = useCallback(
    (hold: { reason: string; until: Date }) => {
      if (sendBusyRef.current || blocked) return;
      rememberSendAction('hold');
      afterSendRef.current = { action: 'hold', hold };
      void handleSend();
    },
    [afterSendRef, blocked, handleSend, rememberSendAction, sendBusyRef]
  );
  return { handleSendWith, rememberSendAction, handleSendPick, sendWithHold };
}
