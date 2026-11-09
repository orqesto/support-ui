import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { useUpdatePlatformIngestion } from '@/hooks/usePlatformSettings';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { FieldSource } from '@/services/platformSettings.service';
import type {
  PlatformPresenceInput,
  PresenceNumberField,
  PresenceSettingsView,
} from '@/services/presenceSettings';

export const PRESENCE_NOT_DEPLOYED =
  'This server does not have thread presence settings yet — they arrive with the next backend release.';

type FieldDef = { key: PresenceNumberField; label: string; hint: string; seconds: boolean };

const FIELDS: FieldDef[] = [
  {
    key: 'heartbeatMs',
    label: 'Heartbeat (seconds)',
    hint: 'How often an open thread tells the server it is still being looked at.',
    seconds: true,
  },
  {
    key: 'expiryMs',
    label: 'Expiry (seconds)',
    hint: 'How long without a heartbeat before someone is no longer shown. At least twice the heartbeat.',
    seconds: true,
  },
  {
    key: 'writingIdleMs',
    label: 'Writing idle (seconds)',
    hint: 'How long after the last keystroke someone still counts as writing.',
    seconds: true,
  },
  {
    key: 'awayAfterMs',
    label: 'Away after (seconds)',
    hint: 'How long a thread can sit untouched before the person is shown as away.',
    seconds: true,
  },
  {
    key: 'listFlushMs',
    label: 'List update interval (seconds)',
    hint: 'How often the ticket and thread lists receive presence changes.',
    seconds: true,
  },
  {
    key: 'ticketWatchCap',
    label: 'Threads watched per ticket list',
    hint: 'How many threads of one ticket list show presence.',
    seconds: false,
  },
];

const toDisplay = (def: FieldDef, stored: number): string =>
  String(def.seconds ? stored / 1000 : stored);

/** Typed text -> the stored unit (ms or count) when it is a whole number inside the server bounds. */
const toStored = (def: FieldDef, text: string, min: number, max: number): number | null => {
  const typed = Number(text);
  if (text.trim() === '' || !Number.isFinite(typed)) return null;
  const stored = def.seconds ? Math.round(typed * 1000) : typed;
  return Number.isInteger(stored) && stored >= min && stored <= max ? stored : null;
};

const SOURCE_LABEL: Record<FieldSource, string> = {
  db: 'saved',
  env: 'default',
  default: 'default',
};
const PresenceSource = ({ source }: { source: FieldSource }) => (
  <Badge variant={source === 'db' ? 'success' : 'secondary'} size="sm">
    {SOURCE_LABEL[source] ?? 'default'}
  </Badge>
);

/**
 * Platform Defaults -> Thread presence (2026-11-09): who is looking at / writing in a thread. Times
 * are shown in seconds and saved in ms; only the fields that changed are sent, in the `presence`
 * block of PUT /settings/ingestion. A refused save (400 with the fields at fault) is shown inline
 * and the typed values stay.
 */
export const PresenceCard = ({ presence }: { presence: PresenceSettingsView | undefined }) => {
  const save = useUpdatePlatformIngestion();
  const seed = (): Record<string, string> =>
    presence
      ? Object.fromEntries(FIELDS.map((def) => [def.key, toDisplay(def, presence[def.key].value)]))
      : {};
  const seedKey = presence
    ? `${presence.enabled.value}|${FIELDS.map((def) => presence[def.key].value).join('|')}`
    : '';
  const [texts, setTexts] = useState<Record<string, string>>(seed);
  const [enabled, setEnabled] = useState<boolean | undefined>(presence?.enabled.value);
  // Re-seed when the saved values arrive or change (the query refetches after a save).
  useEffect(() => {
    setTexts(seed());
    setEnabled(presence?.enabled.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seedKey stands for the saved values
  }, [seedKey]);

  if (!presence) {
    return (
      <Card data-config-card="Thread presence">
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-xl">
            <Eye className="w-5 h-5" />
            Thread presence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{PRESENCE_NOT_DEPLOYED}</p>
        </CardContent>
      </Card>
    );
  }

  const changed: PlatformPresenceInput = {};
  let invalid = false;
  if (enabled !== undefined && enabled !== presence.enabled.value) changed.enabled = enabled;
  for (const def of FIELDS) {
    const saved = presence[def.key];
    const value = toStored(
      def,
      texts[def.key] ?? toDisplay(def, saved.value),
      saved.min,
      saved.max
    );
    if (value === null) invalid = true;
    else if (value !== saved.value) changed[def.key] = value;
  }
  const nothingChanged = Object.keys(changed).length === 0;
  const serverError = save.isError ? getApiErrorMessage(save.error) : undefined;
  const bound = (def: FieldDef, limit: number) => (def.seconds ? limit / 1000 : limit);

  return (
    <Card data-config-card="Thread presence">
      <CardHeader>
        <CardTitle className="flex gap-2 items-center text-xl">
          <Eye className="w-5 h-5" />
          Thread presence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Shows agents who else is looking at a thread or writing in it. Only the values you change
          are saved.
        </p>
        <div className="space-y-1">
          <Checkbox
            label="Enabled"
            checked={enabled ?? presence.enabled.value}
            onChange={(event) => {
              save.reset();
              setEnabled(event.target.checked);
            }}
          />
          <PresenceSource source={presence.enabled.source} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {FIELDS.map((def) => {
            const saved = presence[def.key];
            const text = texts[def.key] ?? toDisplay(def, saved.value);
            const bad = toStored(def, text, saved.min, saved.max) === null;
            const lo = bound(def, saved.min);
            const hi = bound(def, saved.max);
            return (
              <div key={def.key} className="space-y-1">
                <Input
                  type="number"
                  min={lo}
                  max={hi}
                  step={def.seconds ? 'any' : 1}
                  label={def.label}
                  value={text}
                  error={bad ? `Enter a number from ${lo} to ${hi}.` : undefined}
                  onChange={(event) => {
                    save.reset();
                    setTexts((current) => ({ ...current, [def.key]: event.target.value }));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {def.hint} Allowed: {lo} to {hi}.
                </p>
                <PresenceSource source={saved.source} />
              </div>
            );
          })}
        </div>
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        <Button
          disabled={save.isPending || invalid || nothingChanged}
          onClick={() => save.mutate({ presence: changed })}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
};
