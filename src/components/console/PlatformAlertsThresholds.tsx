import { useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import {
  fillPlatformThresholds,
  platformSlackAlertsService,
  type PlatformSlackStatus,
  type PlatformSlackThresholds,
} from '@/services/slackNotifications.service';

/**
 * Admin console › Platform › Alerts › Thresholds. One form, one save at a time; it sends the FULL
 * thresholds object (an older backend replaced the stored thresholds with whatever it got; the
 * current one merges, so the full object is right for both). On success the form shows what the
 * server returned; on a failed save it keeps what the admin typed and says why, inline.
 */

/** The page's one save queue: each settings PUT starts only after the previous one settled. */
export type SerialSave = (task: () => Promise<PlatformSlackStatus>) => Promise<PlatformSlackStatus>;

export type ThresholdField = {
  /** `group.field`, or `quietMinutes`. */
  path: string;
  label: string;
  min: number;
  max: number;
  /** The backend refuses a fraction here (percentages may be fractional). */
  integer: boolean;
};

const percentField = (path: string, label: string): ThresholdField => ({
  path,
  label,
  min: 1,
  max: 100,
  integer: false,
});
const minutesField = (path: string, label: string): ThresholdField => ({
  path,
  label,
  min: 1,
  max: 1440,
  integer: true,
});

/** Bounds copied from `platformSlackThresholdsSchema` (support-service). */
const THRESHOLD_GROUPS: { title: string; fields: ThresholdField[] }[] = [
  {
    title: 'CPU',
    fields: [
      percentField('cpu.percent', 'CPU above (%)'),
      minutesField('cpu.sustainedMinutes', 'CPU for at least (minutes)'),
    ],
  },
  {
    title: 'Memory (heap or RSS)',
    fields: [
      percentField('memory.percentOfBudget', 'Memory above (% of budget)'),
      minutesField('memory.sustainedMinutes', 'Memory for at least (minutes)'),
    ],
  },
  {
    title: 'Database connection pool',
    fields: [
      percentField('dbPool.warnPercent', 'Pool use warning (%)'),
      percentField('dbPool.critPercent', 'Pool use critical (%)'),
    ],
  },
  {
    title: 'Database health',
    fields: [
      minutesField('dbHealth.unreachableMinutes', 'Unreachable for (minutes)'),
      {
        path: 'dbHealth.p95Ms',
        label: 'Health query p95 above (ms)',
        min: 50,
        max: 60_000,
        integer: true,
      },
      minutesField('dbHealth.p95SustainedMinutes', 'Slow for at least (minutes)'),
    ],
  },
  {
    title: 'Event-loop lag',
    fields: [
      {
        path: 'eventLoop.warnMs',
        label: 'Event-loop lag warning (ms)',
        min: 1,
        max: 60_000,
        integer: true,
      },
      {
        path: 'eventLoop.critMs',
        label: 'Event-loop lag critical (ms)',
        min: 1,
        max: 60_000,
        integer: true,
      },
    ],
  },
  {
    title: 'Rate limiter',
    fields: [
      {
        path: 'rate429.warnPerWindow',
        label: 'Rejected requests warning (per sample window)',
        min: 1,
        max: 1_000_000,
        integer: true,
      },
      {
        path: 'rate429.critPerWindow',
        label: 'Rejected requests critical (per sample window)',
        min: 1,
        max: 1_000_000,
        integer: true,
      },
    ],
  },
  {
    title: 'Queue backlog',
    fields: [
      {
        path: 'queueBacklog.waiting',
        label: 'Waiting jobs above',
        min: 1,
        max: 10_000_000,
        integer: true,
      },
      minutesField('queueBacklog.sustainedMinutes', 'Backlog for at least (minutes)'),
    ],
  },
  { title: 'Disk', fields: [percentField('disk.percent', 'Disk usage above (%)')] },
  {
    title: 'Repeats',
    fields: [minutesField('quietMinutes', 'Repeat a still-open alert after (minutes)')],
  },
];

const ALL_THRESHOLD_FIELDS = THRESHOLD_GROUPS.flatMap((group) => group.fields);

type ThresholdDraft = Record<string, string>;

const readPath = (thresholds: PlatformSlackThresholds, path: string): number => {
  const [group, field] = path.split('.');
  const value = (thresholds as unknown as Record<string, unknown>)[group];
  return (field ? (value as Record<string, number>)[field] : value) as number;
};

const draftFromThresholds = (thresholds: PlatformSlackThresholds): ThresholdDraft =>
  Object.fromEntries(
    ALL_THRESHOLD_FIELDS.map((field) => [field.path, String(readPath(thresholds, field.path))])
  );

export const fieldError = (field: ThresholdField, raw: string): string | undefined => {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) return 'Enter a number.';
  if (value < field.min || value > field.max) {
    return `Enter a number between ${field.min.toLocaleString()} and ${field.max.toLocaleString()}.`;
  }
  if (field.integer && !Number.isInteger(value)) return 'Enter a whole number.';
  return undefined;
};

