import { useState, useCallback, useEffect } from 'react';
import {
  StickyNote,
  Pencil,
  Trash2,
} from 'lucide-react';
import { LeadQualificationPanel } from '@/components/tickets/LeadQualificationPanel';
import { ContradictionAlert } from './ContradictionAlert';
import { MessageAttachments, type Attachment } from './MessageAttachments';
import { MessageKBReferences } from './MessageKBReferences';
import { AiTabPanel, type KBAttachment } from './AiTabPanel';
import { messageService, type MessageNote, type MessageActivityEntry } from '@/services/message.service';
import { contactService, type ContactProfile } from '@/services/contact.service';
import { ContactNotesPanel } from '@/components/contacts/ContactNotesPanel';
import type { LeadQualificationFieldConfig } from '@/services/organization.service';
import { formatDate } from '@/lib/utils';

import type { Message, MessageEvent } from '@/types';
import type { ContradictionCheckMetadata } from '@/types/ai';
import { logger } from '@/lib/logger';
import RichTextEditor from '@/components/shared/RichTextEditor';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import DOMPurify from 'dompurify';
import { MONO, relativeTime, getInitials } from './messageDetailConstants';

type LeadState = Parameters<typeof LeadQualificationPanel>[0]['leadState'];

// ─── Activity helpers ─────────────────────────────────────────────────────────

type TimelineItem = { label: string; time: string; who: string; dot: string | undefined };

const ACTION_LABEL: Record<string, string> = {
  'message.reply': 'Reply sent',
  'message.assign': 'Assigned',
  'ticket.create': 'Ticket created',
  'ticket.resolve': 'Resolved',
  'ticket.reopen': 'Reopened',
};

const ACTION_DOT: Record<string, string> = {
  'ticket.resolve': 'bg-green-500/60',
  'ticket.reopen': 'bg-yellow-500/60',
};

function auditEntryLabel(action: string, details: Record<string, unknown> | null): string {
  if (action === 'message.status_change') {
    const from = details?.['from'] as string | undefined;
    const to = details?.['to'] as string | undefined;
    return to ? `Status changed${from ? ` from ${from}` : ''} to ${to}` : 'Status changed';
  }
  if (action === 'message.priority_change') {
    const to = details?.['to'] as string | undefined;
    return to ? `Priority set to ${to}` : 'Priority changed';
  }
  if (action === 'message.category_change') {
    return details?.['to'] ? 'Category assigned' : 'Category removed';
  }
  if (action === 'message.update') {
    const detail = typeof details?.['action'] === 'string' ? details['action'] : '';
    if (detail === 'mark_processed') return 'Marked as processed';
    if (detail === 'mark_suspicious') return 'Marked as suspicious';
    if (detail === 'move_to_spam') return 'Moved to spam';
    if (detail === 'mark_unprocessed') return 'Marked as unprocessed';
    if (detail === 'approve') return 'Approved';
    return 'Message updated';
  }
  return ACTION_LABEL[action] ?? action;
}

