import { useRef, useState } from 'react';
import {
  fieldError,
  type SerialSave,
  type ThresholdField,
} from '@/components/console/PlatformAlertsThresholds';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import {
  platformSlackAlertsService,
  type SlackPostRetention,
} from '@/services/slackNotifications.service';

/**
 * Admin console › Platform › Alerts › Slack post retention (deployment-wide). The daily cleanup
 * deletes workspace Slack posts that ENDED more than `days` ago, in steps of `chunkSize` rows, at
 * most `maxChunksPerWorkspace` steps per workspace per run. Saved through the page's save queue
 * as the `postRetention` group only (the backend merges it). A failed save keeps what was typed.
 */

type RetentionKey = keyof SlackPostRetention;

/** Bounds copied from `slackPostRetentionSchema` (support-service); all whole numbers. */
const RETENTION_FIELDS: (ThresholdField & { path: RetentionKey })[] = [
  {
    path: 'days',
    label: 'Delete ended Slack posts after (days)',
    min: 7,
    max: 3650,
    integer: true,
  },
  { path: 'chunkSize', label: 'Posts deleted per step', min: 50, max: 5000, integer: true },
  {
    path: 'maxChunksPerWorkspace',
    label: 'Steps per workspace per daily run',
    min: 1,
    max: 1000,
    integer: true,
  },
];

type RetentionDraft = Record<RetentionKey, string>;

const draftFrom = (retention: SlackPostRetention): RetentionDraft => ({
  days: String(retention.days),
  chunkSize: String(retention.chunkSize),
  maxChunksPerWorkspace: String(retention.maxChunksPerWorkspace),
});

export const RetentionCard = ({
  retention,
  serialSave,
  locked = false,
}: {
  retention: SlackPostRetention;
  serialSave: SerialSave;
  /** Out of use while the page disconnects Slack. */
  locked?: boolean;
}) => {
  const [draft, setDraft] = useState<RetentionDraft>(() => draftFrom(retention));
  const [errors, setErrors] = useState<Partial<Record<RetentionKey, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const save = () => {
    if (savingRef.current || locked) return;
    const found: Partial<Record<RetentionKey, string>> = {};
    for (const field of RETENTION_FIELDS) {
      const message = fieldError(field, draft[field.path]);
      if (message) found[field.path] = message;
    }
    setErrors(found);
    setSaveError(null);
    if (Object.keys(found).length > 0) return;
    savingRef.current = true;
    setSaving(true);
    const body = {
      postRetention: {
        days: Number(draft.days),
        chunkSize: Number(draft.chunkSize),
        maxChunksPerWorkspace: Number(draft.maxChunksPerWorkspace),
      },
    };
    serialSave(() => platformSlackAlertsService.saveSettings(body))
      .then((saved) => {
        if (saved.settings.postRetention) setDraft(draftFrom(saved.settings.postRetention));
        toast.success('Retention saved');
      })
      .catch((err: unknown) => {
        setSaveError(`The retention was not saved: ${getApiErrorMessage(err) ?? 'try again.'}`);
      })
      .finally(() => {
        savingRef.current = false;
        setSaving(false);
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slack post retention</CardTitle>
        <CardDescription>
          For every workspace: Odly keeps a record of each Slack post so it can update it later.
          Once the alert behind a post has ended, its record is deleted after this many days. Open
          posts are never deleted. The daily cleanup deletes in steps, so a large backlog is cleared
          over a few days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RETENTION_FIELDS.map((field) => (
            <Input
              key={field.path}
              type="number"
              min={field.min}
              max={field.max}
              step={1}
              label={field.label}
              value={draft[field.path]}
              error={errors[field.path]}
              disabled={saving || locked}
              onChange={(event) => {
                setDraft({ ...draft, [field.path]: event.target.value });
                setErrors(({ [field.path]: _dropped, ...rest }) => rest);
              }}
            />
          ))}
        </div>
        {saveError && (
          <Alert variant="danger">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
        <Button onClick={save} isLoading={saving} disabled={saving || locked}>
          Save retention
        </Button>
      </CardContent>
    </Card>
  );
};