/**
 * Each warning level must be below its critical level, or the critical alert can never fire.
 * Mirrors `WARN_BELOW_CRIT` in support-service `slackConnectionService.ts` (400 there).
 */
const WARN_BELOW_CRIT: ReadonlyArray<[warn: string, crit: string]> = [
  ['dbPool.warnPercent', 'dbPool.critPercent'],
  ['eventLoop.warnMs', 'eventLoop.critMs'],
  ['rate429.warnPerWindow', 'rate429.critPerWindow'],
];

const BELOW_CRIT_MESSAGE = 'The warning level must be below the critical level.';

/** The FULL thresholds object: the settings PUT replaces the stored one with it. */
const thresholdsFromDraft = (draft: ThresholdDraft): PlatformSlackThresholds => {
  const grouped: Record<string, unknown> = {};
  for (const field of ALL_THRESHOLD_FIELDS) {
    const [group, key] = field.path.split('.');
    const value = Number(draft[field.path]);
    if (key) grouped[group] = { ...(grouped[group] as object), [key]: value };
    else grouped[group] = value;
  }
  return fillPlatformThresholds(grouped);
};

export const ThresholdsCard = ({
  thresholds,
  serialSave,
  locked = false,
}: {
  /** As the service normalised them (defaults already filled). */
  thresholds: PlatformSlackThresholds;
  /** The page's one save queue: this card's PUT never overlaps the channel and signals card's. */
  serialSave: SerialSave;
  /** Out of use while the page disconnects Slack (the Disconnect rewrites the same setting). */
  locked?: boolean;
}) => {
  const [draft, setDraft] = useState<ThresholdDraft>(() => draftFromThresholds(thresholds));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The lock as of now, not as of the last render: a second click in the same tick must see it.
  const savingRef = useRef(false);

  const save = () => {
    if (savingRef.current || locked) return;
    const found: Record<string, string> = {};
    for (const field of ALL_THRESHOLD_FIELDS) {
      const message = fieldError(field, draft[field.path] ?? '');
      if (message) found[field.path] = message;
    }
    for (const [warn, crit] of WARN_BELOW_CRIT) {
      if (found[warn] || found[crit]) continue;
      if (Number(draft[warn]) >= Number(draft[crit])) found[warn] = BELOW_CRIT_MESSAGE;
    }
    setErrors(found);
    setSaveError(null);
    if (Object.keys(found).length > 0) return;
    savingRef.current = true;
    setSaving(true);
    const body = { thresholds: thresholdsFromDraft(draft) };
    serialSave(() => platformSlackAlertsService.saveSettings(body))
      .then((saved) => {
        setDraft(draftFromThresholds(saved.settings.thresholds));
        toast.success('Thresholds saved');
      })
      .catch((err: unknown) => {
        // The typed values stay: the admin fixes what the server refused instead of retyping.
        setSaveError(`The thresholds were not saved: ${getApiErrorMessage(err) ?? 'try again.'}`);
      })
      .finally(() => {
        savingRef.current = false;
        setSaving(false);
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thresholds</CardTitle>
        <CardDescription>
          When each signal posts. Warning and critical levels post at their own level. One post when
          a threshold is crossed; it is updated when the value recovers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {THRESHOLD_GROUPS.map((group) => (
          <div key={group.title}>
            <h4 className="mb-2 text-sm font-semibold">{group.title}</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((field) => (
                <Input
                  key={field.path}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.integer ? 1 : 'any'}
                  label={field.label}
                  value={draft[field.path] ?? ''}
                  error={errors[field.path]}
                  disabled={saving || locked}
                  onChange={(event) => {
                    setDraft({ ...draft, [field.path]: event.target.value });
                    // A pair's "below the critical level" sits on the warning field: changing
                    // either field of the pair clears it (Save checks the pair again).
                    const pair = WARN_BELOW_CRIT.find((each) => each.includes(field.path));
                    setErrors(({ [field.path]: _dropped, ...rest }) =>
                      pair && rest[pair[0]] === BELOW_CRIT_MESSAGE
                        ? Object.fromEntries(
                            Object.entries(rest).filter(([path]) => path !== pair[0])
                          )
                        : rest
                    );
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        {saveError && (
          <Alert variant="danger">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
        <Button onClick={save} isLoading={saving} disabled={saving || locked}>
          Save thresholds
        </Button>
      </CardContent>
    </Card>
  );
};
