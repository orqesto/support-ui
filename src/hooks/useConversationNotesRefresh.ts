import { useEffect, useRef } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';

export const CONV_NOTES_CHANGED_EVENT = 'conv:notes_changed';
export const CONV_NOTES_REFRESH_MS = 500;

type NotesChangedPayload = {
  conversationId?: number;
  noteId?: number;
  action?: 'created' | 'updated' | 'deleted';
};

/**
 * Re-read an OPEN thread's notes when someone adds, edits or deletes one (`conv:notes_changed`).
 * Without it a colleague's note stayed invisible until the thread was opened again (staging,
 * 2026-11-01, thread 21401).
 *
 * `isKnownNote` skips the echo of a note this tab already shows: the agent's own add re-reads the
 * notes itself, so its `created` event would only repeat that read. It is asked when the window
 * CLOSES, not when the event arrives: the backend emits before it answers the add, so the echo
 * lands before the add's own re-read has put the note on screen (review 2026-11-01). Edits and
 * deletes always re-read — the event carries ids only, never the text.
 *
 * COALESCED like useConversationStatusRefresh: events inside the window join one re-read.
 */
export const useConversationNotesRefresh = (
  conversationId: number,
  isKnownNote: (noteId: number) => boolean,
  refresh: () => void
): void => {
  const refreshRef = useRef(refresh);
  const isKnownRef = useRef(isKnownNote);
  useEffect(() => {
    refreshRef.current = refresh;
    isKnownRef.current = isKnownNote;
  }, [refresh, isKnownNote]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Inside one window: the notes created (maybe our own), and whether anything else changed.
    let created: number[] = [];
    let otherChange = false;
    const onNotesChanged = (data: unknown) => {
      const payload = data as NotesChangedPayload | null;
      if (payload?.conversationId !== conversationId) return;
      if (payload.action === 'created' && typeof payload.noteId === 'number') {
        created.push(payload.noteId);
      } else {
        otherChange = true;
      }
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        const unknownNote = created.some((noteId) => !isKnownRef.current(noteId));
        const reread = otherChange || unknownNote;
        created = [];
        otherChange = false;
        if (reread) refreshRef.current();
      }, CONV_NOTES_REFRESH_MS);
    };
    subscribeToEvent(CONV_NOTES_CHANGED_EVENT, onNotesChanged);
    return () => {
      unsubscribeFromEvent(CONV_NOTES_CHANGED_EVENT, onNotesChanged);
      if (timer !== null) clearTimeout(timer);
      releaseSocket();
    };
  }, [conversationId]);
};
