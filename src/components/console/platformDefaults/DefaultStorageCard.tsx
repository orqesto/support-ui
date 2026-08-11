import { useState } from 'react';
import { HardDrive, TestTube2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
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
type TextKey = 'endpoint' | 'region' | 'bucket' | 'prefix';

const TEXT_FIELDS: { key: TextKey; label: string; placeholder: string }[] = [
  { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket' },
  { key: 'endpoint', label: 'Endpoint', placeholder: 'https://s3.provider.com' },
  { key: 'region', label: 'Region', placeholder: 'eu-central-1' },
  { key: 'prefix', label: 'Key prefix', placeholder: 'optional/' },
];

export const DefaultStorageCard = ({ storage }: { storage: Storage }) => {
  const [driver, setDriver] = useState<'local' | 's3'>(storage.driver.value ?? 'local');
  const [text, setText] = useState<Record<TextKey, string>>(() => ({
    endpoint: storage.endpoint.value ?? '',
    region: storage.region.value ?? '',
    bucket: storage.bucket.value ?? '',
    prefix: storage.prefix.value ?? '',
  }));
  const [forcePathStyle, setForcePathStyle] = useState<boolean>(storage.forcePathStyle.value ?? false);
  // A successful test is required before Save can persist an S3 target; any edit
  // to the config invalidates it (the green must reflect the config being saved).
  const [testResult, setTestResult] = useState<StorageTestResult | null>(null);

  const update = useUpdatePlatformStorage();
  const test = useTestPlatformStorage();
  const setSecret = useSetPlatformSecret();
  const clearSecret = useClearPlatformSecret();

  const invalidateTest = () => setTestResult(null);
  const setTextField = (key: TextKey, value: string) => {
    setText((prev) => ({ ...prev, [key]: value }));
    invalidateTest();
  };

  const s3Payload = (): DefaultStorageInput => ({
    driver: 's3',
    endpoint: text.endpoint.trim() || undefined,
    region: text.region.trim() || undefined,
    bucket: text.bucket.trim() || undefined,
    prefix: text.prefix.trim() || undefined,
    forcePathStyle,
  });

  const runTest = () => {
    test.mutate(s3Payload(), {
      onSuccess: (result) => setTestResult(result),
      onError: (err) =>
        setTestResult({
          ok: false,
          latencyMs: 0,
          error: err instanceof Error ? err.message : 'Test failed',
        }),
    });
  };

  const save = () => update.mutate(driver === 'local' ? { driver: 'local' } : s3Payload());

  const isS3 = driver === 's3';
  const saveDisabled = isS3 && !testResult?.ok;

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
            <Label className="mb-0">Driver</Label>
            <SourceBadge source={storage.driver.source} />
          </div>
          <Select
            value={driver}
            onChange={(event) => {
              setDriver(event.target.value as 'local' | 's3');
              invalidateTest();
            }}
          >
            <option value="local">Local disk</option>
            <option value="s3">S3 / compatible</option>
          </Select>
        </div>

        {isS3 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {TEXT_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <div className="flex gap-2 items-center mb-2">
                    <Label className="mb-0">{label}</Label>
                    <SourceBadge source={storage[key].source} />
                  </div>
                  <Input
                    value={text[key]}
                    onChange={(event) => setTextField(key, event.target.value)}
                    placeholder={storage[key].value ?? placeholder}
                  />
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
              <SourceBadge source={storage.forcePathStyle.source} />
            </div>

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
            </div>

            <div className="flex gap-3 items-center">
              <Button variant="outline" onClick={runTest} isLoading={test.isPending}>
                <TestTube2 className="mr-2 w-4 h-4" />
                Test connection
              </Button>
              {testResult && (
                <span className={`text-sm ${testResult.ok ? 'text-success' : 'text-danger'}`}>
                  {testResult.ok
                    ? `Connection OK · ${testResult.latencyMs}ms`
                    : `Failed: ${testResult.error ?? 'unknown error'}`}
                </span>
              )}
            </div>
          </>
        )}

        {saveDisabled && (
          <Alert variant="info">Run a successful connection test before saving an S3 target.</Alert>
        )}

        <div className="flex justify-end">
          <Button onClick={save} isLoading={update.isPending} disabled={saveDisabled}>
            Save storage default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
