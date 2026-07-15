import { useEffect, useState } from 'react';
import { AtSign, Hash, Link as LinkIcon, MessageSquare, Phone, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { ContactNotesPanel } from '@/components/contacts/ContactNotesPanel';
import { safeCssColor } from '@/lib/utils';
import type { ContactProfile, ContactProfileType } from '@/services/contact.service';

export type OrgUser = { id: number; firstName: string; lastName: string | null; email: string };
export type OrgLabel = { id: number; name: string; color: string };

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-center mb-2">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
      <div className="flex-1 h-px bg-border" />
      {action}
    </div>
  );
}

const profileIcon = (type: ContactProfileType) => {
  if (type === 'telegram_username') return <Hash className="w-3.5 h-3.5 shrink-0 text-sky-500" />;
  if (type === 'telegram_phone') return <Phone className="w-3.5 h-3.5 shrink-0 text-sky-500" />;
  if (type === 'slack') return <MessageSquare className="w-3.5 h-3.5 shrink-0 text-violet-500" />;
  return <AtSign className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />;
};

const profilePlaceholder = (type: ContactProfileType) => {
  if (type === 'telegram_username') return '@username';
  if (type === 'telegram_phone') return '+1234567890';
  if (type === 'slack') return 'U12345678 or workspace/user';
  return 'alias@example.com';
};

export type ContactProfileDetailsProps = {
  contact: ContactProfile;
  users: OrgUser[];
  availableLabels: OrgLabel[];
  showLabelPicker: boolean;
  setShowLabelPicker: (next: boolean | ((prev: boolean) => boolean)) => void;
  onAssign: (userId: number | null) => void;
  onAddLabel: (labelId: number) => void;
  onRemoveLabel: (labelId: number) => void;
  /** Create a new org label from a typed name, then attach it to this contact. */
  onCreateLabel?: (name: string) => void | Promise<void>;
  creatingLabel?: boolean;
  noteInput: string;
  setNoteInput: (val: string) => void;
  addingNote: boolean;
  onAddNote: () => void;
  onDeleteNote: (noteId: number) => void;
  profileTypeInput: ContactProfileType;
  setProfileTypeInput: (val: ContactProfileType) => void;
  profileValueInput: string;
  setProfileValueInput: (val: string) => void;
  profileLabelInput: string;
  setProfileLabelInput: (val: string) => void;
  showProfileForm: boolean;
  setShowProfileForm: (next: boolean | ((prev: boolean) => boolean)) => void;
  addingProfile: boolean;
  onAddProfile: () => void;
  onDeleteProfile: (profileId: number) => void;
  linkEmailInput: string;
  setLinkEmailInput: (val: string) => void;
  linkingEmail: boolean;
  onLinkEmail: () => void;
  onUnlink: (linkedId: number) => void;
};

