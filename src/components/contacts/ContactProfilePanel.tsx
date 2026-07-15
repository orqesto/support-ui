import { useEffect, useMemo, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { ContactProfileActivity, type ActivityItem } from '@/components/contacts/ContactProfileActivity';
import { ContactProfileDetails } from '@/components/contacts/ContactProfileDetails';
import { useContactProfile } from '@/components/contacts/useContactProfile';
import { avatarColor, formatAge, getInitials, safeCssColor } from '@/lib/utils';

type ContactProfilePanelProps = {
  email: string;
  onClose: () => void;
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-[13px] font-semibold truncate text-foreground">{children}</div>
    </div>
  );
}

export function ContactProfilePanel({ email, onClose }: ContactProfilePanelProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'activity' | 'details'>('activity');

  const {
    contact,
    loading,
    users,
    availableLabels,
    editingName,
    setEditingName,
    nameInput,
    setNameInput,
    savingName,
    handleSaveName,
    noteInput,
    setNoteInput,
    addingNote,
    handleAddNote,
    handleDeleteNote,
    showLabelPicker,
    setShowLabelPicker,
    handleAddLabel,
    handleRemoveLabel,
    handleCreateLabel,
    creatingLabel,
    handleAssign,
    profileTypeInput,
    setProfileTypeInput,
    profileValueInput,
    setProfileValueInput,
    profileLabelInput,
    setProfileLabelInput,
    addingProfile,
    showProfileForm,
    setShowProfileForm,
    handleAddProfile,
    handleDeleteProfile,
    linkEmailInput,
    setLinkEmailInput,
    linkingEmail,
    handleLinkEmail,
    handleUnlink,
  } = useContactProfile(email);

  // Escape closes the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const assigneeName = contact?.assignedUserFirstName
    ? `${contact.assignedUserFirstName} ${contact.assignedUserLastName ?? ''}`.trim()
    : null;

  const openTickets = useMemo(
    () =>
      (contact?.recentTickets ?? []).filter((tkt) => tkt.status !== 'resolved' && tkt.status !== 'closed')
        .length,
    [contact]
  );

  // Merge messages + tickets + notes into one reverse-chronological activity feed.
  const activity = useMemo<ActivityItem[]>(() => {
    if (!contact) return [];
    const items: ActivityItem[] = [];
    for (const msg of contact.recentMessages ?? []) {
      items.push({
        key: `m${msg.id}`,
        kind: 'message',
        at: msg.createdAt,
        title: msg.subject?.trim() ? msg.subject : '(no subject)',
        meta: msg.channel?.trim() ? msg.channel : 'email',
        status: msg.status,
        onClick: () => {
          onClose();
          navigate(`/messages?id=${msg.id}`);
        },
      });
    }
    for (const tkt of contact.recentTickets ?? []) {
      items.push({
        key: `t${tkt.id}`,
        kind: 'ticket',
        at: tkt.createdAt,
        title: tkt.title,
        meta: `#${tkt.id}`,
        status: tkt.status,
        onClick: () => {
          onClose();
          navigate(`/tickets?id=${tkt.id}`);
        },
      });
    }
    for (const note of contact.notes ?? []) {
      items.push({
        key: `n${note.id}`,
        kind: 'note',
        at: note.createdAt,
        title: `${note.authorFirstName ?? 'Someone'} added a note`,
        meta: note.content,
      });
    }
    return items.sort((lhs, rhs) => new Date(rhs.at).getTime() - new Date(lhs.at).getTime());
  }, [contact, navigate, onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[75] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="flex fixed top-0 right-0 bottom-0 z-[80] flex-col w-[440px] max-w-[92vw] border-l shadow-2xl bg-card border-border">
        {loading ? (
          <div className="p-6 space-y-3">
            {(['a', 'b', 'c'] as const).map((key) => (
              <div key={key} className="h-16 rounded animate-pulse bg-muted" />
            ))}
          </div>
        ) : !contact ? (
          <div className="flex flex-col gap-3 justify-center items-center h-full text-muted-foreground">
            Failed to load contact.
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex-shrink-0 p-4 border-b border-border">
              <div className="flex gap-3 items-start">
                <ContactAvatar email={contact.primaryEmail} name={contact.displayName} size={48} />
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex gap-1.5 items-center">
                      <Input
                        size="sm"
                        value={nameInput}
                        onChange={(event) => setNameInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void handleSaveName();
                          if (event.key === 'Escape') setEditingName(false);
                        }}
                        autoFocus
                        placeholder="Display name"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleSaveName()}
                        disabled={savingName}
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex gap-1.5 items-center text-left group/name"
                      onClick={() => {
                        setEditingName(true);
                        setNameInput(contact.displayName ?? '');
                      }}
                    >
                      <h2 className="text-base font-bold tracking-tight truncate text-foreground">
                        {contact.displayName?.trim() ? contact.displayName : contact.primaryEmail}
                      </h2>
                      <Settings2 className="w-3 h-3 opacity-0 text-muted-foreground group-hover/name:opacity-100" />
                    </button>
                  )}
                  <p className="text-xs font-mono truncate text-muted-foreground mt-0.5">
                    {contact.primaryEmail}
                  </p>
                  {contact.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {contact.labels.map((label) => (
                        <span
                          key={label.id}
                          className="inline-flex gap-1 items-center pl-1.5 pr-2 h-[18px] rounded-full text-[10.5px] font-medium"
                          style={{
                            background: `${safeCssColor(label.color)}1f`,
                            color: safeCssColor(label.color),
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: safeCssColor(label.color) }}
                          />
                          {label.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="grid place-items-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted flex-shrink-0"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

            </div>

            {/* Key facts */}
            <div className="grid flex-shrink-0 grid-cols-2 gap-y-3 gap-x-4 px-4 py-3 border-b border-border bg-muted/40">
              <Fact label="Assigned to">
                {assigneeName ? (
                  <span className="inline-flex gap-1.5 items-center">
                    <span
                      className="grid place-items-center w-5 h-5 rounded-full text-[9px] font-semibold text-white"
                      style={{ background: avatarColor(assigneeName) }}
                    >
                      {getInitials(assigneeName)}
                    </span>
                    {assigneeName}
                  </span>
                ) : (
                  <span className="font-normal text-muted-foreground">Unassigned</span>
                )}
              </Fact>
              <Fact label="Messages">
                {contact.stats?.messageCount ?? 0}
                {openTickets > 0 && (
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {openTickets} open ticket{openTickets === 1 ? '' : 's'}
                  </span>
                )}
              </Fact>
              <Fact label="Customer since">{formatAge(contact.createdAt)} ago</Fact>
              <Fact label="Last active">
                {contact.stats?.lastMessageAt ? `${formatAge(contact.stats.lastMessageAt)} ago` : '—'}
              </Fact>
            </div>

            {/* Tabs */}
            <div className="flex flex-shrink-0 gap-1 px-3 pt-2 border-b border-border">
              {(
                [
                  { id: 'activity', label: 'Activity' },
                  { id: 'details', label: 'Details' },
                ] as const
              ).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={`px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${
                    tab === entry.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-4">
              {tab === 'activity' ? (
                <ContactProfileActivity activity={activity} />
              ) : (
                <ContactProfileDetails
                  contact={contact}
                  users={users}
                  availableLabels={availableLabels}
                  showLabelPicker={showLabelPicker}
                  setShowLabelPicker={setShowLabelPicker}
                  onAssign={handleAssign}
                  onAddLabel={handleAddLabel}
                  onRemoveLabel={handleRemoveLabel}
                  onCreateLabel={handleCreateLabel}
                  creatingLabel={creatingLabel}
                  noteInput={noteInput}
                  setNoteInput={setNoteInput}
                  addingNote={addingNote}
                  onAddNote={handleAddNote}
                  onDeleteNote={handleDeleteNote}
                  profileTypeInput={profileTypeInput}
                  setProfileTypeInput={setProfileTypeInput}
                  profileValueInput={profileValueInput}
                  setProfileValueInput={setProfileValueInput}
                  profileLabelInput={profileLabelInput}
                  setProfileLabelInput={setProfileLabelInput}
                  showProfileForm={showProfileForm}
                  setShowProfileForm={setShowProfileForm}
                  addingProfile={addingProfile}
                  onAddProfile={handleAddProfile}
                  onDeleteProfile={handleDeleteProfile}
                  linkEmailInput={linkEmailInput}
                  setLinkEmailInput={setLinkEmailInput}
                  linkingEmail={linkingEmail}
                  onLinkEmail={handleLinkEmail}
                  onUnlink={handleUnlink}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
