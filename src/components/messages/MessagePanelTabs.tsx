import { useState, useCallback, useEffect, useRef } from 'react';
import type { AddOutcome } from './useAiRecordNote';
import { StickyNote, Pencil, Trash2 } from 'lucide-react';
import { LeadQualificationPanel } from '@/components/tickets/LeadQualificationPanel';
import { Button } from '@/components/ui/Button';
import {
  ContradictionAlert,
  contradictionChecksToRender,
  contradictionFingerprint,
} from './ContradictionAlert';
import { MessageAttachments, type Attachment } from './MessageAttachments';
import { MessageKBReferences } from './MessageKBReferences';
import { AiTabPanel, type KBAttachment } from './AiTabPanel';
import { CustomerTabPanels, CustomerSenderBlock, ConversationFacts } from './CustomerTabPanels';
import {
  messageService,
  type MessageNote,
  type MessageActivityEntry,
} from '@/services/message.service';
import { buildTimeline, ACTIVITY_DOT } from './messageActivityTimeline';
import { ContactProfileDetails } from '@/components/contacts/ContactProfileDetails';
import { useContactProfile } from '@/components/contacts/useContactProfile';
import { ContactFactRows } from '@/components/contacts/ContactFactRows';
import type { LeadQualificationFieldConfig } from '@/services/organization.service';

import type { Message, MessageEvent } from '@/types';
import type { ContradictionCheckMetadata } from '@/types/ai';
import { logger } from '@/lib/logger';
import { contactLookupKey } from '@/lib/messageHelpers';
import RichTextEditor from '@/components/shared/RichTextEditor';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import DOMPurify from 'dompurify';
import { LABEL, relativeTime } from './messageDetailConstants';
import { hasLookupEmailIdentity } from './CustomApiLookupPanel';
import { useTabBadges } from './useTabBadges';
import { TabBadge } from './TabBadge';

type LeadState = Parameters<typeof LeadQualificationPanel>[0]['leadState'];

/**
 * One tab of the strip (v4 `.stabs button` / `.railtabs button`): sentence case, 12.5px / 500, the
 * body face — not the uppercase LABEL style. `flex-shrink-0 grow basis-auto` is `flex: 1 0 auto`:
 * share the spare width, never shrink below the label.
 */
const TAB_BASE =
  'flex-shrink-0 grow basis-auto min-w-[4.5rem] justify-center items-center gap-[5px] px-[9px] h-[37px] rounded-none hover:bg-transparent font-sans text-[12.5px] font-medium normal-case tracking-normal whitespace-nowrap border-b-2 transition-colors max-sm:h-11 max-sm:px-[11px] max-sm:text-[13.5px]';

/*
  v4 mobile (M4): the rail on a phone. The wrapper has no box (`contents`) so the strip's parent is
  the detail's whole column, and the strip can stick under the 52px header row for the length of
  the page. The panel below it stops being its own scroller — the document scrolls on a phone.
*/
const PHONE_RAIL = 'max-sm:contents';
const PHONE_STRIP =
  'max-sm:sticky max-sm:top-[calc(var(--md-sticky-top,0px)+52px)] max-sm:z-[5] max-sm:mt-3.5 max-sm:border-t';
const PHONE_PANEL = 'max-sm:flex-none max-sm:overflow-visible max-sm:overflow-x-clip';
/**
 * The Customer tab's contact controls: 40px touch targets and 16px inputs on a phone (M9).
 * Tick boxes and radios are left out: a 40px-tall 14px box only drops the tick below its label
 * (the label row is the touch target for those).
 */
const PHONE_CONTACT =
  'max-sm:[&_button]:min-h-10 max-sm:[&_button]:min-w-10 max-sm:[&_input:not([type=checkbox]):not([type=radio])]:min-h-10 max-sm:[&_select]:min-h-10';

/** v4's right-edge fade, applied only while the strip has more to scroll to. Alpha only. */
const STRIP_FADE =
  '[mask-image:linear-gradient(90deg,black_calc(100%_-_18px),transparent)] [-webkit-mask-image:linear-gradient(90deg,black_calc(100%_-_18px),transparent)]';

/**
 * Does the strip overflow AND still have content to the right? Measured, because v4 decides this
 * with a container query this Tailwind build has no plugin for. Re-measured on scroll and resize,
 * and when `contentKey` changes — the tabs' widths change when a tab or a badge appears.
 */