export function ContactProfileDetails(props: ContactProfileDetailsProps) {
  const { contact, users, availableLabels } = props;
  const [labelSearch, setLabelSearch] = useState('');
  // Don't carry a stale query across open/close of the picker.
  useEffect(() => {
    if (!props.showLabelPicker) setLabelSearch('');
  }, [props.showLabelPicker]);
  const trimmedLabel = labelSearch.trim();
  const lowerLabel = trimmedLabel.toLowerCase();
  const filteredLabels = availableLabels.filter(
    (label) => !lowerLabel || label.name.toLowerCase().includes(lowerLabel)
  );
  // Offer "Create" only when the typed name matches no existing org label
  // (assigned or not) — labels are org-shared, so this won't duplicate.
  const labelExists =
    trimmedLabel.length > 0 &&
    (contact.labels.some((label) => label.name.toLowerCase() === lowerLabel) ||
      availableLabels.some((label) => label.name.toLowerCase() === lowerLabel));
  const showCreateLabel = Boolean(props.onCreateLabel) && trimmedLabel.length > 0 && !labelExists;

  return (
    <div className="space-y-5">
      {/* Assigned manager */}
      <div>
        <SectionLabel>Assigned manager</SectionLabel>
        <select
          className="px-3 py-2 w-full text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          value={contact.assignedUserId ?? ''}
          onChange={(event) => props.onAssign(event.target.value ? parseInt(event.target.value) : null)}
        >
          <option value="">Unassigned</option>
          {users.map((usr) => (
            <option key={usr.id} value={usr.id}>
              {usr.firstName} {usr.lastName ?? ''} ({usr.email})
            </option>
          ))}
        </select>
      </div>

      {/* Labels */}
      <div>
        <SectionLabel
          action={
            <button
              type="button"
              className="grid place-items-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => props.setShowLabelPicker((prev) => !prev)}
            >
              <Plus className="w-3 h-3" />
            </button>
          }
        >
          Labels
        </SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {contact.labels.map((label) => (
            <span
              key={label.id}
              className="inline-flex gap-1.5 items-center pl-2 pr-1.5 h-6 rounded-full text-[11.5px] font-medium"
              style={{ background: `${safeCssColor(label.color)}1f`, color: safeCssColor(label.color) }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: safeCssColor(label.color) }} />
              {label.name}
              <button type="button" onClick={() => props.onRemoveLabel(label.id)}>
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          {contact.labels.length === 0 && <span className="text-sm text-muted-foreground">No labels</span>}
        </div>
        {props.showLabelPicker && (
          <Card className="mt-2">
            <CardContent className="p-1 space-y-1">
              <input
                value={labelSearch}
                onChange={(event) => setLabelSearch(event.target.value)}
                placeholder={props.onCreateLabel ? 'Search or create…' : 'Search…'}
                aria-label="Search or create label"
                autoFocus
                className="w-full h-7 px-2 rounded text-[12.5px] bg-muted border border-transparent focus:border-primary focus:bg-background outline-none text-foreground placeholder:text-muted-foreground"
              />
              <div className="overflow-y-auto max-h-44">
                {filteredLabels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    className="flex gap-2 items-center px-2 py-1.5 w-full text-sm text-left rounded hover:bg-muted"
                    onClick={() => {
                      props.onAddLabel(label.id);
                      setLabelSearch('');
                    }}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: safeCssColor(label.color) }}
                    />
                    {label.name}
                  </button>
                ))}
                {filteredLabels.length === 0 && !showCreateLabel && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    {trimmedLabel ? 'No matching labels.' : 'All labels are applied.'}
                  </p>
                )}
              </div>
              {showCreateLabel && (
                <button
                  type="button"
                  disabled={props.creatingLabel}
                  className="flex gap-1.5 items-center px-2 py-1.5 w-full text-sm font-medium text-left rounded text-primary hover:bg-muted disabled:opacity-50"
                  onClick={() => {
                    void props.onCreateLabel?.(trimmedLabel);
                    setLabelSearch('');
                  }}
                >
                  <Plus className="w-3 h-3" /> Create “{trimmedLabel}”
                </button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Channel profiles */}
      <div>
        <SectionLabel
          action={
            <button
              type="button"
              className="grid place-items-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => props.setShowProfileForm((prev) => !prev)}
            >
              <Plus className="w-3 h-3" />
            </button>
          }
        >
          Channels
        </SectionLabel>
        <div className="space-y-1">
          {contact.profiles.map((prof) => (
            <div
              key={prof.id}
              className="flex gap-2 items-center px-2 py-1.5 -mx-2 rounded-md group hover:bg-muted/60"
            >
              {profileIcon(prof.type)}
              <span className="text-[12.5px] font-mono truncate text-foreground">{prof.value}</span>
              {prof.label && (
                <span className="text-[11px] px-1.5 py-px rounded bg-muted text-muted-foreground">
                  {prof.label}
                </span>
              )}
              <button
                type="button"
                className="ml-auto opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                onClick={() => props.onDeleteProfile(prof.id)}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {contact.profiles.length === 0 && !props.showProfileForm && (
            <p className="text-sm text-muted-foreground">No channel profiles.</p>
          )}
        </div>
        {props.showProfileForm && (
          <div className="mt-2 space-y-2">
            <select
              className="px-2 py-1.5 w-full text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={props.profileTypeInput}
              onChange={(event) => props.setProfileTypeInput(event.target.value as ContactProfileType)}
            >
              <option value="email">Email</option>
              <option value="telegram_username">Telegram Username</option>
              <option value="telegram_phone">Telegram Phone</option>
              <option value="slack">Slack</option>
            </select>
            <Input
              size="sm"
              placeholder={profilePlaceholder(props.profileTypeInput)}
              value={props.profileValueInput}
              onChange={(event) => props.setProfileValueInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') props.onAddProfile();
              }}
              autoFocus
            />
            <Input
              size="sm"
              placeholder="Label (optional)"
              value={props.profileLabelInput}
              onChange={(event) => props.setProfileLabelInput(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={props.onAddProfile}
                disabled={props.addingProfile || !props.profileValueInput.trim()}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  props.setShowProfileForm(false);
                  props.setProfileValueInput('');
                  props.setProfileLabelInput('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Linked contacts */}
      <div>
        <SectionLabel>Linked contacts</SectionLabel>
        <div className="space-y-1">
          {contact.linkedContacts.map((linked) => (
            <div
              key={linked.id}
              className="flex gap-2 items-center px-2 py-1.5 -mx-2 rounded-md group hover:bg-muted/60"
            >
              <ContactAvatar email={linked.primaryEmail} name={linked.displayName} size={24} />
              <span className="text-[12.5px] truncate text-foreground">
                {linked.displayName ? (
                  <>
                    {linked.displayName}{' '}
                    <span className="font-mono text-[11.5px] text-muted-foreground">
                      {linked.primaryEmail}
                    </span>
                  </>
                ) : (
                  <span className="font-mono">{linked.primaryEmail}</span>
                )}
              </span>
              <button
                type="button"
                className="ml-auto opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                onClick={() => props.onUnlink(linked.id)}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {contact.linkedContacts.length === 0 && (
            <p className="text-sm text-muted-foreground">No linked contacts.</p>
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            size="sm"
            placeholder="Link by email…"
            value={props.linkEmailInput}
            onChange={(event) => props.setLinkEmailInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onLinkEmail();
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={props.onLinkEmail}
            disabled={props.linkingEmail || !props.linkEmailInput.trim()}
          >
            <LinkIcon className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Notes */}
      <div>
        <SectionLabel>Notes</SectionLabel>
        <ContactNotesPanel
          notes={contact.notes}
          noteInput={props.noteInput}
          setNoteInput={props.setNoteInput}
          addingNote={props.addingNote}
          onAddNote={props.onAddNote}
          onDeleteNote={props.onDeleteNote}
        />
      </div>
    </div>
  );
}
