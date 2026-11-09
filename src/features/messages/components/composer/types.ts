import type React from 'react';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import type { AiDraft } from '@/services/message.service';
import type { Message } from '@/types';
import type { RecipientDraft } from '../RecipientFields';
import type { SendAction } from '../ComposerSendButton';

export type MessageComposerProps = {
  message: Message;
  composer: string;
  setComposer: React.Dispatch<React.SetStateAction<string>>;
  composerMode: 'reply' | 'note';
  setComposerMode: React.Dispatch<React.SetStateAction<'reply' | 'note'>>;
  submitting: boolean;
  onSend: () => void;
  richEditorRef: React.RefObject<RichTextEditorHandle>;
  noteEditorRef: React.RefObject<RichTextEditorHandle>;
  onOpenSimilarMessages: () => void;
  selectedFiles: File[];
  onFilesChange: (files: File[]) => void;
  /** Single-key shortcuts that act in this view (detailShortcuts.ts); omitted, no hint shows. */
  shortcutHint?: string;
  /** The resolve decisions (ResolveDecisions), rendered last — under the reply. */
  decisions?: React.ReactNode;
  /**
   * Set when the channel forbids sending right now (WhatsApp's 24-hour window). Disables
   * send and is shown above the composer. Never set for internal notes — those are not
   * delivered to the customer, so no channel rule applies.
   */
  sendBlockedReason?: string | null;
  /** e.g. "2h 30m" — how long a WhatsApp reply window has left. */
  windowRemaining?: string | null;
  windowTone?: 'none' | 'info' | 'warning' | 'blocked';
  /**
   * Opens the approved-template picker. Offered ONLY from the blocked notice: a template
   * is what the agent needs precisely when free-form is refused, and putting it in the
   * toolbar would invite a billable send on conversations where a free reply was legal.
   * Absent when the channel has no templates to offer.
   */
  onUseTemplate?: (() => void) | null;
  /**
   * To/Cc/Bcc for this reply. Absent for channels with no addressing — the
   * fields are only meaningful on email, and a Cc box on a Telegram thread
   * would be a promise the transport can't keep.
   */
  recipientDraft?: RecipientDraft;
  onRecipientDraftChange?: (draft: RecipientDraft) => void;
  /** Everyone on the thread who is not us — offered as Reply all and one-click Cc. */
  participants?: string[];
  /**
   * Reports which AI mode produced the text now in the composer (null when the
   * agent undoes back to their own text), so the send can be stamped with its
   * true author. The second argument is that draft as applied, carried on the
   * send for reply_style capture (undefined on undo).
   */
  onAiSourceChange?: (source: string | null, draft?: AiDraft) => void;
  /**
   * v4 "Look up": takes the agent to the Connected systems block on the Lookups tab. The host
   * passes it ONLY when this workspace has a lookup the agent could run on a thread (the same
   * cached availability answer the lookup panel renders on) — absent, no button, because a
   * button that opens an empty tab is the dead control the availability check exists to remove.
   * Reply mode only: a lookup feeds the reply, an internal note has no use for it.
   */
  onLookUp?: (() => void) | null;
  /** Hidden but kept mounted (v4 mobile: a phone shows the composer under Thread / Notes only). */
  hidden?: boolean;
  /**
   * Send-and-then (2026-10-29): the reply's Send becomes a split button offering these. Absent,
   * a plain Send. `sendAction` is the face — the agent's last choice.
   */
  sendActions?: SendAction[];
  sendAction?: SendAction;
  /** The Send ▾ face: send with what it shows. */
  onSendWith?: (action: SendAction) => void;
  /** A Send ▾ menu pick: the agent's choice — send with it and remember it. */
  onSendPick?: (action: SendAction) => void;
  /** Told when the box opens or folds, so the host can shrink its header while a reply is written. */
  onOpenChange?: (open: boolean) => void;
  /** The text came back from this browser (useUnsentDraft): the box opens and says so. */
  restoredDraft?: boolean;
  onDiscardRestoredDraft?: () => void;
};