function useStripFade(contentKey: string) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripFades, setStripFades] = useState(false);
  const updateStripFade = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    setStripFades(strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1);
  }, []);
  useEffect(() => {
    updateStripFade();
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateStripFade);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [updateStripFade, contentKey]);
  return { stripRef, stripFades, updateStripFade };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessagePanelTabsProps = {
  message: Message;
  tab: 'ai' | 'customer' | 'attachments' | 'kb' | 'activity' | 'notes' | 'lead' | 'contradiction';
  setTab: (
    t: 'ai' | 'customer' | 'attachments' | 'kb' | 'activity' | 'notes' | 'lead' | 'contradiction'
  ) => void;
  panelOpen: boolean;
  /** 'sidebar' = full page's right column (v3): no Thread tab, wrapping tabs, always open. */
  variant?: 'rail' | 'sidebar';
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
  /** Absent where there is no composer to put an answer into (see AiTabPanel). */
  onGhostClick?: (answer: string, source: string, attachments?: KBAttachment[]) => void;
  /**
   * L2 P4: a custom-API record joins the agent's note for the AI draft. Returns false when the
   * note is full, so the control says so rather than the fact quietly not arriving.
   */
  onUseInReply?: (note: string) => AddOutcome;
  onOptionSelect?: (
    answer: string,
    label: string,
    type: 'lead' | 'documentation' | 'similar'
  ) => void;
  onOptionsLoaded?: (total: number) => void;
  onAiLoadingChange?: (loading: boolean) => void;
  setComposerMode: React.Dispatch<React.SetStateAction<'reply' | 'note'>>;
  noteEditorRef: React.RefObject<RichTextEditorHandle>;
  onCheckContradiction?: () => Promise<void>;
  /** Refetch the list/thread after a contact change that shows on cards (labels). */
  onRefresh?: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MessagePanelTabs({
  message,
  tab,
  setTab,
  panelOpen: panelOpenProp,
  variant = 'rail',
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
  onUseInReply,
  onOptionSelect,
  onOptionsLoaded,
  onAiLoadingChange,
  setComposerMode,
  noteEditorRef,
  onCheckContradiction,
  onRefresh,
}: MessagePanelTabsProps) {
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [checkingContradiction, setCheckingContradiction] = useState(false);
  // The KB/Customer badges, and the options callback handed to AiTabPanel (memoised in the hook
  // so its identity stays stable — see AiTabPanel's fetch effect).
  const { kbBadge, kbSuggested, customerCount, handleOptionsLoaded, onReferenced } = useTabBadges(
    message.id,
    onOptionsLoaded
  );
  const { stripRef, stripFades, updateStripFade } = useStripFade(
    `${message.isLead ? 1 : 0}|${kbBadge}|${customerCount}|${notes.length}|${attachments?.length ?? 0}`
  );

  // Full contact profile for the CUSTOMER tab — the same editable component
  // (assigned manager, labels, channel profiles, linked contacts, notes) used by
  // the standalone Contact drawer, via the shared hook. Resolved by the
  // requester's email; sender may be "Name <email>". Loaded lazily on tab open.
  // The same address the sender block shows (parseSender), so the two never disagree.
  const contactEmail = contactLookupKey(message.sender);
  // ⛔ D17: the profile loads for ANY resolvable sender, not only an email one. The old
  // `contactEmail.includes('@')` gate meant a Telegram or WhatsApp customer had NO contact profile
  // in the thread at all — a pre-existing bug, not a custom-API detail. Still keyed on the sender
  // we have; a customer with no email simply gets no identity-keyed lookup (D30), and the panel
  // says so rather than showing an empty result that reads like a failure.
  const contactEnabled = tab === 'customer' && contactEmail.length > 0;
  const hasEmailIdentity = hasLookupEmailIdentity(contactEmail);
  const contactProfile = useContactProfile(contactEmail, {
    enabled: contactEnabled,
    onChanged: onRefresh,
  });

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

  const sidebar = variant === 'sidebar';
  const panelOpen = sidebar || panelOpenProp;

  return (
    <div
      data-testid="panel-tabs-root"
      className={`flex flex-col ${sidebar ? '' : `border-b border-border ${PHONE_RAIL}`} ${panelOpen ? 'flex-1 min-h-0' : 'flex-shrink-0'}`}
    >
      {/* Tab bar — v4 `.stabs` / `.railtabs`: ONE sentence-case row in both variants (v4's
          single row, not v3's five-per-row wrap: the tabs keep one order and one place). Each tab is `flex: 1 0
          auto` — it shares the width when there is room and never shrinks below its label, so
          when the row does not fit it scrolls sideways instead of squeezing (nine tabs once
          squeezed to 27px on a 420px screen). The right edge fades while there is more to
          scroll to, so the cut-off tab reads as "more this way", not as a clipped label. */}
      <div
        ref={stripRef}
        // Read by the phone scroll (usePhoneDetailScroll): where the strip sticks.
        data-panel-strip={sidebar ? undefined : ''}
        onScroll={updateStripFade}
        className={`flex flex-nowrap w-full px-2 border-b border-border bg-card overflow-x-auto panel-tabs-scroll ${
          sidebar ? '' : PHONE_STRIP
        } ${stripFades ? STRIP_FADE : ''}`}
        data-fade={stripFades ? 'true' : 'false'}
      >
        {/* Thread tab — active when panel is closed. Not in the sidebar: the thread is beside it. */}
        <Button
          variant="ghost"
          onClick={() => {
            setPanelOpen(false);
            setComposerMode('reply');
          }}
          className={`${sidebar ? 'hidden' : 'flex'} ${TAB_BASE} ${
            !panelOpen
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Thread
        </Button>

        {(
          [
            { id: 'ai', label: 'AI', badge: 0 },
            { id: 'customer', label: 'Customer', badge: hasEmailIdentity ? customerCount : 0 },
            { id: 'kb', label: 'KB', badge: kbBadge },
            { id: 'attachments', label: 'Files', badge: attachments?.length ?? 0 },
            { id: 'activity', label: 'Activity', badge: 0 },
            { id: 'notes', label: 'Notes', badge: notes.length },
            { id: 'contradiction', label: 'Conflict', badge: 0 },
            ...(message.isLead ? [{ id: 'lead', label: 'Lead', badge: 0 }] : []),
          ] as { id: typeof tab; label: string; badge: number }[]
        ).map(({ id, label, badge }) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => {
              if (!sidebar && panelOpen && tab === id) {
                setPanelOpen(false);
                setComposerMode('reply');
              } else {
                setTab(id);
                setPanelOpen(true);
                // Sidebar tabs never switch the composer: they sit beside a draft, and flipping a
                // half-written internal note to Reply put it one ⌘↵ from the customer.
                if (!sidebar) setComposerMode(id === 'notes' ? 'note' : 'reply');
              }
            }}
            className={`flex ${TAB_BASE} ${
              tab === id && panelOpen
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            <TabBadge count={badge} active={tab === id && panelOpen} />
          </Button>
        ))}
      </div>

      {/* Tab content */}
      <div
        data-panel-content={sidebar ? undefined : ''}
        className={`${panelOpen ? `flex-1 min-h-0 overflow-y-auto bg-raised ${sidebar ? '' : PHONE_PANEL}` : 'hidden'}`}
      >
        <div className="px-3.5 py-3 text-[12.5px] text-foreground max-sm:px-4 max-sm:py-4">
          {/* AI Tab */}
          {tab === 'ai' && (
            <div className="space-y-2">
              <AiTabPanel message={message} onGhostClick={onGhostClick} section="analysis" />
            </div>
          )}

          {/* Customer Tab */}
          {tab === 'customer' && (
            <div className={`space-y-2 ${PHONE_CONTACT}`}>
              {/* v4: sender, conversation facts, connected systems, contact profile. The thread's
                  tickets and merges moved to the header's Related chip (MessageDetailHeader). */}
              <CustomerSenderBlock message={message} />
              <ConversationFacts message={message} sortedThread={sortedThread} />
              <CustomerTabPanels
                message={message}
                hasEmailIdentity={hasEmailIdentity}
                onUseInReply={onUseInReply}
              />

              {/* Full contact profile — assigned manager, labels, channel
                  profiles, linked contacts and contact-level notes (shared with
                  the standalone Contact drawer). Distinct from the conversation
                  NOTES tab. */}
              <div className="pt-1">
                <div className="flex gap-2 items-center mb-3">
                  <span className={`${LABEL} text-muted-foreground`}>CONTACT</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {contactProfile.contact && <ContactFactRows contact={contactProfile.contact} />}
                {contactProfile.loading ? (
                  <p className="text-[11px] text-muted-foreground">Loading…</p>
                ) : contactProfile.contact ? (
                  <ContactProfileDetails
                    contact={contactProfile.contact}
                    users={contactProfile.users}
                    availableLabels={contactProfile.availableLabels}
                    showLabelPicker={contactProfile.showLabelPicker}
                    setShowLabelPicker={contactProfile.setShowLabelPicker}
                    onAssign={contactProfile.handleAssign}
                    onAddLabel={contactProfile.handleAddLabel}
                    onRemoveLabel={contactProfile.handleRemoveLabel}
                    onCreateLabel={contactProfile.handleCreateLabel}
                    creatingLabel={contactProfile.creatingLabel}
                    noteInput={contactProfile.noteInput}
                    setNoteInput={contactProfile.setNoteInput}
                    addingNote={contactProfile.addingNote}
                    onAddNote={contactProfile.handleAddNote}
                    onDeleteNote={contactProfile.handleDeleteNote}
                    profileTypeInput={contactProfile.profileTypeInput}
                    setProfileTypeInput={contactProfile.setProfileTypeInput}
                    profileValueInput={contactProfile.profileValueInput}
                    setProfileValueInput={contactProfile.setProfileValueInput}
                    profileLabelInput={contactProfile.profileLabelInput}
                    setProfileLabelInput={contactProfile.setProfileLabelInput}
                    showProfileForm={contactProfile.showProfileForm}
                    setShowProfileForm={contactProfile.setShowProfileForm}
                    addingProfile={contactProfile.addingProfile}
                    onAddProfile={contactProfile.handleAddProfile}
                    onDeleteProfile={contactProfile.handleDeleteProfile}
                    linkEmailInput={contactProfile.linkEmailInput}
                    setLinkEmailInput={contactProfile.setLinkEmailInput}
                    linkingEmail={contactProfile.linkingEmail}
                    onLinkEmail={contactProfile.handleLinkEmail}
                    onUnlink={contactProfile.handleUnlink}
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
            <MessageAttachments
              message={message}
              sortedThread={sortedThread}
              refreshKey={threadRefreshKey}
              highlightId={highlightAttachmentId}
              preloadedAttachments={attachments}
            />
          )}

          {/* Contradiction Tab */}
          {tab === 'contradiction' &&
            (() => {
              const crossCheck = message.metadata?.contradictionCheck as
                | ContradictionCheckMetadata
                | undefined;
              const intraCheck = message.metadata?.intraMessageContradictionCheck as
                | ContradictionCheckMetadata
                | undefined;
              const hasCrossContradiction =
                !!crossCheck?.result?.hasContradiction ||
                !!crossCheck?.result?.contradictions?.length;
              const hasIntraContradiction =
                !!intraCheck?.result?.hasContradiction ||
                !!intraCheck?.result?.contradictions?.length;
              const checkWasRun = !!crossCheck || !!intraCheck;

              const confidencePill: Record<string, string> = {
                high: 'bg-success/10 text-success',
                medium: 'bg-warning/10 text-warning',
                low: 'bg-muted text-muted-foreground',
              };

              const CleanResult = ({ check }: { check: ContradictionCheckMetadata }) => (
                <div className="p-2 rounded border border-border bg-card space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-success">
                      No contradiction found
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${confidencePill[check.result.confidence] ?? confidencePill.low}`}
                    >
                      {check.result.confidence} confidence
                    </span>
                  </div>
                  {check.claimToVerify && (
                    <div>
                      <p className={`${LABEL} text-muted-foreground mb-0.5`}>CLAIM CHECKED</p>
                      <p className="text-[11px] italic text-foreground">"{check.claimToVerify}"</p>
                    </div>
                  )}
                  {check.result.explanation && (
                    <div>
                      <p className={`${LABEL} text-muted-foreground mb-0.5`}>ANALYSIS</p>
                      <p className="text-[11px] text-muted-foreground">
                        {check.result.explanation}
                      </p>
                    </div>
                  )}
                  <p className="text-[9px] text-muted-foreground pt-1 border-t border-border">
                    {check.triggeredBy === 'auto_pattern' ? 'Auto' : 'Manual'} ·{' '}
                    {new Date(check.checkedAt).toLocaleString()}
                  </p>
                </div>
              );

              if (hasIntraContradiction || hasCrossContradiction) {
                return (
                  <div className="space-y-2">
                    {/* The fingerprint is unique across the rendered set by construction — it is
                      what the list was deduplicated on. `checkedAt` alone would collide: the
                      thread and intra checks of a single run share a timestamp. */}
                    {contradictionChecksToRender(intraCheck, crossCheck).map((check) => (
                      <ContradictionAlert
                        key={contradictionFingerprint(check)}
                        contradictionCheck={check}
                      />
                    ))}
                    {crossCheck &&
                      !hasCrossContradiction &&
                      !crossCheck.result.hasContradiction && <CleanResult check={crossCheck} />}
                  </div>
                );
              }

              if (checkWasRun) {
                return (
                  <div className="space-y-2">
                    {crossCheck && <CleanResult check={crossCheck} />}
                    {intraCheck && <CleanResult check={intraCheck} />}
                    {onCheckContradiction && (
                      <Button
                        variant="ghost"
                        onClick={() => void handleCheckContradiction()}
                        disabled={checkingContradiction}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 h-auto rounded border border-border text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        {checkingContradiction ? 'Checking…' : 'Re-check'}
                      </Button>
                    )}
                  </div>
                );
              }

              return (
                <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                  <p className="text-[11px] text-muted-foreground">Not checked yet.</p>
                  {onCheckContradiction && (
                    <Button
                      variant="ghost"
                      onClick={() => void handleCheckContradiction()}
                      disabled={checkingContradiction}
                      className="flex items-center gap-1.5 px-3 py-1.5 h-auto rounded border border-border text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {checkingContradiction ? 'Checking…' : 'Check contradiction'}
                    </Button>
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
              onOptionsLoaded={handleOptionsLoaded}
              onLoadingChange={onAiLoadingChange}
              section="suggested"
            />
            <MessageKBReferences messageId={message.id} onCountChange={onReferenced} />
            {kbSuggested === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                No suggestions found — use the KB button to search manually.
              </p>
            )}
          </div>

          {/* Activity Tab */}
          {tab === 'activity' && (
            // v4 `.actlist`: a 7px dot coloured by what happened (ACTIVITY_DOT), when, then words.
            <ul className="flex flex-col text-[12.5px]" data-testid="activity-list">
              {buildTimeline(messageActivity, notes, noteActivityLog).map((item) => (
                <li
                  key={`${item.time}-${item.label}-${item.who}`}
                  data-kind={item.kind}
                  className="flex gap-2 items-start py-[7px] border-b border-hair last:border-0"
                >
                  <span
                    aria-hidden
                    className={`w-[7px] h-[7px] rounded-full mt-[5px] flex-shrink-0 ${ACTIVITY_DOT[item.kind]}`}
                  />
                  <span className="font-mono text-[11px] text-muted-foreground w-14 flex-shrink-0 [font-variant-numeric:tabular-nums]">
                    {relativeTime(item.time)}
                  </span>
                  <span className="flex-1 min-w-0">
                    {item.who} · {item.label}
                  </span>
                </li>
              ))}
              {messageActivity.length === 0 &&
                noteActivityLog.length === 0 &&
                notes.length === 0 && (
                  <li className="text-[11px] text-muted-foreground text-center py-4">
                    No activity yet
                  </li>
                )}
            </ul>
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
                    className="px-3 py-2.5 bg-card rounded-[9px] border border-border border-l-[3px] border-l-note-line"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-medium text-warning">
                        {who} · {relativeTime(note.createdAt)}
                      </span>
                      {isOwner && !isEditing && (
                        <div className="flex gap-1 items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit note"
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditNoteContent(note.content);
                            }}
                            className="p-0 w-auto h-auto text-note hover:text-note max-sm:min-w-10 max-sm:min-h-10"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete note"
                            onClick={() => void handleDeleteNote(note.id)}
                            disabled={isDeleting}
                            className="p-0 w-auto h-auto text-note hover:text-destructive disabled:opacity-40 max-sm:min-w-10 max-sm:min-h-10"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="space-y-1">
                        <div className="rounded border border-warning-line">
                          <RichTextEditor
                            content={editNoteContent}
                            onChange={setEditNoteContent}
                            placeholder="Edit note…"
                            minHeight="52px"
                            className="rounded-none border-0 shadow-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleEditNote(note.id)}
                            className="p-0 h-auto text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingNoteId(null);
                              setEditNoteContent('');
                            }}
                            className="p-0 h-auto text-[10px] text-muted-foreground"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="text-[11px] leading-snug prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(note.content, {
                            ALLOWED_TAGS: [
                              'p',
                              'br',
                              'b',
                              'i',
                              'u',
                              'strong',
                              'em',
                              'ul',
                              'ol',
                              'li',
                              'code',
                              'pre',
                            ],
                            ALLOWED_ATTR: [],
                          }),
                        }}
                      />
                    )}
                  </div>
                );
              })}
              <Button
                variant="ghost"
                onClick={() => {
                  setComposerMode('note');
                  setTimeout(() => noteEditorRef.current?.focus(), 50);
                }}
                className="mt-2.5 w-full flex items-center justify-center gap-[7px] px-3 h-9 max-sm:h-11 max-sm:text-[14px] rounded-[9px] border border-dashed border-note-line font-sans text-[12.5px] text-note hover:bg-note-muted transition-colors"
              >
                <StickyNote className="w-3 h-3" />
                Add a note via the composer
              </Button>
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
                <div className="p-3 rounded border border-ai-line/20 bg-ai/5">
                  <p className="text-[11px] font-medium text-ai">Lead Qualification</p>
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
