import { useState } from 'react';
import { HardDrive, TestTube2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfigCard } from '@/components/ui/ConfigCard';
import type { ConfigSummaryRow } from '@/components/ui/ConfigCard';
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
  FieldSource,
  PlatformSettings,
  StorageTestResult,
} from '@/services/platformSettings.service';
import { useConfigCardState } from '@/hooks/useConfigCardState';
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

/**
 * Provenance as a readable phrase. The read-only view has room the editable one does
 * not, so where a value resolves from becomes a sentence fragment rather than a chip.
 * `default` earns no phrase: storage has no built-in fallback, so it means "not set".
 */
const sourceNote = (source: FieldSource): string | undefined =>
  source === 'db' ? 'from console' : source === 'env' ? 'from environment' : undefined;

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

  const invalidateTest = () => setTestResult(null);

  /** Discard the draft: put every field back to what the server holds. */
  const resetDraft = () => {
    setMode(initialMode(storage));
    setText(seedText(storage));
    setForcePathStyle(storage.forcePathStyle.value ?? false);
    setTestResult(null);
  };

  /**
   * `stored` and `empty` are derived from whether the console holds a row, so the
   * read-only view can only ever render server data. Saving returns the card to it,
   * and that mode change is the confirmation — stronger than a badge, because the
   * values on screen afterwards were re-read rather than typed.
   */
  const consoleConfigured = storage.driver.source === 'db';
  const card = useConfigCardState({ configured: consoleConfigured, onCancel: resetDraft });
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
        card.confirmSaved();
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

  /** The read-only view: what the platform is using, and where each value comes from. */
  const summary: ConfigSummaryRow[] = [
    {
      label: 'Backend',
      value:
        storage.effectiveDriver === 's3' ? 'S3 / compatible' : 'Local disk (single node)',
      source: sourceNote(storage.driver.source),
    },
    ...(storage.effectiveDriver === 's3'
      ? TEXT_FIELDS.map(({ key, label }) => ({
          label: label.replace(' (optional)', ''),
          value: storage[key].value ?? '',
          source: sourceNote(storage[key].source),
          placeholder: key === 'endpoint' ? 'AWS (default)' : 'Not set',
        }))
      : []),
    ...(storage.effectiveDriver === 's3'
      ? [
          {
            label: 'Path-style',
            value: storage.forcePathStyle.value ? 'Forced' : 'Off',
            source: sourceNote(storage.forcePathStyle.source),
          },
          {
            label: 'Access key',
            value: storage.accessKeyId.configured
              ? `····${storage.accessKeyId.last4 ?? ''}`
              : '',
            source: storage.accessKeyId.configured
              ? sourceNote(storage.accessKeyId.source === 'db' ? 'db' : 'env')
              : undefined,
            placeholder: 'Ambient identity (instance profile / role)',
          },
        ]
      : []),
  ];

  return (
    <ConfigCard
      title="Default Storage"
      icon={<HardDrive className="w-5 h-5 text-primary" />}
      description="Where the platform stores attachments by default (workspaces can still override per-tenant). Credentials are stored encrypted; test an S3 target before saving."
      state={card.state}
      summary={summary}
      emptyNote={
        <>
          No storage default is set in the console, so attachments follow the environment
          {storage.envS3Configured ? " (which provides an S3 target)" : ' (local disk)'}. Configure
          one here to pin it.
        </>
      }
      onConfigure={card.startEditing}
      onEdit={card.startEditing}
      onCancel={card.cancelEditing}
      onSave={save}
      saveDisabled={saveDisabled}
      saving={update.isPending}
      configureLabel="Configure storage"
      saveLabel="Save storage default"
      extraActions={
        isS3 && (
          <Button variant="outline" onClick={runTest} isLoading={test.isPending}>
            <TestTube2 className="mr-2 w-4 h-4" />
            Test connection
          </Button>
        )
      }
      note={
        <>
          {envS3NotYetEffective && card.state !== 'editing' && (
            <Alert variant="info">
              S3 settings were found in the environment, but attachments are still being written to
              local disk. Configure and save to switch the platform over.
            </Alert>
          )}
          {testResult && (
            <p className={`text-sm ${testResult.ok ? 'text-success' : 'text-danger'}`}>
              {testResult.ok
                ? `Connection OK · ${testResult.latencyMs}ms${
                    card.isEditing ? ' — not saved yet' : ''
                  }`
                : `Failed: ${testResult.error ?? 'unknown error'}`}
            </p>
          )}
          {card.isEditing && saveDisabled && (
            <Alert variant="info">
              Run a successful connection test before saving an S3 target — the probe writes, reads
              back, and deletes a small object, so a passing test means uploads will work.
            </Alert>
          )}
        </>
      }
    >
      <div className="space-y-5">
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
              Leave both blank to use an assumed role (above) or the server&apos;s own AWS identity
              — an EC2 instance profile, ECS task role, or IRSA. A custom endpoint has no ambient
              identity to fall back on, so it always needs keys.
            </p>
          </div>
        )}
      </div>
    </ConfigCard>
  );
};
