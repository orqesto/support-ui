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
import { useSeededState } from '@/lib/seededState';
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
  // Each starts from the last read of this thread (seededState): a tab switch draws them at once.
  const [notes, setNotes] = useSeededState<MessageNote[]>(['thread', message.id, 'notes'], []);
  const [messageActivity, setMessageActivity] = useSeededState<MessageActivityEntry[]>(
    ['thread', message.id, 'activity'],
    []
  );
  const [noteActivityLog, setNoteActivityLog] = useState<
    { label: string; who: string; time: string }[]
  >([]);
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useSeededState<
    Map<number, Attachment[]>
  >(['thread', message.id, 'attachments'], () => new Map());
  // Lead state — derived from this message + thread. Guarded against a slow answer for the
  // previously opened customer landing here (see useLeadState).
  const [leadState, setLeadState] = useLeadState(message);
  const [leadFieldDefs, setLeadFieldDefs] = useSeededState<LeadQualificationFieldConfig[]>(
    ['workspace', 'lead-config', 'fields'],
    []
  );

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
  }, [message.id, threadRefreshKey, panelsBump, notesBump, setNotes]);

  // A colleague added, edited or deleted a note on this thread: re-read the notes. The echo of a
  // note already on screen (our own add, which re-read them itself) is skipped.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const isKnownNote = useCallback(
    (noteId: number) => notesRef.current.some((note) => note.id === noteId),
    []
  );
  const bumpNotes = useCallback(() => setNotesBump((key) => key + 1), [setNotesBump]);
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
  }, [message.id, threadRefreshKey, panelsBump, activityBump, setMessageActivity]);

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
  }, [message.id, threadRefreshKey, attachmentsBump, setAttachmentsByMessageId]);

  // Lead config — fetched once
  useEffect(() => {
    organizationService
      .getLeadConfig()
      .then((cfg) => {
        if (cfg.qualificationFields?.length) setLeadFieldDefs(cfg.qualificationFields);
      })
      .catch(() => {});
  }, [setLeadFieldDefs]);
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
