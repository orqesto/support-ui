import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useUpdatePlatformIngestion } from '@/hooks/usePlatformSettings';
import type {
  BoundedField,
  IngestionSettings,
  PlatformIngestionInput,
} from '@/services/platformSettings.service';
import { SourceBadge } from './SourceBadge';

export const INGESTION_NOT_DEPLOYED =
  'This server does not have these settings yet — they arrive with the next backend release.';

type FieldKey = keyof IngestionSettings;

type FieldDef = { key: FieldKey; label: string; hint: string };

const RATE_FIELDS: FieldDef[] = [
  {
    key: 'importRunBudgetMinutes',
    label: 'Import run budget (minutes)',
    hint: 'How long one check of a mailbox may keep importing old mail before it hands the mailbox to new mail.',
  },
  {
    key: 'attachmentsPerMinute',
    label: 'Attachments per minute',
    hint: 'How many attachments are read per minute. Takes effect within about a minute, no restart.',
  },
  {
    key: 'kbMessagesPerMinute',
    label: 'Knowledge-base messages per minute',
    hint: 'How many messages are read into the knowledge base per minute. Takes effect within about a minute, no restart.',
  },
];

const PAUSE_FIELDS: FieldDef[] = [
  {
    key: 'importPauseAtUnits',
    label: 'Pause imports at (queued work units)',
    hint: 'Imports stop adding work to the queue above this size. They resume once it falls below the next value.',
  },
  {
    key: 'importResumeAtUnits',
    label: 'Resume imports at',
    hint: 'Paused imports start again when the queue is below this size. Must be lower than the pause value.',
  },
  {
    key: 'livePollCeilingUnits',
    label: 'New-mail checks pause at',
    hint: 'A safety limit: new mail for other workspaces keeps flowing until the queue reaches this size. Must not be below the pause value.',
  },
];
/** Outgoing: a ticket reply to many threads (contingency page, 2026-10-19). */
const SEND_FIELDS: FieldDef[] = [
  {
    key: 'ticketReplyGapSeconds',
    label: 'Gap between ticket-reply emails (seconds)',
    hint: 'A reply sent from a ticket to many threads goes out one email at a time, this many seconds apart, so a mailbox never sends a burst. 0 = no gap.',
  },
];
/** Attachment retry (Gmail and IMAP), then the pacing that keeps a Gmail mailbox under Google's quota. */
const GMAIL_FIELDS: FieldDef[] = [
  {
    key: 'attachmentRefetchPerRun',
    label: 'Attachment refetch per check (Gmail and IMAP)',
    hint: 'Attachments that failed to download or save are tried again, this many per mailbox check, for Gmail and IMAP mailboxes alike. 0 = off for both.',
  },
  {
    key: 'pacedUnitsPerMinute',
    label: 'Gmail units per minute',
    hint: 'How much Gmail work one mailbox may do per minute. Google allows 15,000 per minute per mailbox; this and the burst value together must stay below it.',
  },
  {
    key: 'burstUnits',
    label: 'Gmail burst units',
    hint: 'How much extra work a mailbox may do at once before the per-minute pace applies. Together with units per minute it must stay below Google’s 15,000.',
  },
  {
    key: 'cooldownSeconds',
    label: 'Gmail cooldown after a refusal (seconds)',
    hint: 'When Google refuses a request for being too fast, the mailbox waits this long before trying again.',
  },
  {
    key: 'bulkFetchMax',
    label: 'Parallel fetches — import',
    hint: 'How many messages are downloaded at the same time while importing old mail. Lower is gentler on Google’s limit.',
  },
  {
    key: 'pollFetchMax',
    label: 'Parallel fetches — new mail',
    hint: 'How many messages are downloaded at the same time when checking for new mail.',
  },
];
/** Google's own per-minute limit for one mailbox; paced + burst must stay below it. */
const GMAIL_UNIT_LIMIT = 15000;
const FIELDS: FieldDef[] = [...RATE_FIELDS, ...PAUSE_FIELDS, ...SEND_FIELDS, ...GMAIL_FIELDS];

/** The text as a whole number inside the field's bounds, or null. */
const asBounded = (text: string, field: BoundedField): number | null => {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= field.min && value <= field.max
    ? value
    : null;
};

/**
 * Platform Defaults → Mail import (2026-10-18): the import run budget and the per-minute rate of
 * the attachment and KB-message queues, saved with a PARTIAL PUT /api/admin/platform/settings/
 * ingestion (only the fields that changed). Each field shows only when the backend reports it; with
 * none reported (an older backend) the card says why instead of offering a save with no route.
 */
