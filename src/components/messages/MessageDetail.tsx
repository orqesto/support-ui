import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ContradictionAlert } from './ContradictionAlert';
import type { LeadQualificationPanel } from '@/components/tickets/LeadQualificationPanel';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { SimilarMessagesDialog } from '@/components/modals/SimilarMessagesDialog';
import { MessageDetailConfirmDialogs } from './MessageDetailConfirmDialogs';
import { ConvertBotConversationModal } from '@/components/modals/ConvertBotConversationModal';
import { useResolveMessageToKB } from '@/hooks/useResolveMessageToKB';
import { messageService, type MessageNote } from '@/services/message.service';
import { ticketService } from '@/services/ticket.service';
import {
  organizationService,
  type LeadQualificationFieldConfig,
} from '@/services/organization.service';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
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
  const user = useAuthStore((s) => s.user);

  // ── Zone state ───────────────────────────────────────────────────────────
  const [tab, setTab] = useState<
    'ai' | 'customer' | 'linked' | 'kb' | 'activity' | 'lead' | 'notes' | 'contradiction'
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
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadRefreshKey, setThreadRefreshKey] = useState(0);

  // ── Business state ───────────────────────────────────────────────────────
  const [replyFromSuggested, setReplyFromSuggested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { resolving, resolveMessage: resolveToKB } = useResolveMessageToKB();
  const [linkedTicketStatus, setLinkedTicketStatus] = useState<string | null>(null);
  const [leadState, setLeadState] = useState<LeadState | null>(null);
  const [leadFieldDefs, setLeadFieldDefs] = useState<LeadQualificationFieldConfig[]>([]);
  const [similarMessagesOpen, setSimilarMessagesOpen] = useState(false);
  const [convertBotOpen, setConvertBotOpen] = useState(false);
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
    setReplyFromSuggested(false);
    setSelectedFiles([]);
  }, [message.id]);

  // ── Fetch thread + notes ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setThreadLoading(true);
    Promise.all([messageService.getThreadMessages(message.id), messageService.getNotes(message.id)])
      .then(([threadRes, notesRes]) => {
        if (cancelled) return;
        if (threadRes.success && threadRes.data) setThreadMessages(threadRes.data);
        if (notesRes.success && notesRes.data) setNotes(notesRes.data);
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
        const sorted = [...(res.data ?? [])].sort((a, b) => b.id - a.id);
        for (const msg of sorted) {
          const s = msg.metadata?.leadState;
          if (s) {
            setLeadState(s as LeadState);
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

  // ── Linked ticket status ─────────────────────────────────────────────────
  useEffect(() => {
    if (!message.ticketId) {
      setLinkedTicketStatus(null);
      return;
    }
    ticketService
      .getById(message.ticketId)
      .then((r) => {
        if (r?.data) setLinkedTicketStatus(r.data.status);
      })
      .catch(() => {});
  }, [message.ticketId]);

  useEffect(() => {
    if (!message.ticketId) return;
    const handler = (data: unknown) => {
      const ev = data as { ticketId: number; status?: string };
      if (ev.ticketId === message.ticketId && ev.status) setLinkedTicketStatus(ev.status);
    };
    subscribeToEvent('ticket:updated', handler);
    return () => unsubscribeFromEvent('ticket:updated', handler);
  }, [message.ticketId]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement;
      if (
        el?.tagName === 'TEXTAREA' ||
        el?.tagName === 'INPUT' ||
        el?.tagName === 'SELECT' ||
        el?.isContentEditable
      )
        return;
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'r' || e.key === 'R') {
        setComposerMode('reply');
        setComposer('');
        setTimeout(() => richEditorRef.current?.focus(), 50);
      }
      if (e.key === 'n' || e.key === 'N') {
        setComposerMode('note');
        setComposer('');
        setTimeout(() => noteEditorRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleGhostClick = useCallback((answer: string) => {
    setComposer(answer);
    setComposerMode('reply');
    setReplyFromSuggested(true);
    setTimeout(() => richEditorRef.current?.focus(), 50);
  }, []);

  const handleSelectSimilarAnswer = useCallback((answer: string) => {
    setComposer(answer);
    setComposerMode('reply');
    setReplyFromSuggested(true);
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
              .map((l) => `<p>${l || '<br>'}</p>`)
              .join('')}`
          : '';
        await messageService.replyWithAttachments(
          message.id,
          composer + sig,
          selectedFiles,
          false,
          replyFromSuggested
        );
        setSelectedFiles([]);
        setReplyFromSuggested(false);
        setThreadRefreshKey((k) => k + 1);
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
    replyFromSuggested,
    user?.signature,
    onRefresh,
    submitting,
  ]);

  const handleNoteUpdated = useCallback(
    (noteId: number, content: string) => {
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, content } : n)));
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
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
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
    const msgTime = (m: Message) => {
      const outgoing =
        m.isOutgoing === true ||
        m.sender.toLowerCase() === 'bot' ||
        (m.metadata as { isSystemReply?: boolean } | null)?.isSystemReply === true;
      const t = outgoing
        ? (m.repliedAt ?? (m.metadata as { receivedAt?: string } | null)?.receivedAt ?? m.createdAt)
        : ((m.metadata as { receivedAt?: string } | null)?.receivedAt ?? m.createdAt);
      return new Date(t).getTime();
    };
    return [...threadMessages]
      .filter(
        (m) =>
          (m.metadata as { skippedReason?: string } | null)?.skippedReason !== 'sent_only_label'
      )
      .sort((a, b) => msgTime(a) - msgTime(b));
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

      {/* ════════ ZONE 2 — Thread + Composer ════════ */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3 min-h-0">
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

          {!threadLoading &&
            sortedThread.map((msg) => (
              <ThreadMessageItem
                key={msg.id}
                msg={msg}
                mainMessageId={message.id}
                onMessageNavigate={onMessageNavigate}
                onShowAttachments={() => {
                  setTab('customer');
                  setPanelOpen(true);
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
      </div>

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

      {/* ════════ ZONE 3 — Tabbed Panel ════════ */}
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
        sortedThread={sortedThread}
        threadRefreshKey={threadRefreshKey}
        currentUserId={currentUserId}
        leadState={leadState}
        setLeadState={setLeadState}
        leadFieldDefs={leadFieldDefs}
        linkedTicketStatus={linkedTicketStatus}
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
        onApprove={onApprove}
        setComposerMode={setComposerMode}
        noteEditorRef={noteEditorRef}
        setConvertBotOpen={setConvertBotOpen}
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

      {message.ticketId && (
        <ConvertBotConversationModal
          open={convertBotOpen}
          onOpenChange={setConvertBotOpen}
          ticketId={message.ticketId}
          onSuccess={(converted) => {
            setAlertDialog({
              open: true,
              title: 'Conversation Imported',
              description: `${converted} message${converted !== 1 ? 's' : ''} imported as ticket comments.`,
              variant: 'success',
            });
          }}
        />
      )}

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
