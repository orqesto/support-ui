import { useState } from 'react';
import { HardDrive, TestTube2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import {
  useClearPlatformSecret,
  useSetPlatformSecret,
  useTestPlatformStorage,
  useUpdatePlatformStorage,
} from '@/hooks/usePlatformSettings';
import type {
  DefaultStorageInput,
  PlatformSettings,
  StorageTestResult,
} from '@/services/platformSettings.service';
import { SecretField } from './SecretField';
import { SourceBadge } from './SourceBadge';

type Storage = PlatformSettings['storage'];
type TextKey = 'endpoint' | 'region' | 'bucket' | 'prefix' | 'roleArn' | 'externalId';

/**
 * Three modes, ordered by how a managed platform should actually store files:
 *  - `s3-env`   use the S3 target the environment already provides (only offered
 *               when it does), so an operator who filled in S3_* doesn't have to
 *               retype it here.
 *  - `s3`       configure an S3 target in the console. The primary option when
 *               the environment has none; the second when it does.
 *  - `local`    single-node disk. Last, and labelled as the fallback it is —
 *               it does not survive a container rebuild and can't be shared
 *               across replicas.
 */
type Mode = 's3-env' | 's3' | 'local';

const TEXT_FIELDS: { key: TextKey; label: string; placeholder: string; hint?: string }[] = [
  { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket' },
  {
    key: 'endpoint',
    label: 'Endpoint',
    placeholder: 'https://fsn1.your-objectstorage.com (blank = AWS)',
  },
  { key: 'region', label: 'Region', placeholder: 'eu-central-1' },
  { key: 'prefix', label: 'Key prefix', placeholder: 'optional/' },
  {
    key: 'roleArn',
    label: 'AssumeRole ARN (optional)',
    placeholder: 'arn:aws:iam::123456789012:role/OdlyS3',
    hint: 'Assume a cross-account IAM role via STS instead of static keys. Leave both keys below blank when using this.',
  },
  {
    key: 'externalId',
    label: 'External ID (optional)',
    placeholder: 'confused-deputy guard — must match the role trust policy',
  },
];

/** Which mode the saved/resolved config corresponds to. */
const initialMode = (storage: Storage): Mode => {
  if (storage.driver.value === 'local') return 'local';
  // Any console-set S3 field means the target was configured here, not inherited.
  const consoleConfigured = (['bucket', 'endpoint', 'region', 'prefix', 'roleArn'] as const).some(
    (key) => storage[key].source === 'db'
  );
  if (!consoleConfigured && storage.envS3Configured) return 's3-env';
  return 's3';
};

/** The stored values this form mirrors, seeded into local state. */
const seedText = (storage: Storage): Record<TextKey, string> => ({
  endpoint: storage.endpoint.value ?? '',
  region: storage.region.value ?? '',
  bucket: storage.bucket.value ?? '',
  prefix: storage.prefix.value ?? '',
  roleArn: storage.roleArn.value ?? '',
  externalId: storage.externalId.value ?? '',
});

/**
 * Identity of the STORED config. Re-seeding is keyed on this rather than on the
 * prop object, whose reference changes on every refetch.
 */
const storedSnapshot = (storage: Storage): string =>
  JSON.stringify([
    storage.driver.value,
    seedText(storage),
    storage.forcePathStyle.value ?? false,
  ]);

export const DefaultStorageCard = ({ storage }: { storage: Storage }) => {
  const [mode, setMode] = useState<Mode>(() => initialMode(storage));
  const [text, setText] = useState<Record<TextKey, string>>(() => seedText(storage));
  const [forcePathStyle, setForcePathStyle] = useState<boolean>(storage.forcePathStyle.value ?? false);
  // A successful test is required before Save can persist an S3 target; any edit
  // to the config invalidates it (the green must reflect the config being saved).
  const [testResult, setTestResult] = useState<StorageTestResult | null>(null);

  /**
   * Re-seed whenever the STORED config changes — after our own save, or after
   * another operator's.
   *
   * The state hooks above are seeded by `useState` INITIALISERS, which run only
   * on mount. `useUpdatePlatformStorage` invalidates on success, so `storage`
   * refetches and the source badges update, but the inputs kept whatever was
   * typed. A value the server normalised, rejected, or never stored therefore
   * stayed on screen looking saved — the form could show something that was not
   * the config. Seeding from the snapshot makes it show what IS stored.
   *
   * Keyed on the serialised STORED values, so the refetches React Query issues
   * on window focus are a no-op unless the config genuinely changed, and never
   * interrupt an edit in progress.
   */
  const snapshot = storedSnapshot(storage);
  const [seededFrom, setSeededFrom] = useState(snapshot);
  if (seededFrom !== snapshot) {
    setSeededFrom(snapshot);
    setMode(initialMode(storage));
    setText(seedText(storage));
    setForcePathStyle(storage.forcePathStyle.value ?? false);
    // The green belonged to the config as it was BEFORE this change.
    setTestResult(null);
  }

  const update = useUpdatePlatformStorage();
  const test = useTestPlatformStorage();
  const setSecret = useSetPlatformSecret();
  const clearSecret = useClearPlatformSecret();

  /**
   * A successful probe is the last thing on screen and reads like completion, but
   * Save sits below it and is a separate click — so a tested-but-unsaved config
   * looked identical to a stored one. The probe result now says so explicitly,
   * and a save replaces it with its own confirmation.
   */
  const [saved, setSaved] = useState(false);

  const invalidateTest = () => {
    setTestResult(null);
    setSaved(false);
  };
  const setTextField = (key: TextKey, value: string) => {
    setText((prev) => ({ ...prev, [key]: value }));
    invalidateTest();
  };

  // `s3-env` deliberately sends NO field overrides: the row records the driver
  // choice only, so every value keeps resolving from the environment and stays
  // in sync when an operator edits it there.
  const payload = (): DefaultStorageInput => {
    if (mode === 'local') return { driver: 'local' };
    if (mode === 's3-env') return { driver: 's3' };
    return {
      driver: 's3',
      endpoint: text.endpoint.trim() || undefined,
      region: text.region.trim() || undefined,
      bucket: text.bucket.trim() || undefined,
      prefix: text.prefix.trim() || undefined,
      roleArn: text.roleArn.trim() || undefined,
      externalId: text.externalId.trim() || undefined,
      forcePathStyle,
    };
  };

  const runTest = () => {
    test.mutate(payload(), {
      onSuccess: (result) => setTestResult(result),
      onError: (err) =>
        setTestResult({
          ok: false,
          latencyMs: 0,
          error: err instanceof Error ? err.message : 'Test failed',
        }),
    });
  };

  const save = () =>
    update.mutate(payload(), {
      onSuccess: () => {
        setSaved(true);
        // The probe described the config as a candidate; it is now the stored one.
        setTestResult(null);
      },
    });

  const isS3 = mode !== 'local';
  const saveDisabled = isS3 && !testResult?.ok;
  // The console pre-selects S3 as soon as the environment carries a usable
  // bucket, but nothing moves until it's saved — say so rather than letting the
  // dropdown imply files are already going there.
  const envS3NotYetEffective =
    storage.envS3Configured && storage.effectiveDriver === 'local' && storage.driver.source !== 'db';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <HardDrive className="w-5 h-5 text-primary" />
          Default Storage
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Where the platform stores attachments by default (workspaces can still override
          per-tenant). Credentials are stored encrypted; test an S3 target before saving.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex gap-2 items-center mb-2">
            <Label className="mb-0">Storage backend</Label>
            <SourceBadge source={storage.driver.source} unsetLabel="Not set" />
          </div>
          <Select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as Mode);
              invalidateTest();
            }}
          >
            {storage.envS3Configured && (
              <option value="s3-env">
                S3 — use the environment&apos;s configuration
                {storage.bucket.value ? ` (${storage.bucket.value})` : ''}
              </option>
            )}
            <option value="s3">S3 / compatible — configure here</option>
            <option value="local">Local disk — fallback, single node only</option>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            Local disk keeps files on the container&apos;s own filesystem: it is lost on a rebuild
            and cannot be shared across replicas. Use it only for local development or a
            single-node self-hosted install.
          </p>
        </div>

        {envS3NotYetEffective && (
          <Alert variant="info">
            S3 settings were found in the environment, but attachments are still being written to
            local disk. Test the connection and save to switch the platform over.
          </Alert>
        )}

        {mode === 's3-env' && (
          <div className="p-4 space-y-2 rounded-md border border-border bg-muted/30">
            <p className="text-sm text-muted-foreground">
              These values resolve from the environment and stay in sync when it changes. Pick
              &ldquo;configure here&rdquo; to override them in the console instead.
            </p>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {TEXT_FIELDS.filter(({ key }) => storage[key].value).map(({ key, label }) => (
                <div key={key} className="flex gap-2 justify-between">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{storage[key].value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {mode === 's3' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {TEXT_FIELDS.map(({ key, label, placeholder, hint }) => (
                <div key={key}>
                  <div className="flex gap-2 items-center mb-2">
                    <Label className="mb-0">{label}</Label>
                    <SourceBadge source={storage[key].source} unsetLabel="Not set" />
                  </div>
                  <Input
                    value={text[key]}
                    onChange={(event) => setTextField(key, event.target.value)}
                    placeholder={placeholder}
                  />
                  {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
                </div>
              ))}
            </div>

            <div className="flex gap-2 items-center">
              <Toggle
                checked={forcePathStyle}
                onChange={(next) => {
                  setForcePathStyle(next);
                  invalidateTest();
                }}
                label="Force path-style addressing (MinIO / non-AWS)"
              />
              <SourceBadge source={storage.forcePathStyle.source} unsetLabel="Not set" />
            </div>
          </>
        )}

        {isS3 && (
          <>
            <div className="pt-4 space-y-4 border-t border-border">
              <SecretField
                label="Access key ID"
                status={storage.accessKeyId}
                onSave={(value) => setSecret.mutate({ key: 'storage.s3_access_key_id', value })}
                onClear={() => clearSecret.mutate('storage.s3_access_key_id')}
                saving={setSecret.isPending}
                clearing={clearSecret.isPending}
              />
              <SecretField
                label="Secret access key"
                status={storage.secretAccessKey}
                onSave={(value) => setSecret.mutate({ key: 'storage.s3_secret_access_key', value })}
                onClear={() => clearSecret.mutate('storage.s3_secret_access_key')}
                saving={setSecret.isPending}
                clearing={clearSecret.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Leave both blank to use an assumed role (above) or the server&apos;s own AWS
                identity — an EC2 instance profile, ECS task role, or IRSA. A custom endpoint has
                no ambient identity to fall back on, so it always needs keys.
              </p>
            </div>

            <div className="flex gap-3 items-center">
              <Button variant="outline" onClick={runTest} isLoading={test.isPending}>
                <TestTube2 className="mr-2 w-4 h-4" />
                Test connection
              </Button>
              {testResult && (
                <span className={`text-sm ${testResult.ok ? 'text-success' : 'text-danger'}`}>
                  {testResult.ok
                    ? `Connection OK · ${testResult.latencyMs}ms — not saved yet`
                    : `Failed: ${testResult.error ?? 'unknown error'}`}
                </span>
              )}
            </div>
          </>
        )}

        {saveDisabled && (
          <Alert variant="info">
            Run a successful connection test before saving an S3 target — the probe writes, reads
            back, and deletes a small object, so a passing test means uploads will work.
          </Alert>
        )}

        <div className="flex gap-3 justify-end items-center">
          {saved && (
            <Badge variant="success" size="sm">
              Saved
            </Badge>
          )}
          <Button onClick={save} isLoading={update.isPending} disabled={saveDisabled}>
            Save storage default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
