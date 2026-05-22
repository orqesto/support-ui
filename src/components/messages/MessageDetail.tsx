import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ContradictionAlert } from './ContradictionAlert';
import type { LeadQualificationPanel } from '@/components/tickets/LeadQualificationPanel';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { SimilarMessagesDialog } from '@/components/modals/SimilarMessagesDialog';
import { MessageDetailConfirmDialogs } from './MessageDetailConfirmDialogs';
import { useResolveMessageToKB } from '@/hooks/useResolveMessageToKB';
import { messageService, type MessageNote, type MessageActivityEntry } from '@/services/message.service';
import {
  organizationService,
  type LeadQualificationFieldConfig,
} from '@/services/organization.service';
import type { Message } from '@/types';
import type { ContradictionCheckMetadata } from '@/types/ai';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { ThreadMessageItem } from './ThreadMessageItem';
import { MessageGhostBubble } from './MessageGhostBubble';
import { InlineNoteBubble } from './InlineNoteBubble';
import { MessageDetailHeader } from './MessageDetailHeader';
import { MessageComposer } from './MessageComposer';
import { MessageActionStrip } from './MessageActionStrip';
import { MessagePanelTabs } from './MessagePanelTabs';
import { History } from 'lucide-react';
import type { Attachment } from './MessageAttachments';
import { apiClient } from '@/lib/api-client';
import {
  toGhostOption,
  type GhostOption,
  type SuggestedAnswerMeta,
} from './messageDetailConstants';

type LeadState = Parameters<typeof LeadQualificationPanel>[0]['leadState'];

// ─── Props ───────────────────────────────────────────────────────────────────

type MessageDetailProps = {
  message: Message;
  onClose?: () => void;
  showFullPageButton?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onReopen?: () => void;
  onDelete?: () => void;
  onResolve?: () => Promise<void>;
  onRefresh?: () => void;
  onMessageNavigate?: (messageId: number) => void;
  onClassify?: (action: 'approve' | 'mark_suspicious' | 'move_to_spam') => Promise<void>;
};

// ─── Component ───────────────────────────────────────────────────────────────

