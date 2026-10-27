import { useEffect, useState } from 'react';
import { MailCheck, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { usePermissions } from '@/hooks/usePermissions';
import { formatError } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { organizationService } from '@/services/organization.service';
import { isRouteMissing } from './isRouteMissing';

/** The backend's limits; it refuses anything else with a 400. */
const MAX_SUBJECTS = 20;
const MIN_LENGTH = 3;
const MAX_LENGTH = 200;

const sameList = (left: string[], right: string[]) =>
  left.length === right.length && left.every((subject, index) => subject === right[index]);

/**
 * Automatic reply subjects — a helpdesk (e.g. Zendesk) sends its automatic "Thank you for
 * contacting us" emails and the agents' real answers with identical headers, so only the subject
 * tells them apart. Mail from such a helpdesk whose subject contains one of these texts
 * (case-insensitive) is an automatic reply: it does not count as our answer, so the thread stays
 * in Needs us. Backed by `GET/PATCH /api/organizations/automatic-reply-subjects`
 * (`{ subjects: string[] }`; GET any member, PATCH org admin; ≤ 20 entries, 3–200 chars each).
 *
 * Any member sees the list; only an admin edits it. An empty list is valid.
 */
export const AutomaticReplySubjectsSettings = () => {
  const { isAdmin, isOrgAdmin } = usePermissions();
  const canManage = isAdmin || isOrgAdmin;

  /** What the server holds — Save is offered only when the list differs from it. */
  const [saved, setSaved] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  /** The backend does not have this endpoint yet (FE deploys on push, BE ships on a tag). */
  const [unavailable, setUnavailable] = useState(false);

  const show = (stored: string[]) => {
    setSaved(stored);
    setSubjects(stored);
  };

  useEffect(() => {
    organizationService
      .getAutomaticReplySubjects()
      .then(show)
      .catch((err: unknown) => {
        if (isRouteMissing(err)) setUnavailable(true);
        else {
          logger.error('Failed to load the automatic reply subjects', err);
          setLoadError(formatError('load the automatic reply subjects', err));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  /** A notice about the LAST save must not sit beside a different, unsaved list. */
  const clearNotices = () => {
    setSuccess('');
    setError('');
  };

  /** Mirrors the server's rules, so the same input is refused in the same terms. */
  const refusalFor = (subject: string): string => {
    if (subject.length < MIN_LENGTH || subject.length > MAX_LENGTH) {
      return `A subject must be ${MIN_LENGTH} to ${MAX_LENGTH} characters long.`;
    }
    if (subjects.some((existing) => existing.toLowerCase() === subject.toLowerCase())) {
      return 'This subject is already in the list.';
    }
    if (subjects.length >= MAX_SUBJECTS) return `The list holds at most ${MAX_SUBJECTS} subjects.`;
    return '';
  };

  const handleAdd = () => {
    clearNotices();
    const subject = draft.trim();
    const refusal = refusalFor(subject);
    if (refusal) {
      setError(refusal);
      return;
    }
    setSubjects((current) => [...current, subject]);
    setDraft('');
  };

  const handleRemove = (subject: string) => {
    clearNotices();
    setSubjects((current) => current.filter((existing) => existing !== subject));
  };

  const handleSave = async () => {
    clearNotices();
    setSaving(true);
    try {
      const stored = await organizationService.updateAutomaticReplySubjects(subjects);
      show(stored);
      setSuccess('Saved. It applies to email that arrives from now on.');
    } catch (err) {
      logger.error('Failed to save the automatic reply subjects', err);
      setError(formatError('save the automatic reply subjects', err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-4 text-sm text-muted-foreground">Loading...</div>;

  if (unavailable) {
    return (
      <Alert variant="info">
        Automatic reply subjects are not available on this deployment yet. They arrive with the next
        backend release.
      </Alert>
    );
  }

  if (loadError) return <Alert variant="danger">{loadError}</Alert>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="h-5 w-5" />
          Automatic reply subjects
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Some helpdesks send their automatic &quot;Thank you for contacting us&quot; emails
            looking exactly like a real answer. List the subjects of those automatic emails here: an
            email whose subject contains one of them does not count as your answer, so the thread
            stays in Needs us.
          </p>
          <p>Upper and lower case do not matter. An empty list changes nothing.</p>
        </div>

        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects yet.</p>
        ) : (
          <ul className="space-y-2" aria-label="Automatic reply subjects">
            {subjects.map((subject) => (
              <li
                key={subject}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="break-all">{subject}</span>
                {canManage ? (
                  <IconButton
                    variant="ghost"
                    icon={<X className="h-4 w-4" />}
                    aria-label={`Remove ${subject}`}
                    disabled={saving}
                    onClick={() => handleRemove(subject)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          <div className="space-y-2">
            <Label htmlFor="automatic-reply-subject-new">Add a subject</Label>
            <div className="flex gap-2">
              <Input
                id="automatic-reply-subject-new"
                placeholder="Thank you for contacting us"
                maxLength={MAX_LENGTH}
                value={draft}
                disabled={saving}
                onChange={(event) => {
                  setDraft(event.target.value);
                  clearNotices();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAdd();
                  }
                }}
              />
              <Button variant="outline" onClick={handleAdd} disabled={saving || !draft.trim()}>
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {MIN_LENGTH} to {MAX_LENGTH} characters, at most {MAX_SUBJECTS} subjects.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only a workspace admin can change this list.
          </p>
        )}

        {error ? <Alert variant="danger">{error}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}

        {canManage ? (
          <div>
            <Button
              onClick={handleSave}
              isLoading={saving}
              disabled={saving || sameList(subjects, saved)}
            >
              Save
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
