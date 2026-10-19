import { useEffect, useState } from 'react';
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

const FIELDS: { key: FieldKey; label: string; hint: string }[] = [
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
  const nothingChanged = Object.keys(changed).length === 0;

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
            <div className="grid gap-3 sm:grid-cols-3">
              {shown.map((field) => {
                const saved = ingestion?.[field.key];
                if (!saved) return null;
                const text = texts[field.key] ?? String(saved.value);
                const bad = asBounded(text, saved) === null;
                return (
                  <div key={field.key} className="space-y-1">
                    <Input
                      type="number"
                      min={saved.min}
                      max={saved.max}
                      step={1}
                      label={field.label}
                      value={text}
                      error={
                        bad ? `Enter a whole number from ${saved.min} to ${saved.max}.` : undefined
                      }
                      onChange={(event) =>
                        setTexts((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">{field.hint}</p>
                    <SourceBadge source={saved.source} />
                  </div>
                );
              })}
            </div>
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