export const MessageDetail = ({
  message,
  onClose,
  showFullPageButton = true,
  onApprove,
  onReject,
  onReopen,
  onDelete,
  onResolve,
  onRefresh,
  onMessageNavigate,
  onClassify,
}: MessageDetailProps) => {
  const location = useLocation();
  const isFullPage = location.pathname.startsWith('/messages/');
  const user = useAuthStore((store) => store.user);

  // ── Zone state ───────────────────────────────────────────────────────────
  const [tab, setTab] = useState<
    'ai' | 'customer' | 'attachments' | 'kb' | 'activity' | 'lead' | 'notes' | 'contradiction'
  >('ai');
  const [panelOpen, setPanelOpen] = useState(false);
  const [composer, setComposer] = useState('');
  const [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply');
  const noteEditorRef = useRef<RichTextEditorHandle>(null);
  const richEditorRef = useRef<RichTextEditorHandle>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // ── Thread / notes state ─────────────────────────────────────────────────
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<MessageNote[]>([]);
  const [noteActivityLog, setNoteActivityLog] = useState<
    { label: string; who: string; time: string }[]
  >([]);
  const [messageActivity, setMessageActivity] = useState<MessageActivityEntry[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadRefreshKey, setThreadRefreshKey] = useState(0);
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState<Map<number, Attachment[]>>(new Map());

  // ── Business state ───────────────────────────────────────────────────────
  const [suggestedSource, setSuggestedSource] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { resolving, resolveMessage: resolveToKB } = useResolveMessageToKB();
  const [leadState, setLeadState] = useState<LeadState | null>(null);
  const [leadFieldDefs, setLeadFieldDefs] = useState<LeadQualificationFieldConfig[]>([]);
  const [highlightAttachmentId, setHighlightAttachmentId] = useState<number | null>(null);
  const [similarMessagesOpen, setSimilarMessagesOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant?: 'error' | 'success' | 'warning' | 'info';
    onClose?: () => void | Promise<void>;
  }>({ open: false, title: '', description: '' });

  // ── Reset on message change ──────────────────────────────────────────────
  useEffect(() => {
    setTab('ai');
    setComposer('');
    setComposerMode('reply');
    setSuggestedSource(null);
    setSelectedFiles([]);
    setNoteActivityLog([]);
  }, [message.id]);

  // ── Fetch thread + notes + activity ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setThreadLoading(true);
    Promise.all([
      messageService.getThreadMessages(message.id),
      messageService.getNotes(message.id),
      messageService.getActivity(message.id),
    ])
      .then(([threadRes, notesRes, activityData]) => {
        if (cancelled) return;
        if (threadRes.success && threadRes.data) setThreadMessages(threadRes.data);
        if (notesRes.success && notesRes.data) setNotes(notesRes.data);
        setMessageActivity(activityData);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data: Attachment[] }>(`/api/messages/${message.id}/attachments`)
      .then((res) => {
        if (cancelled) return;
        const map = new Map<number, Attachment[]>();
        for (const att of res.data.data ?? []) {
          if (att.messageId === null) continue;
          const list = map.get(att.messageId) ?? [];
          list.push(att);
          map.set(att.messageId, list);
        }
        setAttachmentsByMessageId(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [message.id, threadRefreshKey]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length, notes.length]);

  // ── Lead state ───────────────────────────────────────────────────────────
  useEffect(() => {
    organizationService
      .getLeadConfig()
      .then((cfg) => {
        if (cfg.qualificationFields?.length) setLeadFieldDefs(cfg.qualificationFields);
      })
      .catch(() => {});
  }, []);

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
          const stat = msg.metadata?.leadState;
          if (stat) {
            setLeadState(stat as LeadState);
            return;
          }
        }
        const fb = message.metadata?.leadState;
        setLeadState(fb ? (fb as LeadState) : null);
      })
      .catch(() => {
        const fb = message.metadata?.leadState;
        setLeadState(fb ? (fb as LeadState) : null);
      });
  }, [message.id, message.isLead, message.metadata]);


  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement;
      if (
        el?.tagName === 'TEXTAREA' ||
        el?.tagName === 'INPUT' ||
        el?.tagName === 'SELECT' ||
        el?.isContentEditable
      )
        return;
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'r' || event.key === 'R') {
        setComposerMode('reply');
        setComposer('');
        setTimeout(() => richEditorRef.current?.focus(), 50);
      }
      if (event.key === 'n' || event.key === 'N') {
        setComposerMode('note');
        setComposer('');
        setTimeout(() => noteEditorRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  type KBAttachmentRef = { id: number; filename: string; originalFilename: string; url: string; mimeType: string };

  const handleGhostClick = useCallback((answer: string, source: string, kbAttachments?: KBAttachmentRef[]) => {
    setComposer(answer);
    setComposerMode('reply');
    setSuggestedSource(source);
    setTimeout(() => richEditorRef.current?.focus(), 50);
    if (kbAttachments && kbAttachments.length > 0) {
      const fetchFile = (att: KBAttachmentRef): Promise<File> =>
        fetch(att.url)
          .then((res) => res.blob())
          .then((blob) => new File([blob], att.originalFilename ?? att.filename, { type: att.mimeType }));
      void Promise.all(kbAttachments.map(fetchFile))
        .then((files) => setSelectedFiles(files))
        .catch(() => {});
    }
  }, []);

  const handleSelectSimilarAnswer = useCallback((answer: string, source?: string) => {
    setComposer(answer);
    setComposerMode('reply');
    setSuggestedSource(source ?? 'message');
    setSimilarMessagesOpen(false);
    setTimeout(() => richEditorRef.current?.focus(), 50);
  }, []);

  const handleResolveWithoutReply = useCallback(async () => {
    const result = await resolveToKB(message.id, onResolve);
    if (result) {
      setAlertDialog({
        ...result.alertState,
        onClose: async () => {
          setAlertDialog({ open: false, title: '', description: '', variant: 'info' });
          await result.refresh();
        },
      });
    }
  }, [message.id, onResolve, resolveToKB]);

  const handleResolveSimple = useCallback(async () => {
    try {
      await messageService.resolve(message.id);
      onRefresh?.();
      await onResolve?.();
    } catch (err) {
      logger.error('Failed to resolve:', err);
    }
  }, [message.id, onRefresh, onResolve]);

  const handleCheckContradiction = useCallback(async () => {
    await messageService.checkContradiction(message.id);
    onRefresh?.();
  }, [message.id, onRefresh]);

  const handleSendComposer = useCallback(async () => {
    const isEmpty = !composer || composer === '<p></p>';
    if (isEmpty || submitting) return;
    setSubmitting(true);
    try {
      if (composerMode === 'note') {
        const res = await messageService.addNote(message.id, composer);
        if (res.success && res.data) setNotes((prev) => [...prev, res.data!]);
      } else {
        const sig = user?.signature
          ? `<p></p><p>--</p>${user.signature
              .split('\n')
              .map((line) => `<p>${line || '<br>'}</p>`)
              .join('')}`
          : '';
        await messageService.replyWithAttachments(
          message.id,
          composer + sig,
          selectedFiles,
          false,
          suggestedSource !== null,
          suggestedSource ?? undefined
        );
        setSelectedFiles([]);
        setSuggestedSource(null);
        setThreadRefreshKey((key) => key + 1);
        onRefresh?.();
      }
      setComposer('');
    } catch (err) {
      logger.error('Failed to send:', err);
    } finally {
      setSubmitting(false);
    }
  }, [
    composer,
    composerMode,
    message.id,
    selectedFiles,
    suggestedSource,
    user?.signature,
    onRefresh,
    submitting,
  ]);

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

  // ── Derived data ─────────────────────────────────────────────────────────

  const isFiltered = message.status === 'filtered';
  const isSuspicious =
    !isFiltered &&
    (message.metadata?.spamCheck as Record<string, unknown> | undefined)?.category === 'suspicious';
  const isActive = !message.resolved && !isFiltered && !isSuspicious && message.status !== 'closed';

  const suggestedAnswer = message.metadata?.suggestedAnswer as SuggestedAnswerMeta | undefined;
  const autoReply = message.metadata?.autoReply as { sent?: boolean } | undefined;

  const metadataGhost = useMemo(() => toGhostOption(suggestedAnswer), [suggestedAnswer]);
  const [selectedGhost, setSelectedGhost] = useState<GhostOption | null>(null);
  const [autoKbGhost, setAutoKbGhost] = useState<GhostOption | null>(null);
  const [alternativeCount, setAlternativeCount] = useState(0);
  const [aiLoading, setAiLoading] = useState(true);
  useEffect(() => {
    setSelectedGhost(null);
    setAutoKbGhost(null);
    setAlternativeCount(0);
    setAiLoading(true);
  }, [message.id]);
  // Priority: explicit user selection > metadata pre-computation > KB auto-suggestion
  const ghostOption = selectedGhost ?? metadataGhost ?? autoKbGhost;

  const sortedThread = useMemo(() => {
    const msgTime = (msg: Message) => {
      const outgoing =
        msg.isOutgoing === true ||
        msg.sender.toLowerCase() === 'bot' ||
        (msg.metadata as { isSystemReply?: boolean } | null)?.isSystemReply === true;
      const ts = outgoing
        ? (msg.repliedAt ?? (msg.metadata as { receivedAt?: string } | null)?.receivedAt ?? msg.createdAt)
        : ((msg.metadata as { receivedAt?: string } | null)?.receivedAt ?? msg.createdAt);
      return new Date(ts).getTime();
    };
    return [...threadMessages]
      .filter(
        (msg) =>
          (msg.metadata as { skippedReason?: string } | null)?.skippedReason !== 'sent_only_label'
      )
      .sort((itemA, itemB) => msgTime(itemA) - msgTime(itemB));
  }, [threadMessages]);

  const currentUserId = user?.id ?? null;

  const ghostVisible =
    !!ghostOption &&
    !autoReply?.sent &&
    (!composer || composer === '<p></p>') &&
    composerMode === 'reply' &&
    !message.resolved;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex overflow-hidden flex-col flex-1 min-h-0 bg-background">
      {/* ════════ ZONE 1 — Header ════════ */}
      <MessageDetailHeader
        message={message}
        onClose={onClose}
        showFullPageButton={showFullPageButton}
        isFullPage={isFullPage}
        threadCount={sortedThread.length}
        onRefresh={onRefresh}
        onDelete={onDelete}
        onClassify={onClassify}
      />

      {/* ════════ ZONE 2 — Tabbed Panel ════════ */}
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
        attachments={Array.from(attachmentsByMessageId.values()).flat()}
        currentUserId={currentUserId}
        leadState={leadState}
        setLeadState={setLeadState}
        leadFieldDefs={leadFieldDefs}
        onGhostClick={handleGhostClick}
        onOptionSelect={(
          answer: string,
          label: string,
          type: 'lead' | 'documentation' | 'similar'
        ) => setSelectedGhost({ answer, label, type })}
        onOptionsLoaded={(total: number) => setAlternativeCount(total)}
        onAutoSuggest={(answer: string, label: string, type: 'lead' | 'documentation' | 'similar') =>
          setAutoKbGhost({ answer, label, type })
        }
        onAiLoadingChange={(loading: boolean) => setAiLoading(loading)}
        setComposerMode={setComposerMode}
        noteEditorRef={noteEditorRef}
        onCheckContradiction={handleCheckContradiction}
      />

      {/* ════════ ZONE 3 — Thread + Composer ════════ */}
      <div className={`flex flex-col flex-1 min-h-0 ${panelOpen ? 'hidden' : ''}`}>
        <div className="overflow-y-auto flex-1 px-4 py-2 space-y-1.5 min-h-0">
          {!!message.metadata?.contradictionCheck && (
            <ContradictionAlert
              contradictionCheck={message.metadata.contradictionCheck as ContradictionCheckMetadata}
            />
          )}

          {threadLoading && (
            <div className="flex justify-center py-6">
              <div className="w-4 h-4 rounded-full border-2 animate-spin border-border border-t-foreground" />
            </div>
          )}

          {/* Banner when the earliest thread message is a team reply — the original
              client email was sent before this integration was connected or lived
              in a different Gmail thread due to missing In-Reply-To headers. */}
          {!threadLoading && sortedThread.length > 0 && sortedThread[0].isOutgoing === true && (
            <div className="flex gap-2 items-center px-3 py-2 mb-1 text-xs rounded-md border bg-muted/40 border-border text-muted-foreground">
              <History className="w-3.5 h-3.5 shrink-0" />
              Earlier conversation history is not available
            </div>
          )}

          {!threadLoading &&
            sortedThread.map((msg) => (
              <ThreadMessageItem
                key={msg.id}
                msg={msg}
                mainMessageId={message.id}
                onMessageNavigate={onMessageNavigate}
                attachments={attachmentsByMessageId.get(msg.id) ?? []}
                onOpenAttachment={(id) => {
                  setTab('attachments');
                  setPanelOpen(true);
                  setHighlightAttachmentId(id);
                }}
              />
            ))}

          {/* Inline note bubbles */}
          {!threadLoading &&
            notes.map((note) => (
              <InlineNoteBubble
                key={`note-${note.id}`}
                note={note}
                messageId={message.id}
                currentUserId={currentUserId}
                onUpdated={handleNoteUpdated}
                onDeleted={handleNoteDeleted}
              />
            ))}

          <MessageGhostBubble
            aiLoading={aiLoading}
            ghostVisible={ghostVisible}
            ghostOption={ghostOption}
            autoReply={autoReply}
            composer={composer}
            composerMode={composerMode}
            resolved={!!message.resolved}
            alternativeCount={alternativeCount}
            onGhostClick={handleGhostClick}
            onShowAlternatives={() => {
              setTab('kb');
              setPanelOpen(true);
            }}
          />

          <div ref={threadEndRef} />
        </div>

      </div>

      <MessageComposer
        message={message}
        composer={composer}
        setComposer={setComposer}
        composerMode={composerMode}
        setComposerMode={setComposerMode}
        submitting={submitting}
        onSend={() => void handleSendComposer()}
        richEditorRef={richEditorRef}
        noteEditorRef={noteEditorRef}
        onOpenSimilarMessages={() => setSimilarMessagesOpen(true)}
        selectedFiles={selectedFiles}
        onFilesChange={setSelectedFiles}
      />

      {/* ════════ Action Strip ════════ */}
      <MessageActionStrip
        message={message}
        isFiltered={isFiltered}
        isSuspicious={isSuspicious}
        isActive={isActive}
        resolving={resolving}
        onApprove={onApprove}
        onReopen={onReopen}
        onDelete={onDelete}
        onClassify={onClassify}
        onResolveWithoutReply={() => void handleResolveWithoutReply()}
        onResolveSimple={() => void handleResolveSimple()}
        setRejectDialogOpen={setRejectDialogOpen}
        setReopenDialogOpen={setReopenDialogOpen}
        onRefresh={onRefresh}
      />

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <MessageDetailConfirmDialogs
        message={message}
        rejectDialogOpen={rejectDialogOpen}
        setRejectDialogOpen={setRejectDialogOpen}
        reopenDialogOpen={reopenDialogOpen}
        setReopenDialogOpen={setReopenDialogOpen}
        onReject={onReject}
        onReopen={onReopen}
      />

      <SimilarMessagesDialog
        messageId={message.id}
        open={similarMessagesOpen}
        onClose={() => setSimilarMessagesOpen(false)}
        onSelectAnswer={handleSelectSimilarAnswer}
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => {
          if (!open && alertDialog.onClose) void alertDialog.onClose();
          else setAlertDialog({ ...alertDialog, open });
        }}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </div>
  );
};
