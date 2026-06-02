import { useCallback, useEffect, useRef, useState } from 'react';
import { AtSign, Hash, Link, Mail, MessageSquare, Phone, Plus, Save, Target, Ticket, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { apiClient } from '@/lib/api-client';
import { formatAge, formatDate, safeCssColor } from '@/lib/utils';
import type { ApiResponse } from '@/types';
import { type ContactProfile, type ContactProfileType, contactService } from '@/services/contact.service';

type OrgUser = { id: number; firstName: string; lastName: string | null; email: string };
type OrgLabel = { id: number; name: string; color: string };

type ContactProfilePanelProps = {
  email: string;
  onClose: () => void;
};

export function ContactProfilePanel({ email, onClose }: ContactProfilePanelProps) {
  const navigate = useNavigate();
  const [contact, setContact] = useState<ContactProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [orgLabels, setOrgLabels] = useState<OrgLabel[]>([]);

  // Edit state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [linkEmailInput, setLinkEmailInput] = useState('');
  const [linkingEmail, setLinkingEmail] = useState(false);
  const [profileTypeInput, setProfileTypeInput] = useState<ContactProfileType>('email');
  const [profileValueInput, setProfileValueInput] = useState('');
  const [profileLabelInput, setProfileLabelInput] = useState('');
  const [addingProfile, setAddingProfile] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profile, usersRes, labelsRes] = await Promise.all([
        contactService.getByEmail(email),
        apiClient.get<ApiResponse<OrgUser[]>>('/api/users'),
        apiClient.get<ApiResponse<OrgLabel[]>>('/api/labels'),
      ]);
      setContact(profile);
      setNameInput(profile.displayName ?? '');
      setUsers((usersRes.data.data as { users?: OrgUser[] } | null)?.users ?? []);
      setOrgLabels(labelsRes.data.data ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { void load(); }, [load]);

  const handleSaveName = async () => {
    if (!contact) return;
    setSavingName(true);
    try {
      await contactService.update(contact.id, { displayName: nameInput.trim() || null });
      setContact((contact) => contact ? { ...contact, displayName: nameInput.trim() || null } : contact);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  const handleAssign = async (userId: number | null) => {
    if (!contact) return;
    await contactService.update(contact.id, { assignedUserId: userId });
    const user = users.find((usr) => usr.id === userId) ?? null;
    setContact((contact) =>
      contact ? {
        ...contact,
        assignedUserId: userId,
        assignedUserFirstName: user?.firstName ?? null,
        assignedUserLastName: user?.lastName ?? null,
        assignedUserEmail: user?.email ?? null,
      } : contact
    );
  };

  const handleAddNote = async () => {
    if (!contact || !noteInput.trim()) return;
    setAddingNote(true);
    try {
      const note = await contactService.addNote(contact.id, noteInput.trim());
      setContact((contact) => contact ? { ...contact, notes: [note, ...contact.notes] } : contact);
      setNoteInput('');
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!contact) return;
    await contactService.deleteNote(contact.id, noteId);
    setContact((contact) => contact ? { ...contact, notes: contact.notes.filter((note) => note.id !== noteId) } : contact);
  };

  const handleAddLabel = async (labelId: number) => {
    if (!contact) return;
    await contactService.addLabel(contact.id, labelId);
    const label = orgLabels.find((lbl) => lbl.id === labelId);
    if (label) {
      setContact((contact) =>
        contact && !contact.labels.some((lbl) => lbl.id === labelId)
          ? { ...contact, labels: [...contact.labels, label] }
          : contact
      );
    }
    setShowLabelPicker(false);
  };

  const handleRemoveLabel = async (labelId: number) => {
    if (!contact) return;
    await contactService.removeLabel(contact.id, labelId);
    setContact((contact) => contact ? { ...contact, labels: contact.labels.filter((lbl) => lbl.id !== labelId) } : contact);
  };

  const handleAddProfile = async () => {
    if (!contact || !profileValueInput.trim()) return;
    setAddingProfile(true);
    try {
      const profile = await contactService.addProfile(contact.id, {
        type: profileTypeInput,
        value: profileValueInput.trim(),
        label: profileLabelInput.trim() || undefined,
      });
      setContact((contact) =>
        contact && !contact.profiles.some((prof) => prof.id === profile.id)
          ? { ...contact, profiles: [...contact.profiles, profile] }
          : contact
      );
      setProfileValueInput('');
      setProfileLabelInput('');
      setShowProfileForm(false);
    } finally {
      setAddingProfile(false);
    }
  };

  const handleDeleteProfile = async (profileId: number) => {
    if (!contact) return;
    await contactService.deleteProfile(contact.id, profileId);
    setContact((contact) => contact ? { ...contact, profiles: contact.profiles.filter((prof) => prof.id !== profileId) } : contact);
  };

  const handleLinkEmail = async () => {
    if (!contact || !linkEmailInput.trim()) return;
    setLinkingEmail(true);
    try {
      const linked = await contactService.getByEmail(linkEmailInput.trim().toLowerCase());
      if (linked.id === contact.id) return;
      await contactService.linkContact(contact.id, linked.id);
      setContact((contact) =>
        contact && !contact.linkedContacts.some((lc) => lc.id === linked.id)
          ? {
              ...contact,
              linkedContacts: [
                ...contact.linkedContacts,
                { id: linked.id, primaryEmail: linked.primaryEmail, displayName: linked.displayName },
              ],
            }
          : contact
      );
      setLinkEmailInput('');
    } finally {
      setLinkingEmail(false);
    }
  };

  const handleUnlink = async (linkedId: number) => {
    if (!contact) return;
    await contactService.unlinkContact(contact.id, linkedId);
    setContact((contact) => contact ? { ...contact, linkedContacts: contact.linkedContacts.filter((lc) => lc.id !== linkedId) } : contact);
  };

  const availableLabels = orgLabels.filter(
    (lbl) => !contact?.labels.some((cl) => cl.id === lbl.id)
  );

  return (
    <Drawer open onClose={onClose} title={email} size="md">
      {loading ? (
        <div className="space-y-3">
          {(['a', 'b', 'c'] as const).map((key) => (
            <div key={key} className="h-16 rounded animate-pulse bg-muted" />
          ))}
        </div>
      ) : !contact ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          Failed to load contact.
        </div>
      ) : (
        <div className="space-y-6">

          {/* Display name */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Display Name</p>
            {editingName ? (
              <div className="flex gap-2 items-center">
                <Input
                  ref={nameRef}
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
                <Button size="sm" variant="ghost" onClick={() => void handleSaveName()} disabled={savingName}>
                  <Save className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <button
                className="text-left w-full"
                onClick={() => { setEditingName(true); setNameInput(contact.displayName ?? ''); }}
              >
                {contact.displayName ? (
                  <p className="text-sm font-semibold">{contact.displayName}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic hover:text-foreground transition-colors">
                    Click to add display name…
                  </p>
                )}
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-3 flex-wrap text-sm text-muted-foreground">
            <span className="flex gap-1 items-center">
              <MessageSquare className="w-3.5 h-3.5" />
              {contact.stats?.messageCount ?? 0} messages
            </span>
            {contact.stats?.lastMessageAt && (
              <span title={formatDate(contact.stats.lastMessageAt)}>
                Last: {formatAge(contact.stats.lastMessageAt)}
              </span>
            )}
            {contact.stats?.isLead && (
              <Badge variant="default" className="flex gap-1 items-center text-xs">
                <Target className="w-3 h-3" />
                Lead
              </Badge>
            )}
          </div>

          {/* Assigned manager */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned Manager</p>
            <select
              className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={contact.assignedUserId ?? ''}
              onChange={(event) => void handleAssign(event.target.value ? parseInt(event.target.value) : null)}
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
            <div className="flex gap-2 items-center mb-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Labels</p>
              {availableLabels.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 text-xs"
                  onClick={() => setShowLabelPicker((val) => !val)}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contact.labels.map((label) => (
                <span
                  key={label.id}
                  className="inline-flex gap-1 items-center px-2 py-0.5 text-xs font-medium rounded-full text-white"
                  style={{ backgroundColor: safeCssColor(label.color) }}
                >
                  {label.name}
                  <button onClick={() => void handleRemoveLabel(label.id)}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              {contact.labels.length === 0 && (
                <span className="text-sm text-muted-foreground">No labels</span>
              )}
            </div>
            {showLabelPicker && (
              <Card className="mt-2">
                <CardContent className="p-1">
                  {availableLabels.map((label) => (
                    <button
                      key={label.id}
                      className="flex gap-2 items-center px-2 py-1.5 w-full text-left text-sm rounded hover:bg-muted"
                      onClick={() => void handleAddLabel(label.id)}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: safeCssColor(label.color) }}
                      />
                      {label.name}
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Notes */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
            <div className="space-y-2 mb-2">
              {contact.notes.map((note) => (
                <div key={note.id} className="flex gap-2 group">
                  <div className="flex-1 p-2.5 text-sm rounded-md bg-muted/60">
                    <div className="flex gap-2 justify-between items-center mb-0.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {note.authorFirstName ?? 'Unknown'} {note.authorLastName ?? ''}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{note.content}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 shrink-0 mt-1 text-destructive"
                    onClick={() => void handleDeleteNote(note.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              {contact.notes.length === 0 && (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Textarea
                className="flex-1 resize-none"
                rows={2}
                placeholder="Add a note… (Ctrl+Enter to save)"
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void handleAddNote();
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                className="self-end"
                onClick={() => void handleAddNote()}
                disabled={addingNote || !noteInput.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Recent messages */}
          {contact.recentMessages && contact.recentMessages.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent Messages</p>
              <div className="space-y-1">
                {contact.recentMessages.map((msg) => (
                  <button
                    key={msg.id}
                    className="flex gap-2 items-start w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                    onClick={() => { onClose(); navigate(`/messages?id=${msg.id}`); }}
                  >
                    <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{msg.subject ?? '(no subject)'}</p>
                      <p className="text-xs text-muted-foreground truncate">{msg.content}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatAge(msg.createdAt)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent tickets */}
          {contact.recentTickets && contact.recentTickets.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent Tickets</p>
              <div className="space-y-1">
                {contact.recentTickets.map((tick) => (
                  <button
                    key={tick.id}
                    className="flex gap-2 items-center w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                    onClick={() => { onClose(); navigate(`/tickets?id=${tick.id}`); }}
                  >
                    <Ticket className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-sm truncate">{tick.title}</span>
                    <Badge
                      variant={tick.status === 'resolved' ? 'success' : tick.status === 'in_progress' ? 'warning' : 'secondary'}
                      className="text-xs shrink-0"
                    >
                      {tick.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatAge(tick.createdAt)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Channel profiles */}
          <div>
            <div className="flex gap-2 items-center mb-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Channel Profiles</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-xs"
                onClick={() => setShowProfileForm((val) => !val)}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            <div className="space-y-1 mb-2">
              {contact.profiles.map((prof) => (
                <div key={prof.id} className="flex gap-2 justify-between items-center group">
                  <div className="flex gap-2 items-center min-w-0">
                    {prof.type === 'email' && <AtSign className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                    {prof.type === 'telegram_username' && <Hash className="w-3.5 h-3.5 shrink-0 text-blue-500" />}
                    {prof.type === 'telegram_phone' && <Phone className="w-3.5 h-3.5 shrink-0 text-blue-500" />}
                    {prof.type === 'slack' && <MessageSquare className="w-3.5 h-3.5 shrink-0 text-purple-500" />}
                    <span className="text-sm truncate">{prof.value}</span>
                    {prof.label && (
                      <span className="text-xs text-muted-foreground shrink-0">({prof.label})</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 shrink-0 text-destructive"
                    onClick={() => void handleDeleteProfile(prof.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {contact.profiles.length === 0 && !showProfileForm && (
                <p className="text-sm text-muted-foreground">No channel profiles.</p>
              )}
            </div>
            {showProfileForm && (
              <div className="space-y-2">
                <select
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  value={profileTypeInput}
                  onChange={(event) => setProfileTypeInput(event.target.value as ContactProfileType)}
                >
                  <option value="email">Email</option>
                  <option value="telegram_username">Telegram Username</option>
                  <option value="telegram_phone">Telegram Phone</option>
                  <option value="slack">Slack</option>
                </select>
                <Input
                  size="sm"
                  placeholder={
                    profileTypeInput === 'email' ? 'alias@example.com' :
                    profileTypeInput === 'telegram_username' ? '@username' :
                    profileTypeInput === 'telegram_phone' ? '+1234567890' :
                    'U12345678 or workspace/user'
                  }
                  value={profileValueInput}
                  onChange={(event) => setProfileValueInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void handleAddProfile(); }}
                  autoFocus
                />
                <Input
                  size="sm"
                  placeholder="Label (optional)"
                  value={profileLabelInput}
                  onChange={(event) => setProfileLabelInput(event.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => void handleAddProfile()}
                    disabled={addingProfile || !profileValueInput.trim()}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowProfileForm(false); setProfileValueInput(''); setProfileLabelInput(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Linked contacts */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Linked Contacts</p>
            <div className="space-y-1 mb-2">
              {contact.linkedContacts.map((lc) => (
                <div key={lc.id} className="flex gap-2 justify-between items-center group">
                  <span className="text-sm truncate">
                    {lc.displayName ? `${lc.displayName} (${lc.primaryEmail})` : lc.primaryEmail}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 shrink-0 text-destructive"
                    onClick={() => void handleUnlink(lc.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {contact.linkedContacts.length === 0 && (
                <p className="text-sm text-muted-foreground">No linked contacts.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                size="sm"
                placeholder="Link by email…"
                value={linkEmailInput}
                onChange={(event) => setLinkEmailInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void handleLinkEmail(); }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleLinkEmail()}
                disabled={linkingEmail || !linkEmailInput.trim()}
              >
                <Link className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

        </div>
      )}
    </Drawer>
  );
}
