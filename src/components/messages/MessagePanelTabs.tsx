import { useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  StickyNote,
  Pencil,
  Trash2,
  Plus,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { LeadQualificationPanel } from '@/components/tickets/LeadQualificationPanel';
import { ContradictionAlert } from './ContradictionAlert';
import { MessageAttachments } from './MessageAttachments';
import { MessageKBReferences } from './MessageKBReferences';
import { AiTabPanel } from './AiTabPanel';
import { messageService, type MessageNote } from '@/services/message.service';
import type { LeadQualificationFieldConfig } from '@/services/organization.service';
import { formatDate } from '@/lib/utils';

import type { Message } from '@/types';
import type { ContradictionCheckMetadata } from '@/types/ai';
import { logger } from '@/lib/logger';
import RichTextEditor from '@/components/shared/RichTextEditor';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import DOMPurify from 'dompurify';
import { MONO, relativeTime, getInitials } from './messageDetailConstants';

type LeadState = Parameters<typeof LeadQualificationPanel>[0]['leadState'];

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessagePanelTabsProps = {
  message: Message;
  tab: 'ai' | 'customer' | 'linked' | 'kb' | 'activity' | 'notes' | 'lead' | 'contradiction';
  setTab: (
    t: 'ai' | 'customer' | 'linked' | 'kb' | 'activity' | 'notes' | 'lead' | 'contradiction'
  ) => void;
  panelOpen: boolean;
  setPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notes: MessageNote[];
  onNoteUpdated: (noteId: number, content: string) => void;
  onNoteDeleted: (noteId: number) => void;
  noteActivityLog: { label: string; who: string; time: string }[];
  sortedThread: Message[];
  threadRefreshKey: number;
  currentUserId: number | null;
  leadState: LeadState | null;
  setLeadState: React.Dispatch<React.SetStateAction<LeadState | null>>;
  leadFieldDefs: LeadQualificationFieldConfig[];
  linkedTicketStatus: string | null;
  onGhostClick: (answer: string) => void;
  onOptionSelect?: (answer: string, label: string, type: 'lead' | 'documentation' | 'similar') => void;
  onOptionsLoaded?: (total: number) => void;
  onAutoSuggest?: (answer: string, label: string, type: 'lead' | 'documentation' | 'similar') => void;
  onAiLoadingChange?: (loading: boolean) => void;
  onApprove?: () => void;
  setComposerMode: React.Dispatch<React.SetStateAction<'reply' | 'note'>>;
  noteEditorRef: React.RefObject<RichTextEditorHandle>;
  setConvertBotOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MessagePanelTabs({
  message,
  tab,
  setTab,
  panelOpen,
  setPanelOpen,
  notes,
  onNoteUpdated,
  onNoteDeleted,
  noteActivityLog,
  sortedThread,
  threadRefreshKey,
  currentUserId,
  leadState,
  setLeadState,
  leadFieldDefs,
  linkedTicketStatus,
  onGhostClick,
  onOptionSelect,
  onOptionsLoaded,
  onAutoSuggest,
  onAiLoadingChange,
  onApprove,
  setComposerMode,
  noteEditorRef,
  setConvertBotOpen,
}: MessagePanelTabsProps) {
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);

  const handleEditNote = useCallback(
    async (noteId: number) => {
      if (!editNoteContent || editNoteContent === '<p></p>') return;
      try {
        const res = await messageService.updateNote(message.id, noteId, editNoteContent);
        if (res.success) {
          onNoteUpdated(noteId, editNoteContent);
          setEditingNoteId(null);
          setEditNoteContent('');
        }
      } catch (err) {
        logger.error('Failed to update note:', err);
      }
    },
    [message.id, editNoteContent, onNoteUpdated]
  );

  const handleDeleteNote = useCallback(
    async (noteId: number) => {
      try {
        setDeletingNoteId(noteId);
        const res = await messageService.deleteNote(message.id, noteId);
        if (res.success) {
          onNoteDeleted(noteId);
        }
      } catch (err) {
        logger.error('Failed to delete note:', err);
      } finally {
        setDeletingNoteId(null);
      }
    },
    [message.id, onNoteDeleted]
  );

  const enrichment = message.metadata?.enrichment as
    | { detectedCategory?: string; routingAttributes?: { lang?: string } }
    | undefined;

  return (
    <div className="flex flex-col flex-shrink-0 border-t border-border">
      {/* Tab bar */}
      <div className="flex w-full border-b border-border">
        {(
          [
            { id: 'ai', label: 'AI', badge: 0 },
            { id: 'customer', label: 'Customer', badge: 0 },
            { id: 'linked', label: 'Linked', badge: message.ticketId ? 1 : 0 },
            { id: 'kb', label: 'KB', badge: 0 },
            { id: 'activity', label: 'Activity', badge: 0 },
            { id: 'notes', label: 'Notes', badge: notes.length },
            ...(message.metadata?.contradictionCheck ||
            message.metadata?.intraMessageContradictionCheck
              ? [{ id: 'contradiction', label: 'Conflict', badge: 0 }]
              : []),
            ...(message.isLead ? [{ id: 'lead', label: 'Lead', badge: 0 }] : []),
          ] as { id: typeof tab; label: string; badge: number }[]
        ).map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              if (!panelOpen) setPanelOpen(true);
            }}
            className={`flex flex-1 justify-center items-center gap-1 px-2 h-[33px] ${MONO} border-b-2 transition-colors ${
              tab === id && panelOpen
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {badge > 0 && (
              <span
                className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-semibold ${
                  tab === id && panelOpen
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-foreground/15 text-foreground/70'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => setPanelOpen((o) => !o)}
          className="flex flex-1 items-center justify-end gap-1 px-1 h-[33px] text-muted-foreground hover:text-foreground transition-colors group"
          title={panelOpen ? 'Collapse panel' : 'Expand panel'}
        >
          <span className="text-[9px] font-medium tracking-wide uppercase opacity-0 group-hover:opacity-60 transition-opacity select-none">
            {panelOpen ? 'collapse' : 'expand'}
          </span>
          {panelOpen ? (
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" />
          )}
        </button>
      </div>

      {/* Tab content */}
      <div
        className={`overflow-hidden transition-[height] duration-200 ease-in-out ${panelOpen ? 'h-[calc(30vh-33px)]' : 'h-0'}`}
      >
        <div className="h-full overflow-y-auto p-2 text-[12px] text-foreground">
          {/* AI Tab */}
          {tab === 'ai' && (
            <div className="space-y-2">
              <AiTabPanel
                message={message}
                onGhostClick={onGhostClick}
                section="analysis"
              />
            </div>
          )}

          {/* Customer Tab */}
          {tab === 'customer' && (
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                  {getInitials(message.sender)}
                </div>
                <div>
                  <p className="text-[11px] font-medium text-foreground">{message.sender}</p>
                  {message.channel !== 'email' && (
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {message.channel}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5">
                {(
                  [
                    { label: 'CHANNEL', value: message.channel.toUpperCase() },
                    {
                      label: 'RECEIVED',
                      value: formatDate(
                        (message.metadata as { receivedAt?: string })?.receivedAt ??
                          message.createdAt
                      ),
                    },
                    {
                      label: 'THREAD',
                      value:
                        sortedThread.length > 0 ? `${sortedThread.length} messages` : '1 message',
                    },
                    ...(message.assigneeName
                      ? [{ label: 'ASSIGNED', value: message.assigneeName }]
                      : []),
                    ...(message.priority ? [{ label: 'PRIORITY', value: message.priority }] : []),
                  ] as { label: string; value: string }[]
                ).map((row) => (
                  <div key={row.label} className="contents">
                    <span className={`self-center ${MONO} text-muted-foreground`}>{row.label}</span>
                    <span className="text-[11px] truncate self-center">{row.value}</span>
                  </div>
                ))}
              </div>

              <MessageAttachments message={message} sortedThread={sortedThread} refreshKey={threadRefreshKey} />
            </div>
          )}

          {/* Linked Tab */}
          {tab === 'linked' && (
            <div className="space-y-2">
              {message.ticketId ? (
                <>
                  <div
                    className={`p-2 rounded border-l-2 border border-border bg-card ${linkedTicketStatus === 'in_progress' ? 'border-l-emerald-500 dark:border-emerald-700 dark:bg-emerald-950/20' : 'border-l-blue-400 dark:border-blue-800 dark:bg-blue-950/20'}`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span
                        className={`${MONO} ${linkedTicketStatus === 'in_progress' ? 'text-emerald-700 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-400'}`}
                      >
                        TICKET #{message.ticketId}
                      </span>
                      {linkedTicketStatus && (
                        <span
                          className={`text-[10px] font-medium ${linkedTicketStatus === 'in_progress' ? 'text-emerald-700 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-400'}`}
                        >
                          {linkedTicketStatus
                            .replace('_', ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      )}
                    </div>
                    <Link
                      to={`/tickets?id=${message.ticketId}`}
                      className={`text-[11px] flex items-center gap-1 ${linkedTicketStatus === 'in_progress' ? 'text-emerald-700 dark:text-emerald-400 hover:text-emerald-900' : 'text-blue-700 dark:text-blue-400 hover:text-blue-900'}`}
                    >
                      <ExternalLink className="w-3 h-3" />
                      View Ticket
                    </Link>
                  </div>
                  {message.channel === 'chat' && (
                    <button
                      onClick={() => setConvertBotOpen(true)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-border text-[11px] text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Convert Bot Conversation
                    </button>
                  )}
                </>
              ) : (
                <div>
                  {message.processed ? (
                    <button
                      onClick={onApprove}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-3 rounded border-2 border-dashed border-border text-[11px] text-muted-foreground hover:border-foreground/30 hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      CREATE TICKET FROM MESSAGE
                    </button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground text-center py-4">
                      Process the message first to create a ticket.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Contradiction Tab */}
          {tab === 'contradiction' && (
            <div className="space-y-2">
              {!!message.metadata?.intraMessageContradictionCheck && (
                <ContradictionAlert
                  contradictionCheck={
                    message.metadata.intraMessageContradictionCheck as ContradictionCheckMetadata
                  }
                />
              )}
              {/* Only show cross-thread contradiction separately — intra-message is shown above */}
              {!!(message.metadata?.contradictionCheck as ContradictionCheckMetadata | undefined)
                ?.result?.contradictingMessageId && (
                <ContradictionAlert
                  contradictionCheck={
                    message?.metadata?.contradictionCheck as ContradictionCheckMetadata
                  }
                />
              )}
            </div>
          )}

          {/* KB Tab — always mounted so similar-results are fetched once and never re-generated */}
          <div className={tab === 'kb' ? 'space-y-2' : 'hidden'}>
            <AiTabPanel
              message={message}
              onGhostClick={onGhostClick}
              onOptionSelect={onOptionSelect}
              onOptionsLoaded={onOptionsLoaded}
              onLoadingChange={onAiLoadingChange}
              onAutoSuggest={onAutoSuggest}
              section="suggested"
            />
            <MessageKBReferences messageId={message.id} />
          </div>

          {/* Activity Tab */}
          {tab === 'activity' && (
            <div className="space-y-0">
              {(
                [
                  {
                    label: 'Message received',
                    time:
                      (message.metadata as { receivedAt?: string })?.receivedAt ??
                      message.createdAt,
                    who: message.sender,
                  },
                  ...(message.processed
                    ? [{ label: 'Marked as processed', time: message.createdAt, who: 'Agent' }]
                    : []),
                  ...(message.assignedAt
                    ? [
                        {
                          label: `Assigned to ${message.assigneeName ?? 'agent'}`,
                          time: message.assignedAt,
                          who: 'System',
                        },
                      ]
                    : []),
                  ...(message.repliedAt
                    ? [
                        {
                          label: 'Reply sent',
                          time: message.repliedAt,
                          who: message.assigneeName ?? 'Agent',
                        },
                      ]
                    : []),
                  ...(message.firstResponseAt
                    ? [{ label: 'First response', time: message.firstResponseAt, who: 'Agent' }]
                    : []),
                  ...(message.resolved
                    ? [
                        {
                          label: 'Resolved',
                          time: message.closedAt ?? message.createdAt,
                          who: 'Agent',
                        },
                      ]
                    : []),
                  ...noteActivityLog,
                ] as { label: string; time: string; who: string }[]
              )
                .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                .map((item) => (
                  <div
                    key={`${item.label}-${item.time}`}
                    className="flex gap-2 items-start py-1 border-b border-border last:border-0"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 mt-1.5 flex-shrink-0" />
                    <span className="font-mono text-[10px] text-muted-foreground w-14 flex-shrink-0 tabular-nums">
                      {relativeTime(item.time)}
                    </span>
                    <span className="flex-1 text-[11px]">
                      {item.who} · {item.label}
                    </span>
                  </div>
                ))}
              {notes.length > 0 &&
                notes.map((n) => (
                  <div
                    key={`act-note-${n.id}`}
                    className="flex gap-2 items-start py-1 border-b border-border last:border-0"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 dark:bg-amber-400 mt-1.5 flex-shrink-0" />
                    <span className="font-mono text-[10px] text-muted-foreground w-14 flex-shrink-0 tabular-nums">
                      {relativeTime(n.createdAt)}
                    </span>
                    <span className="flex-1 text-[11px]">
                      {n.user
                        ? `${n.user.firstName} ${n.user.lastName ?? ''}`.trim()
                        : n.authorName}{' '}
                      · Internal note
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Notes Tab */}
          {tab === 'notes' && (
            <div className="space-y-2">
              {notes.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-4">
                  No internal notes yet.
                </p>
              )}
              {notes.map((note) => {
                const isOwner = currentUserId !== null && currentUserId === note.userId;
                const isEditing = editingNoteId === note.id;
                const isDeleting = deletingNoteId === note.id;
                const who = note.user
                  ? `${note.user.firstName}${note.user.lastName ? ' ' + note.user.lastName : ''}`
                  : note.authorName;
                return (
                  <div
                    key={note.id}
                    className="p-1.5 bg-card rounded border-l-2 border-l-amber-400 border border-border dark:border-amber-800/50 dark:bg-amber-300/5"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-medium text-amber-800 dark:text-amber-300">
                        {who} · {relativeTime(note.createdAt)}
                      </span>
                      {isOwner && !isEditing && (
                        <div className="flex gap-1 items-center">
                          <button
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditNoteContent(note.content);
                            }}
                            className="text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => void handleDeleteNote(note.id)}
                            disabled={isDeleting}
                            className="text-amber-700 hover:text-red-600 dark:text-amber-400 dark:hover:text-red-400 disabled:opacity-40"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="space-y-1">
                        <div className="rounded border border-amber-300 dark:border-amber-700">
                          <RichTextEditor
                            content={editNoteContent}
                            onChange={setEditNoteContent}
                            placeholder="Edit note…"
                            minHeight="52px"
                            className="rounded-none border-0 shadow-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => void handleEditNote(note.id)}
                            className="text-[10px] text-muted-foreground hover:text-foreground dark:text-amber-600 dark:hover:text-amber-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingNoteId(null);
                              setEditNoteContent('');
                            }}
                            className="text-[10px] text-muted-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="text-[11px] leading-snug prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content) }}
                      />
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => {
                  setComposerMode('note');
                  setTimeout(() => noteEditorRef.current?.focus(), 50);
                }}
                className="mt-1 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-dashed border-amber-400 dark:border-amber-700 text-[11px] text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
              >
                <StickyNote className="w-3 h-3" />
                Add a note via the composer
              </button>
            </div>
          )}

          {/* Lead Tab */}
          {tab === 'lead' && message.isLead && (
            <div>
              {leadState ? (
                <LeadQualificationPanel
                  messageId={message.id}
                  leadState={leadState}
                  fieldDefs={leadFieldDefs}
                  enrichment={enrichment}
                  onLeadStateUpdate={setLeadState}
                />
              ) : (
                <div className="p-3 rounded border border-violet-500/20 bg-violet-500/5">
                  <p className="text-[11px] font-medium text-violet-700 dark:text-violet-400">
                    Lead Qualification
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    No qualification data yet. Collected as AI engages with this lead.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
