import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { usePermissions } from '@/hooks/usePermissions';
import { formatError, getErrorBody, getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { organizationService } from '@/services/organization.service';

/** The backend's range (`MIN/MAX_OPEN_WINDOW_DAYS`); it refuses anything else with a 400. */
const MIN_DAYS = 1;
const MAX_DAYS = 365;

/**
 * Is this the answer of a backend that does not have the route yet? Not only a 404: a release
 * without it matches the path against `/api/organizations/:id` instead, which answers an org admin
 * 403 "Global admin access required" (its `requireGlobalAdmin`) and a global admin 400 "Invalid
 * organization ID" (`getById`). Matched on the exact messages, so a real refusal still shows.
 */
const isRouteMissing = (err: unknown): boolean => {
  const status = getErrorStatus(err);
  if (status === 404) return true;
  const message = getErrorBody(err)?.error;
  return (
    (status === 403 && message === 'Global admin access required') ||
    (status === 400 && message === 'Invalid organization ID')
  );
};

/**
 * Open-conversation window — how old a customer's email may be and still count as waiting on the
 * team. Backed by `GET/PATCH /api/organizations/open-conversation-window` (`{ days }`, default 14).
 *
 * The copy is the backend's four uses of the number and nothing else (support-service #858):
 * a NEW email conversation older than the window lands resolved; an older customer message never
 * reopens a finished conversation; an older reply of ours from the Sent folder neither reopens one
 * nor marks it waiting on the customer; the acknowledgment email is sent only for mail inside it.
 * It is read when a message is saved, so it never re-files what is already in the inbox — the
 * copy says so, because "I lowered it and nothing moved" is the first question an admin would
 * have.
 */
export const OpenConversationWindowSettings = () => {
  const { isAdmin, isOrgAdmin } = usePermissions();
  const canManage = isAdmin || isOrgAdmin;

  /** What the server holds — the input is compared against it, never against a local default. */
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  /** The backend does not have this endpoint yet (FE deploys on push, BE ships on a tag). */
  const [unavailable, setUnavailable] = useState(false);

  const show = (days: number) => {
    setSaved(days);
    setValue(String(days));
  };

  useEffect(() => {
    if (!canManage) return;
    organizationService
      .getOpenConversationWindow()
      .then(({ days }) => show(days))
      .catch((err: unknown) => {
        if (isRouteMissing(err)) setUnavailable(true);
        else {
          logger.error('Failed to load the open-conversation window', err);
          setLoadError(formatError('load the open-conversation window', err));
        }
      })
      .finally(() => setLoading(false));
  }, [canManage]);

  /** Mirrors the server's schema, so the same input is refused in the same terms. */
  const parsed = /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  const invalid =
    Number.isInteger(parsed) && parsed >= MIN_DAYS && parsed <= MAX_DAYS
      ? ''
      : `Enter a whole number of days from ${MIN_DAYS} to ${MAX_DAYS}.`;

  const handleSave = async () => {
    setError('');
    setSuccess('');
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      const { days } = await organizationService.updateOpenConversationWindow(parsed);
      show(days);
      setSuccess(
        `Saved: ${days} ${days === 1 ? 'day' : 'days'}. It applies to email that arrives from now on (within a minute).`
      );
    } catch (err) {
      logger.error('Failed to save the open-conversation window', err);
      setError(formatError('save the open-conversation window', err));
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return null;
  if (loading) return <div className="py-4 text-sm text-muted-foreground">Loading...</div>;

  if (unavailable) {
    return (
      <Alert variant="info">
        The open-conversation window is not available on this deployment yet. It arrives with the
        next backend release.
      </Alert>
    );
  }

  if (loadError) return <Alert variant="danger">{loadError}</Alert>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          Open conversations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            How old an email can be and still count as current work. Email older than this —
            typically from importing a mailbox — is filed as history:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>a new conversation started by it arrives resolved, not open;</li>
            <li>a customer message does not reopen a resolved conversation;</li>
            <li>
              a reply of yours imported from the Sent folder does not reopen a conversation or mark
              it as waiting on the customer;
            </li>
            <li>no acknowledgment email is sent for it.</li>
          </ul>
          <p>
            A customer message dated inside the window reopens a resolved conversation as usual,
            unless the conversation&apos;s latest message was judged spam. Changing the number
            applies to email that arrives from now on; conversations already in your inbox keep
            their status.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="open-conversation-window-days">Days</Label>
          <Input
            id="open-conversation-window-days"
            type="number"
            inputMode="numeric"
            min={MIN_DAYS}
            max={MAX_DAYS}
            step={1}
            className="w-32"
            value={value}
            disabled={saving}
            onChange={(event) => {
              // A notice about the LAST save must not sit beside a different, unsaved number.
              setValue(event.target.value);
              setSuccess('');
              setError('');
            }}
          />
          <p className="text-xs text-muted-foreground">
            From {MIN_DAYS} to {MAX_DAYS}. Currently {saved} {saved === 1 ? 'day' : 'days'}.
          </p>
        </div>

        {error ? <Alert variant="danger">{error}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}

        <div>
          <Button onClick={handleSave} isLoading={saving} disabled={saving || parsed === saved}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
