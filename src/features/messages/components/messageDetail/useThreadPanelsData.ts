import { useState, useEffect, useRef, useCallback } from 'react';
import {
  messageService,
  type MessageNote,
  type MessageActivityEntry,
} from '@/services/message.service';
import {
  organizationService,
  type LeadQualificationFieldConfig,
} from '@/services/organization.service';
import { apiClient } from '@/lib/api-client';
import type { Message } from '@/types';
import { useConversationNotesRefresh } from '@/features/messages/hooks/useConversationNotesRefresh';
import type { Attachment } from '../MessageAttachments';
import { useLeadState } from '../useLeadState';
import type { Setter } from './types';

/** The side panels' data: notes, activity, the thread's files and the lead state. */

export function useThreadPanelsData({
  message,
  threadRefreshKey,
  panelsBump,
  notesBump,
  setNotesBump,
  activityBump,
  attachmentsBump,
}: {
  message: Message;
  threadRefreshKey: number;
  panelsBump: number;
  notesBump: number;
  setNotesBump: Setter<number>;
  activityBump: number;
  attachmentsBump: number;
}) {
  const [notes, setNotes] = useState<MessageNote[]>([]);
  const [messageActivity, setMessageActivity] = useState<MessageActivityEntry[]>([]);
  const [noteActivityLog, setNoteActivityLog] = useState<
    { label: string; who: string; time: string }[]
  >([]);
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState<Map<number, Attachment[]>>(
    new Map()
  );
  // Lead state — derived from this message + thread. Guarded against a slow answer for the
  // previously opened customer landing here (see useLeadState).
  const [leadState, setLeadState] = useLeadState(message);
  const [leadFieldDefs, setLeadFieldDefs] = useState<LeadQualificationFieldConfig[]>([]);

  // Fetch notes alongside thread refreshes
  useEffect(() => {
    let cancelled = false;
    messageService
      .getNotes(message.id)
      .then((notesRes) => {
        if (!cancelled && notesRes && notesRes.success && notesRes.data) setNotes(notesRes.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey, panelsBump, notesBump]);

  // A colleague added, edited or deleted a note on this thread: re-read the notes. The echo of a
  // note already on screen (our own add, which re-read them itself) is skipped.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const isKnownNote = useCallback(
    (noteId: number) => notesRef.current.some((note) => note.id === noteId),
    []
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
  const bumpNotes = useCallback(() => setNotesBump((key) => key + 1), []);
  useConversationNotesRefresh(message.id, isKnownNote, bumpNotes);

  // …and the activity log — also after a live incoming message (activityBump): saving one can
  // write activity (auto-reopen, auto-route, "thanks" kept finished) with no other signal.
  useEffect(() => {
    let cancelled = false;
    messageService
      .getActivity(message.id)
      .catch(() => [] as MessageActivityEntry[])
      .then((activity) => {
        if (!cancelled) setMessageActivity(activity);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey, panelsBump, activityBump]);

  // Fetch attachments for the whole thread (used by the Files tab + thread item attachment chips)
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data: Attachment[] }>(`/api/messages/${message.id}/attachments`)
      .then((res) => {
        if (cancelled) return;
        const map = new Map<number, Attachment[]>();
        for (const att of res.data.data ?? []) {
          if (att.messageEventId === null) continue;
          const list = map.get(att.messageEventId) ?? [];
          list.push(att);
          map.set(att.messageEventId, list);
        }
        // The API returns a message's files in no set order. Id order is the order they were
        // stored at ingest — the order the email carried them — so chips, the Files tab and the
        // viewer's next/previous all follow the email (owner, 2026-11-04).
        for (const list of map.values()) list.sort((left, right) => left.id - right.id);
        setAttachmentsByMessageId(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey, attachmentsBump]);

  // Lead config — fetched once
  useEffect(() => {
    organizationService
      .getLeadConfig()
      .then((cfg) => {
        if (cfg.qualificationFields?.length) setLeadFieldDefs(cfg.qualificationFields);
      })
      .catch(() => {});
  }, []);
  return {
    notes,
    setNotes,
    messageActivity,
    noteActivityLog,
    setNoteActivityLog,
    attachmentsByMessageId,
    leadState,
    setLeadState,
    leadFieldDefs,
  };
}
