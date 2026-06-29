import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  messageService,
  type MessageNote,
  type MessageActivityEntry,
} from '@/services/message.service';
import {
  organizationService,
  type LeadQualificationFieldConfig,
} from '@/services/organization.service';
import { getSpamCheck } from '@/lib/messageHelpers';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import type { Message, MessageEvent } from '@/types';
import { MessageDetailHeader } from './MessageDetailHeader';
import { MessageComposer } from './MessageComposer';
import { MessageActionStrip } from './MessageActionStrip';
import { MessageGhostBubble } from './MessageGhostBubble';
import { MessageDetailConfirmDialogs } from './MessageDetailConfirmDialogs';
import { ThreadMessageItem } from './ThreadMessageItem';
import { similarResultsCache } from './AiTabPanel';
import type { KBAttachment } from './AiTabPanel';
import { MessagePanelTabs } from './MessagePanelTabs';
import type { Attachment } from './MessageAttachments';
import type { LeadQualificationPanel } from '@/components/tickets/LeadQualificationPanel';
import { SimilarMessagesDialog } from '@/components/modals/SimilarMessagesDialog';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import {
  toGhostOption,
  type GhostOption,
  type SuggestedAnswerMeta,
} from './messageDetailConstants';

type LeadState = Parameters<typeof LeadQualificationPanel>[0]['leadState'];
type PanelTab =
  | 'ai'
  | 'customer'
  | 'attachments'
  | 'kb'
  | 'activity'
  | 'notes'
  | 'lead'
  | 'contradiction';

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessageDetailProps = {
  message: Message;
  onClose?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onReopen?: () => void;
  onDelete?: () => void;
  onResolve?: () => void;
  onRefresh?: () => void;
  onClassify?: (action: 'approve' | 'mark_suspicious' | 'move_to_spam') => Promise<void>;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageDetail({
  message,
  onClose,
  onApprove,
  onReject,
  onReopen,
  onDelete,
  onResolve,
  onRefresh,
  onClassify,
}: MessageDetailProps) {
  // ── Thread state ───────────────────────────────────────────────────────────
  const [threadMessages, setThreadMessages] = useState<MessageEvent[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadRefreshKey, setThreadRefreshKey] = useState(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    let cancelled = false;
    setThreadLoading(true);
    setThreadError(null);
    messageService
      .getThreadMessages(message.id)
      .then((res) => {
        if (!cancelled) setThreadMessages(res.data ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          logger.error('Failed to load thread:', err);
          setThreadError('Failed to load thread. Please try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey]);

  // ── Sorted thread ──────────────────────────────────────────────────────────

  const sortedThread = useMemo<MessageEvent[]>(() => {
    const msgs = [...threadMessages];
    const msgTime = (msg: MessageEvent) =>
      new Date(
        msg.sentAt ?? (msg.metadata as { receivedAt?: string } | null)?.receivedAt ?? msg.createdAt
      ).getTime();
    msgs.sort((ma, mb) => msgTime(ma) - msgTime(mb));
    return msgs;
  }, [threadMessages]);

  // ── Composer state ─────────────────────────────────────────────────────────
  const [composer, setComposer] = useState('');
  const [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply');
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sendFailedError, setSendFailedError] = useState<string | null>(null);
  const richEditorRef = useRef<RichTextEditorHandle>(null);
  const noteEditorRef = useRef<RichTextEditorHandle>(null);

  // ── Real-time reply events ─────────────────────────────────────────────────
  useEffect(() => {
    getSocket();
    const handleSendFailed = (data: unknown) => {
      const event = data as { messageId: number; channel: string };
      if (event.messageId === message.id) {
        setSendFailedError(
          `Reply could not be delivered via ${event.channel}. The message was saved but not sent — please try again.`
        );
      }
    };
    const handleReplied = (data: unknown) => {
      const event = data as { messageId: number };
      if (event.messageId === message.id) {
        setThreadRefreshKey((key) => key + 1);
        onRefreshRef.current?.();
      }
    };
    subscribeToEvent('send-failed', handleSendFailed);
    subscribeToEvent('message:replied', handleReplied);
    return () => {
      unsubscribeFromEvent('send-failed', handleSendFailed);
      unsubscribeFromEvent('message:replied', handleReplied);
      releaseSocket();
    };
  }, [message.id]);

  // ── AI ghost state ─────────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  const [ghostOption, setGhostOption] = useState<GhostOption | null>(() =>
    toGhostOption(message.metadata?.suggestedAnswer as SuggestedAnswerMeta | undefined)
  );
  const [alternativeCount, setAlternativeCount] = useState(0);

  // Reset ghost when message changes
  useEffect(() => {
    setGhostOption(
      toGhostOption(message.metadata?.suggestedAnswer as SuggestedAnswerMeta | undefined)
    );
  }, [message.id, message.metadata]);

  // ── Similar messages dialog ────────────────────────────────────────────────
  const [similarOpen, setSimilarOpen] = useState(false);

  // ── Panel tab state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<PanelTab>('ai');
  const [panelOpen, setPanelOpen] = useState(false);
  const [highlightAttachmentId, setHighlightAttachmentId] = useState<number | null>(null);

  // Reset panel when message changes
  useEffect(() => {
    setPanelOpen(false);
    setTab('ai');
    setHighlightAttachmentId(null);
  }, [message.id]);

  // ── Notes / activity / attachments / lead state ────────────────────────────
  const user = useAuthStore((store) => store.user);
  const currentUserId = user?.id ?? null;

  const [notes, setNotes] = useState<MessageNote[]>([]);
  const [messageActivity, setMessageActivity] = useState<MessageActivityEntry[]>([]);
  const [noteActivityLog, setNoteActivityLog] = useState<
    { label: string; who: string; time: string }[]
  >([]);
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState<Map<number, Attachment[]>>(
    new Map()
  );
  const [leadState, setLeadState] = useState<LeadState | null>(null);
  const [leadFieldDefs, setLeadFieldDefs] = useState<LeadQualificationFieldConfig[]>([]);

  // Fetch notes + activity alongside thread refreshes
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      messageService.getNotes(message.id).catch(() => null),
      messageService.getActivity(message.id).catch(() => [] as MessageActivityEntry[]),
    ])
      .then(([notesRes, activity]) => {
        if (cancelled) return;
        if (notesRes && notesRes.success && notesRes.data) setNotes(notesRes.data);
        setMessageActivity(activity);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey]);

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
        setAttachmentsByMessageId(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey]);

  // Lead config — fetched once
  useEffect(() => {
    organizationService
      .getLeadConfig()
      .then((cfg) => {
        if (cfg.qualificationFields?.length) setLeadFieldDefs(cfg.qualificationFields);
      })
      .catch(() => {});
  }, []);

  // Lead state — derived from this message + thread
  useEffect(() => {
    if (!message.isLead) {
      setLeadState(null);
      return;
    }
    const ownState = message.metadata?.leadState as LeadState | undefined;
    if (ownState) setLeadState(ownState);
    messageService
      .getThreadMessages(message.id)
      .then((res) => {
        const sorted = [...(res.data ?? [])].sort((itemA, itemB) => itemB.id - itemA.id);
        for (const msg of sorted) {
          const stat = (msg.metadata as { leadState?: LeadState } | null)?.leadState;
          if (stat) {
            setLeadState(stat);
            return;
          }
        }
        const fb = message.metadata?.leadState as LeadState | undefined;
        setLeadState(fb ?? null);
      })
      .catch(() => {
        const fb = message.metadata?.leadState as LeadState | undefined;
        setLeadState(fb ?? null);
      });
  }, [message.id, message.isLead, message.metadata]);

  // ── Computed flags ─────────────────────────────────────────────────────────
  const spamCheck = getSpamCheck(message);
  void spamCheck;

  const isFiltered = message.status === 'filtered';
  const isSuspicious =
    !isFiltered &&
    (message.metadata?.spamCheck as Record<string, unknown> | undefined)?.category === 'suspicious';
  const isActive = !isFiltered && !isSuspicious && message.status !== 'closed';
  const ghostVisible = message.status !== 'resolved';

  const autoReply = message.metadata?.autoReply as { sent?: boolean } | undefined;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!composer || composer === '<p></p>') return;
    setSubmitting(true);
    setSendFailedError(null);
    try {
      if (composerMode === 'note') {
        await messageService.addNote(message.id, composer);
      } else if (selectedFiles.length > 0) {
        await messageService.replyWithAttachments(message.id, composer, selectedFiles, false);
      } else {
        await messageService.reply(message.id, composer, false);
      }
      setComposer('');
      setSelectedFiles([]);
      setThreadRefreshKey((key) => key + 1);
      onRefresh?.();
    } catch (err) {
      logger.error('Failed to send:', err);
      setSendFailedError('Failed to send. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [composer, composerMode, message.id, onRefresh, selectedFiles]);

  const handleResolveWithoutReply = useCallback(async () => {
    setResolving(true);
    try {
      await messageService.resolve(message.id);
      onResolve?.();
    } catch (err) {
      logger.error('Failed to resolve:', err);
    } finally {
      setResolving(false);
    }
  }, [message.id, onResolve]);

  const handleClose = useCallback(async () => {
    setResolving(true);
    try {
      await messageService.close(message.id);
      onResolve?.();
    } catch (err) {
      logger.error('Failed to close:', err);
    } finally {
      setResolving(false);
    }
  }, [message.id, onResolve]);

  const handleGhostClick = useCallback(
    (answer: string, _source: string, _attachments?: KBAttachment[]) => {
      setComposer(
        DOMPurify.sanitize(answer, {
          ALLOWED_TAGS: [
            'p',
            'br',
            'b',
            'i',
            'u',
            'strong',
            'em',
            'a',
            'ul',
            'ol',
            'li',
            'blockquote',
            'pre',
            'code',
          ],
          ALLOWED_ATTR: ['href', 'target', 'rel'],
          ALLOWED_URI_REGEXP: /^https?:/i,
        })
      );
      setComposerMode('reply');
      // Expand the (initially collapsed) reply editor + focus it so the agent
      // sees the populated suggested answer immediately, instead of having to
      // click the editor's expand button first. Deferred so it fires AFTER
      // React mounts the reply editor — if the user was in 'note' mode, the
      // reply ref is null until the conditional render swap settles.
      setTimeout(() => richEditorRef.current?.focus(), 0);
    },
    []
  );

  const handleReject = useCallback(async () => {
    try {
      await messageService.markAsProcessed(message.id);
      onReject?.();
    } catch (err) {
      logger.error('Failed to mark as processed:', err);
    }
  }, [message.id, onReject]);

  const handleReopen = useCallback(async () => {
    try {
      await messageService.reopen(message.id);
      onReopen?.();
    } catch (err) {
      logger.error('Failed to reopen:', err);
      // Surface the server reason (e.g. a 409 from a non-reopenable state) instead of
      // failing silently — formatError pulls the BE `error` string out of the response.
      toast.failure('reopen message', err);
    }
  }, [message.id, onReopen]);

  const handleClassify = useCallback(
    async (action: 'approve' | 'mark_suspicious' | 'move_to_spam') => {
      if (onClassify) await onClassify(action);
    },
    [onClassify]
  );

  const handleDelete = useCallback(() => {
    similarResultsCache.delete(message.id);
    onDelete?.();
  }, [message.id, onDelete]);

  const handleRefresh = useCallback(() => {
    setThreadRefreshKey((key) => key + 1);
    onRefresh?.();
  }, [onRefresh]);

  const handleNoteUpdated = useCallback(
    (noteId: number, content: string) => {
      setNotes((prev) => prev.map((note) => (note.id === noteId ? { ...note, content } : note)));
      setNoteActivityLog((prev) => [
        ...prev,
        {
          label: 'Note edited',
          who: user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'Agent',
          time: new Date().toISOString(),
        },
      ]);
    },
    [user]
  );

  const handleNoteDeleted = useCallback(
    (noteId: number) => {
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      setNoteActivityLog((prev) => [
        ...prev,
        {
          label: 'Note deleted',
          who: user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'Agent',
          time: new Date().toISOString(),
        },
      ]);
    },
    [user]
  );

  const handleCheckContradiction = useCallback(async () => {
    await messageService.checkContradiction(message.id);
    setThreadRefreshKey((key) => key + 1);
    onRefresh?.();
  }, [message.id, onRefresh]);

  // ── History banner ─────────────────────────────────────────────────────────
  const showHistoryBanner = sortedThread.length > 0 && sortedThread[0].type !== 'inbound';

  const flatAttachments = useMemo(
    () => Array.from(attachmentsByMessageId.values()).flat(),
    [attachmentsByMessageId]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <MessageDetailHeader
        message={message}
        onClose={onClose}
        showFullPageButton={!!onClose}
        isFullPage={!onClose}
        threadCount={sortedThread.length}
        onRefresh={handleRefresh}
        onDelete={handleDelete}
        onClassify={onClassify}
      />

      {/* History banner */}
      {showHistoryBanner && (
        <div className="flex-shrink-0 px-4 py-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
          This thread starts with an outbound message — older history may be missing.
        </div>
      )}

      {/* Tabbed panel: Thread tab closes the panel; other tabs show their content above the thread */}
      <MessagePanelTabs
        message={message}
        tab={tab}
        setTab={setTab}
        panelOpen={panelOpen}
        setPanelOpen={setPanelOpen}
        notes={notes}
        onNoteUpdated={handleNoteUpdated}
        onNoteDeleted={handleNoteDeleted}
        noteActivityLog={noteActivityLog}
        messageActivity={messageActivity}
        sortedThread={sortedThread}
        threadRefreshKey={threadRefreshKey}
        highlightAttachmentId={highlightAttachmentId}
        attachments={flatAttachments}
        currentUserId={currentUserId}
        leadState={leadState}
        setLeadState={setLeadState}
        leadFieldDefs={leadFieldDefs}
        onGhostClick={handleGhostClick}
        onOptionsLoaded={(total: number) => setAlternativeCount(total)}
        onAutoSuggest={(
          answer: string,
          label: string,
          type: 'lead' | 'documentation' | 'similar'
        ) => setGhostOption({ answer, label, type })}
        onAiLoadingChange={(loading: boolean) => setAiLoading(loading)}
        setComposerMode={setComposerMode}
        noteEditorRef={noteEditorRef}
        onCheckContradiction={handleCheckContradiction}
      />

      {/* Thread view — visible when no panel tab is open */}
      <div className={`flex-1 min-h-0 overflow-y-auto ${panelOpen ? 'hidden' : ''}`}>
        <div className="px-4 py-3 space-y-3">
          {threadLoading && sortedThread.length === 0 && (
            <div className="py-8 text-sm text-center text-muted-foreground">
              <div className="mx-auto mb-2 w-5 h-5 rounded-full border-2 animate-spin border-primary border-t-transparent" />
              Loading thread…
            </div>
          )}
          {threadError && (
            <div className="py-4 text-sm text-center text-destructive">
              {threadError}
              <button
                type="button"
                onClick={() => setThreadRefreshKey((key) => key + 1)}
                className="block mx-auto mt-1 text-xs underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}
          {!threadLoading && !threadError && sortedThread.length === 0 && (
            <div className="py-6 text-[12px] text-center text-muted-foreground">
              No messages in thread yet.
            </div>
          )}
          {sortedThread.map((msg) => (
            <ThreadMessageItem
              key={msg.id}
              msg={msg}
              attachments={attachmentsByMessageId.get(msg.id) ?? []}
              onOpenAttachment={(id) => {
                setTab('attachments');
                setPanelOpen(true);
                setHighlightAttachmentId(id);
              }}
            />
          ))}

          {/* Ghost bubble */}
          <MessageGhostBubble
            aiLoading={aiLoading}
            ghostVisible={ghostVisible}
            ghostOption={ghostOption}
            autoReply={autoReply}
            composer={composer}
            composerMode={composerMode}
            resolved={message.status === 'resolved'}
            alternativeCount={alternativeCount}
            onGhostClick={handleGhostClick}
            onShowAlternatives={() => {
              setTab('kb');
              setPanelOpen(true);
            }}
          />
        </div>
      </div>

      {/* Send failure alert — shown when BE confirms delivery failed */}
      {sendFailedError && (
        <div className="mx-4 p-3 text-sm rounded-md text-destructive bg-destructive/10 flex justify-between items-start gap-2">
          <span>{sendFailedError}</span>
          <button
            type="button"
            onClick={() => setSendFailedError(null)}
            className="shrink-0 text-destructive/70 hover:text-destructive"
          >
            ✕
          </button>
        </div>
      )}

      {/* Composer — shown for active conversations */}
      {isActive && (
        <MessageComposer
          message={message}
          composer={composer}
          setComposer={setComposer}
          composerMode={composerMode}
          setComposerMode={setComposerMode}
          submitting={submitting}
          onSend={() => void handleSend()}
          richEditorRef={richEditorRef}
          noteEditorRef={noteEditorRef}
          onOpenSimilarMessages={() => setSimilarOpen(true)}
          selectedFiles={selectedFiles}
          onFilesChange={setSelectedFiles}
        />
      )}

      {/* Action strip */}
      <MessageActionStrip
        message={message}
        isFiltered={isFiltered}
        isSuspicious={isSuspicious}
        isActive={isActive}
        resolving={resolving}
        hasLinkedTicket={false}
        onApprove={onApprove}
        onReopen={handleReopen}
        onDelete={handleDelete}
        onClassify={handleClassify}
        onResolveWithoutReply={handleResolveWithoutReply}
        onClose={handleClose}
        setRejectDialogOpen={setRejectDialogOpen}
        setReopenDialogOpen={setReopenDialogOpen}
        onRefresh={handleRefresh}
      />
      {/* Confirm dialogs */}
      <MessageDetailConfirmDialogs
        message={message}
        rejectDialogOpen={rejectDialogOpen}
        setRejectDialogOpen={setRejectDialogOpen}
        reopenDialogOpen={reopenDialogOpen}
        setReopenDialogOpen={setReopenDialogOpen}
        onReject={handleReject}
        onReopen={handleReopen}
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
    </div>
  );
}