export const IngestionCard = ({ ingestion }: { ingestion: IngestionSettings | undefined }) => {
  const save = useUpdatePlatformIngestion();
  const shown = FIELDS.filter((field) => ingestion?.[field.key] !== undefined);
  const seed = () =>
    Object.fromEntries(shown.map((field) => [field.key, String(ingestion?.[field.key]?.value)]));
  const seedKey = shown.map((field) => `${field.key}=${ingestion?.[field.key]?.value}`).join('|');
  const [texts, setTexts] = useState<Record<string, string>>(seed);
  // Re-seed when the saved values arrive or change (the query refetches after a save).
  useEffect(() => {
    setTexts(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seedKey stands for the saved values
  }, [seedKey]);

  const changed: PlatformIngestionInput = {};
  let invalid = false;
  for (const field of shown) {
    const saved = ingestion?.[field.key];
    if (!saved) continue;
    const text = texts[field.key] ?? String(saved.value);
    const value = asBounded(text, saved);
    if (value === null) invalid = true;
    else if (value !== saved.value) changed[field.key] = value;
  }
  // The pause rules the server enforces, read from what is typed (a blank or bad number is
  // already flagged by its own bounds message).
  const typed = (key: FieldKey): number | null => {
    const saved = ingestion?.[key];
    return saved ? asBounded(texts[key] ?? String(saved.value), saved) : null;
  };
  const pauseAt = typed('importPauseAtUnits');
  const resumeAt = typed('importResumeAtUnits');
  const ceiling = typed('livePollCeilingUnits');
  const crossErrors: Partial<Record<FieldKey, string>> = {};
  if (pauseAt !== null && resumeAt !== null && resumeAt >= pauseAt)
    crossErrors.importResumeAtUnits = 'Must be lower than the pause value.';
  if (pauseAt !== null && ceiling !== null && ceiling < pauseAt)
    crossErrors.livePollCeilingUnits = 'Must not be lower than the pause value.';
  const paced = typed('pacedUnitsPerMinute');
  const burst = typed('burstUnits');
  if (paced !== null && burst !== null && paced + burst >= GMAIL_UNIT_LIMIT)
    crossErrors.burstUnits = crossErrors.pacedUnitsPerMinute = `Units per minute plus burst must stay below ${GMAIL_UNIT_LIMIT.toLocaleString('en-US')}.`;
  if (Object.keys(crossErrors).length > 0) invalid = true;
  const serverError = save.isError ? getApiErrorMessage(save.error) : undefined;
  const nothingChanged = Object.keys(changed).length === 0;

  const renderGrid = (list: FieldDef[]) => (
    <div className="grid gap-3 sm:grid-cols-3">
      {list
        .filter((field) => ingestion?.[field.key] !== undefined)
        .map((field) => {
          const saved = ingestion?.[field.key];
          if (!saved) return null;
          const text = texts[field.key] ?? String(saved.value);
          const bad = asBounded(text, saved) === null;
          const cross = crossErrors[field.key];
          return (
            <div key={field.key} className="space-y-1">
              <Input
                type="number"
                min={saved.min}
                max={saved.max}
                step={1}
                label={field.label}
                value={text}
                error={bad ? `Enter a whole number from ${saved.min} to ${saved.max}.` : cross}
                onChange={(event) => {
                  save.reset();
                  setTexts((current) => ({ ...current, [field.key]: event.target.value }));
                }}
              />
              <p className="text-xs text-muted-foreground">{field.hint}</p>
              <SourceBadge source={saved.source} />
            </div>
          );
        })}
    </div>
  );

  return (
    <Card data-config-card="Mail import">
      <CardHeader>
        <CardTitle className="flex gap-2 items-center text-xl">
          <Inbox className="w-5 h-5" />
          Mail import
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">{INGESTION_NOT_DEPLOYED}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              How fast a large mailbox import is processed. Only the values you change are saved.
            </p>
            {renderGrid(RATE_FIELDS)}
            {PAUSE_FIELDS.some((field) => ingestion?.[field.key] !== undefined) && (
              <>
                <h3 className="text-sm font-medium pt-2">When imports pause</h3>
                <p className="text-sm text-muted-foreground">
                  Big imports are held back while the work queue is long, so new mail is never stuck
                  behind them.
                </p>
                {renderGrid(PAUSE_FIELDS)}
              </>
            )}
            {SEND_FIELDS.some((field) => ingestion?.[field.key] !== undefined) && (
              <>
                <h3 className="text-sm font-medium pt-2">Ticket replies</h3>
                {renderGrid(SEND_FIELDS)}
              </>
            )}
            {GMAIL_FIELDS.some((field) => ingestion?.[field.key] !== undefined) && (
              <>
                <h3 className="text-sm font-medium pt-2">Gmail</h3>
                <p className="text-sm text-muted-foreground">
                  Keeps each Gmail mailbox under Google&rsquo;s quota, and fetches again the
                  attachments that quota made fail.
                </p>
                {renderGrid(GMAIL_FIELDS)}
              </>
            )}
            {serverError && (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            )}
            <Button
              disabled={save.isPending || invalid || nothingChanged}
              onClick={() => save.mutate(changed)}
            >
              Save
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
