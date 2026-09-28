import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { usePermissions } from '@/hooks/usePermissions';
import { formatError, getErrorBody, getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { organizationService, type OpenConversationWindow } from '@/services/organization.service';

/** The backend's range (`MIN/MAX_OPEN_WINDOW_DAYS`); it refuses anything else with a 400. */
const MIN_DAYS = 1;
const MAX_DAYS = 365;
/** The backend's value for OFF (`OPEN_WINDOW_OFF`). */
const OFF_DAYS = 0;
/** Turning the window back on starts here unless a length was already chosen (backend default). */
const DEFAULT_DAYS = 14;

const PRESETS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '1 month (30 days)' },
] as const;
const CUSTOM = 'custom';

const presetFor = (days: number): string =>
  PRESETS.some((preset) => Number(preset.value) === days) ? String(days) : CUSTOM;

const plural = (count: number, unit: string) => `${count} ${count === 1 ? unit : `${unit}s`}`;

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
 * team. Backed by `GET/PATCH /api/organizations/open-conversation-window` (`{ days }`, default 14;
 * `days: 0` = OFF on a backend that reports `off` + `liveMailWindowHours`).
 *
 * The copy is the backend's four uses of the number and nothing else (support-service #858):
 * a NEW email conversation older than the window lands resolved; an older customer message never
 * reopens a finished conversation; an older reply of ours from the Sent folder neither reopens one
 * nor marks it waiting on the customer; the acknowledgment email is sent only for mail inside it.
 * It is read when a message is saved, so it never re-files what is already in the inbox — the
 * copy says so, because "I lowered it and nothing moved" is the first question an admin would
 * have.
 *
 * OFF (owner, 2026-09-28): only mail arriving now opens work. "Now" is the backend's live-mail
 * allowance (LIVE_MAIL_WINDOW_HOURS, 24 h by default) because mail can reach us late; the copy
 * quotes the number the backend returned, never a hard-coded "a day". A backend without off
 * support (its GET has no `off`) gets no Off switch — it would refuse the save with a 400.
 */
export const OpenConversationWindowSettings = () => {
  const { isAdmin, isOrgAdmin } = usePermissions();
  const canManage = isAdmin || isOrgAdmin;

  /** What the server holds — the controls are compared against it, never against a local default. */
  const [saved, setSaved] = useState<number | null>(null);
  const [offSupported, setOffSupported] = useState(false);
  const [liveHours, setLiveHours] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [preset, setPreset] = useState<string>(String(DEFAULT_DAYS));
  const [customValue, setCustomValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  /** The backend does not have this endpoint yet (FE deploys on push, BE ships on a tag). */
  const [unavailable, setUnavailable] = useState(false);

  const show = (setting: OpenConversationWindow) => {
    setSaved(setting.days);
    setOffSupported(setting.offSupported);
    setLiveHours(setting.liveMailWindowHours);
    const isOn = setting.days !== OFF_DAYS;
    setEnabled(isOn);
    if (isOn) {
      setPreset(presetFor(setting.days));
      setCustomValue(String(setting.days));
    }
  };

  useEffect(() => {
    if (!canManage) return;
    organizationService
      .getOpenConversationWindow()
      .then(show)
      .catch((err: unknown) => {
        if (isRouteMissing(err)) setUnavailable(true);
        else {
          logger.error('Failed to load the open-conversation window', err);
          setLoadError(formatError('load the open-conversation window', err));
        }
      })
      .finally(() => setLoading(false));
  }, [canManage]);

  /** A notice about the LAST save must not sit beside a different, unsaved choice. */
  const clearNotices = () => {
    setSuccess('');
    setError('');
  };

  /** Mirrors the server's schema, so the same input is refused in the same terms. */
  const customDays = /^\d+$/.test(customValue.trim()) ? Number(customValue.trim()) : NaN;
  const chosenDays = !enabled ? OFF_DAYS : preset === CUSTOM ? customDays : Number(preset);
  const invalid =
    !enabled || (Number.isInteger(chosenDays) && chosenDays >= MIN_DAYS && chosenDays <= MAX_DAYS)
      ? ''
      : `Enter a whole number of days from ${MIN_DAYS} to ${MAX_DAYS}.`;

  const liveSpan = liveHours === null ? '' : plural(liveHours, 'hour');

  const handleSave = async () => {
    clearNotices();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      const stored = await organizationService.updateOpenConversationWindow(chosenDays);
      show(stored);
      setSuccess(
        `Saved: ${stored.days === OFF_DAYS ? 'off' : plural(stored.days, 'day')}. It applies to email that arrives from now on (within a minute).`
      );
    } catch (err) {
      logger.error('Failed to save the open-conversation window', err);
      // Only reachable if the backend lost off support after it said it had it (a rollback):
      // say what happened instead of relaying a schema message about "days".
      if (chosenDays === OFF_DAYS && getErrorStatus(err) === 400) {
        setError(
          'This server does not accept turning the window off. Nothing was changed — reload the page to see what it supports.'
        );
      } else {
        setError(formatError('save the open-conversation window', err));
      }
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

  const currently =
    saved === OFF_DAYS
      ? `Currently off: only email dated in the last ${liveSpan} becomes open work.`
      : `Currently ${plural(saved ?? DEFAULT_DAYS, 'day')}.`;

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
          {enabled ? (
            <p>
              How old an email can be and still count as current work. Email older than this —
              typically from importing a mailbox — is filed as history:
            </p>
          ) : (
            <p>
              Off: only email arriving now opens work. Mail can reach us late (mailbox polling,
              provider delays), so &quot;now&quot; allows up to {liveSpan}: email dated in the last{' '}
              {liveSpan} still counts. Anything older — typically from importing a mailbox — is
              filed as history:
            </p>
          )}
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
            A customer message dated {enabled ? 'inside the window' : `in the last ${liveSpan}`}{' '}
            reopens a resolved conversation as usual, unless the conversation&apos;s latest message
            was judged spam. Changing this applies to email that arrives from now on; conversations
            already in your inbox keep their status.
          </p>
        </div>

        {offSupported ? (
          <div className="space-y-1">
            {/* The switch's accessible name is its label, so it names the setting, not "On". */}
            <Toggle
              checked={enabled}
              label="Use an open-conversation window"
              disabled={saving}
              onChange={(next) => {
                setEnabled(next);
                clearNotices();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Off: only email arriving now (up to {liveSpan} late) becomes open work.
            </p>
          </div>
        ) : null}

        {enabled ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="open-conversation-window-preset">Window</Label>
              <Select
                id="open-conversation-window-preset"
                className="w-56"
                value={preset}
                disabled={saving}
                onChange={(event) => {
                  setPreset(event.target.value);
                  clearNotices();
                }}
              >
                {PRESETS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value={CUSTOM}>Custom</option>
              </Select>
            </div>
            {preset === CUSTOM ? (
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
                  value={customValue}
                  disabled={saving}
                  onChange={(event) => {
                    setCustomValue(event.target.value);
                    clearNotices();
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  From {MIN_DAYS} to {MAX_DAYS}.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">{currently}</p>

        {error ? <Alert variant="danger">{error}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}

        <div>
          <Button onClick={handleSave} isLoading={saving} disabled={saving || chosenDays === saved}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