function buildTimeline(
  activity: MessageActivityEntry[],
  notes: MessageNote[],
  inSession: { label: string; who: string; time: string }[]
): TimelineItem[] {
  const fromAudit: TimelineItem[] = activity.map((entry) => ({
    label: auditEntryLabel(entry.action, entry.details),
    time: entry.createdAt,
    who: entry.userEmail ?? 'System',
    dot: ACTION_DOT[entry.action],
  }));

  const fromNotes: TimelineItem[] = notes.map((note) => ({
    label: 'Internal note',
    time: note.createdAt,
    who: note.user ? `${note.user.firstName} ${note.user.lastName ?? ''}`.trim() : note.authorName,
    dot: 'bg-amber-400/70',
  }));

  const ephemeral: TimelineItem[] = inSession.map((entry) => ({ ...entry, dot: undefined }));

  return [...fromAudit, ...fromNotes, ...ephemeral].sort(
    (itemA, itemB) => new Date(itemA.time).getTime() - new Date(itemB.time).getTime()
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessagePanelTabsProps = {
  message: Message;
  tab: 'ai' | 'customer' | 'attachments' | 'kb' | 'activity' | 'notes' | 'lead' | 'contradiction';
  setTab: (
    t: 'ai' | 'customer' | 'attachments' | 'kb' | 'activity' | 'notes' | 'lead' | 'contradiction'
  ) => void;
  panelOpen: boolean;
  setPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notes: MessageNote[];
  onNoteUpdated: (noteId: number, content: string) => void;
  onNoteDeleted: (noteId: number) => void;
  noteActivityLog: { label: string; who: string; time: string }[];
  messageActivity: MessageActivityEntry[];
  sortedThread: MessageEvent[];
  threadRefreshKey: number;
  highlightAttachmentId?: number | null;
  attachments?: Attachment[];
  currentUserId: number | null;
  leadState: LeadState | null;
  setLeadState: React.Dispatch<React.SetStateAction<LeadState | null>>;
  leadFieldDefs: LeadQualificationFieldConfig[];
  onGhostClick: (answer: string, source: string, attachments?: KBAttachment[]) => void;
  onOptionSelect?: (answer: string, label: string, type: 'lead' | 'documentation' | 'similar') => void;
  onOptionsLoaded?: (total: number) => void;
  onAutoSuggest?: (answer: string, label: string, type: 'lead' | 'documentation' | 'similar') => void;
  onAiLoadingChange?: (loading: boolean) => void;
  setComposerMode: React.Dispatch<React.SetStateAction<'reply' | 'note'>>;
  noteEditorRef: React.RefObject<RichTextEditorHandle>;
  onCheckContradiction?: () => Promise<void>;
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
  messageActivity,
  sortedThread,
  threadRefreshKey,
  highlightAttachmentId,
  attachments,
  currentUserId,
  leadState,
  setLeadState,
  leadFieldDefs,
  onGhostClick,
  onOptionSelect,
  onOptionsLoaded,
  onAutoSuggest,
  onAiLoadingChange,
  setComposerMode,
  noteEditorRef,
  onCheckContradiction,
}: MessagePanelTabsProps) {
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [checkingContradiction, setCheckingContradiction] = useState(false);
  const [kbResultCount, setKbResultCount] = useState<number | null>(null);

  // Contact-level notes shown in the CUSTOMER tab. These are the contact's notes
  // (contact_notes, keyed by the requester), NOT the per-conversation NOTES tab
  // (comments). Reuses the same ContactNotesPanel as the standalone Contact
  // profile. Resolved by the requester's email; sender may be "Name <email>".
  const [contact, setContact] = useState<ContactProfile | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactNoteInput, setContactNoteInput] = useState('');
  const [addingContactNote, setAddingContactNote] = useState(false);
  const contactEmail = message.sender?.match(/<(.+?)>/)?.[1] ?? message.sender ?? '';

  useEffect(() => {
    if (tab !== 'customer' || !contactEmail.includes('@')) return;
    let cancelled = false;
    setContactLoading(true);
    contactService
      .getByEmail(contactEmail)
      .then((loaded) => {
        if (!cancelled) setContact(loaded);
      })
      .catch(() => {
        if (!cancelled) setContact(null);
      })
      .finally(() => {
        if (!cancelled) setContactLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, contactEmail]);

  const handleAddContactNote = useCallback(async () => {
    if (!contact || !contactNoteInput.trim()) return;
    setAddingContactNote(true);
    try {
      const note = await contactService.addNote(contact.id, contactNoteInput.trim());
      setContact((prev) => (prev ? { ...prev, notes: [note, ...prev.notes] } : prev));
      setContactNoteInput('');
    } catch (err) {
      logger.error('Failed to add contact note:', err);
    } finally {
      setAddingContactNote(false);
    }
  }, [contact, contactNoteInput]);

  const handleDeleteContactNote = useCallback(
    async (noteId: number) => {
      if (!contact) return;
      try {
        await contactService.deleteNote(contact.id, noteId);
        setContact((prev) =>
          prev ? { ...prev, notes: prev.notes.filter((note) => note.id !== noteId) } : prev
        );
      } catch (err) {
        logger.error('Failed to delete contact note:', err);
      }
    },
    [contact]
  );

  const handleCheckContradiction = useCallback(async () => {
    if (!onCheckContradiction) return;
    setCheckingContradiction(true);
    try {
      await onCheckContradiction();
    } finally {
      setCheckingContradiction(false);
    }
  }, [onCheckContradiction]);

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
    <div className={`flex flex-col border-b border-border ${panelOpen ? 'flex-1 min-h-0' : 'flex-shrink-0'}`}>
      {/* Tab bar */}
      <div className="flex w-full border-b border-border">
        {/* Thread tab — active when panel is closed */}
        <button
          onClick={() => { setPanelOpen(false); setComposerMode('reply'); }}
          className={`flex flex-1 justify-center items-center px-2 h-[33px] ${MONO} border-b-2 transition-colors ${
            !panelOpen
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Thread
        </button>

        {(
          [
            { id: 'ai', label: 'AI', badge: 0 },
            { id: 'customer', label: 'Customer', badge: 0 },
            { id: 'attachments', label: 'Files', badge: 0 },
            { id: 'kb', label: 'KB', badge: 0 },
            { id: 'activity', label: 'Activity', badge: 0 },
            { id: 'notes', label: 'Notes', badge: notes.length },
            { id: 'contradiction', label: 'Conflict', badge: 0 },
            ...(message.isLead ? [{ id: 'lead', label: 'Lead', badge: 0 }] : []),
          ] as { id: typeof tab; label: string; badge: number }[]
        ).map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => {
              if (panelOpen && tab === id) {
                setPanelOpen(false);
                setComposerMode('reply');
              } else {
                setTab(id);
                setPanelOpen(true);
                setComposerMode(id === 'notes' ? 'note' : 'reply');
              }
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
      </div>

      {/* Tab content */}
      <div className={`${panelOpen ? 'flex-1 min-h-0 overflow-y-auto' : 'hidden'}`}>
        <div className="p-2 text-[12px] text-foreground">
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

              {/* Contact notes — the requester's contact-level notes (shared with
                  the Contact profile). Distinct from the conversation NOTES tab. */}
              <div className="pt-1">
                <div className="flex gap-2 items-center mb-2">
                  <span className={`${MONO} text-muted-foreground`}>NOTES</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {contactLoading ? (
                  <p className="text-[11px] text-muted-foreground">Loading…</p>
                ) : contact ? (
                  <ContactNotesPanel
                    notes={contact.notes}
                    noteInput={contactNoteInput}
                    setNoteInput={setContactNoteInput}
                    addingNote={addingContactNote}
                    onAddNote={handleAddContactNote}
                    onDeleteNote={handleDeleteContactNote}
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No contact record for this sender.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Attachments Tab */}
          {tab === 'attachments' && (
            <MessageAttachments message={message} sortedThread={sortedThread} refreshKey={threadRefreshKey} highlightId={highlightAttachmentId} preloadedAttachments={attachments} />
          )}

          {/* Contradiction Tab */}
          {tab === 'contradiction' && (() => {
            const crossCheck = message.metadata?.contradictionCheck as ContradictionCheckMetadata | undefined;
            const intraCheck = message.metadata?.intraMessageContradictionCheck as ContradictionCheckMetadata | undefined;
            const hasCrossContradiction = !!crossCheck?.result?.contradictingMessageId;
            const hasIntraContradiction = !!(intraCheck?.result?.hasContradiction);
            const checkWasRun = !!crossCheck || !!intraCheck;

            const confidencePill: Record<string, string> = {
              high: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
              medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
              low: 'bg-muted text-muted-foreground',
            };

            const CleanResult = ({ check }: { check: ContradictionCheckMetadata }) => (
              <div className="p-2 rounded border border-border bg-card space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                    No contradiction found
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${confidencePill[check.result.confidence] ?? confidencePill.low}`}>
                    {check.result.confidence} confidence
                  </span>
                </div>
                {check.claimToVerify && (
                  <div>
                    <p className={`${MONO} text-muted-foreground mb-0.5`}>CLAIM CHECKED</p>
                    <p className="text-[11px] italic text-foreground">"{check.claimToVerify}"</p>
                  </div>
                )}
                {check.result.explanation && (
                  <div>
                    <p className={`${MONO} text-muted-foreground mb-0.5`}>ANALYSIS</p>
                    <p className="text-[11px] text-muted-foreground">{check.result.explanation}</p>
                  </div>
                )}
                <p className="text-[9px] text-muted-foreground pt-1 border-t border-border">
                  {check.triggeredBy === 'auto_pattern' ? 'Auto' : 'Manual'} · {new Date(check.checkedAt).toLocaleString()}
                </p>
              </div>
            );

            if (hasIntraContradiction || hasCrossContradiction) {
              return (
                <div className="space-y-2">
                  {intraCheck && <ContradictionAlert contradictionCheck={intraCheck} />}
                  {crossCheck && hasCrossContradiction && <ContradictionAlert contradictionCheck={crossCheck} />}
                  {crossCheck && !hasCrossContradiction && !crossCheck.result.hasContradiction && <CleanResult check={crossCheck} />}
                </div>
              );
            }

            if (checkWasRun) {
              return (
                <div className="space-y-2">
                  {crossCheck && <CleanResult check={crossCheck} />}
                  {intraCheck && <CleanResult check={intraCheck} />}
                  {onCheckContradiction && (
                    <button
                      onClick={() => void handleCheckContradiction()}
                      disabled={checkingContradiction}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-border text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {checkingContradiction ? 'Checking…' : 'Re-check'}
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                <p className="text-[11px] text-muted-foreground">Not checked yet.</p>
                {onCheckContradiction && (
                  <button
                    onClick={() => void handleCheckContradiction()}
                    disabled={checkingContradiction}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {checkingContradiction ? 'Checking…' : 'Check contradiction'}
                  </button>
                )}
              </div>
            );
          })()}

          {/* KB Tab — always mounted so similar-results are fetched once and never re-generated */}
          <div className={tab === 'kb' ? 'space-y-2' : 'hidden'}>
            <AiTabPanel
              message={message}
              onGhostClick={onGhostClick}
              onOptionSelect={onOptionSelect}
              onOptionsLoaded={(total) => { setKbResultCount(total); onOptionsLoaded?.(total); }}
              onLoadingChange={onAiLoadingChange}
              onAutoSuggest={onAutoSuggest}
              section="suggested"
            />
            <MessageKBReferences messageId={message.id} />
            {kbResultCount === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                No suggestions found — use the KB button to search manually.
              </p>
            )}
          </div>

          {/* Activity Tab */}
          {tab === 'activity' && (
            <div className="space-y-0">
              {buildTimeline(messageActivity, notes, noteActivityLog).map((item) => (
                <div
                  key={`${item.time}-${item.label}-${item.who}`}
                  className="flex gap-2 items-start py-1 border-b border-border last:border-0"
                >
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${item.dot ?? 'bg-muted-foreground/30'}`} />
                  <span className="font-mono text-[10px] text-muted-foreground w-14 flex-shrink-0 [font-variant-numeric:tabular-nums]">
                    {relativeTime(item.time)}
                  </span>
                  <span className="flex-1 text-[11px]">
                    {item.who} · {item.label}
                  </span>
                </div>
              ))}
              {messageActivity.length === 0 && noteActivityLog.length === 0 && notes.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-4">No activity yet</p>
              )}
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
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content, { ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre'], ALLOWED_ATTR: [] }) }}
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
