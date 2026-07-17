import { HardDrive, Save, TestTube2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';

type StorageForm = {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

type StorageConfigDisplay = {
  endpoint: string | null;
  region: string | null;
  bucket: string | null;
  prefix: string | null;
  forcePathStyle: boolean;
  accessKeyId: string | null;
  hasSecret: boolean;
};

type StorageTestResult = { ok: boolean; latencyMs: number; error?: string };

const EMPTY_FORM: StorageForm = {
  endpoint: '',
  region: '',
  bucket: '',
  prefix: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: false,
};

const inputClass =
  'px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground';

// Payload shared by Test and Save — omit blanks so the backend treats missing
// creds as "ambient identity" and a missing secret as "keep the stored one".
const toPayload = (form: StorageForm) => ({
  endpoint: form.endpoint.trim() || undefined,
  region: form.region.trim(),
  bucket: form.bucket.trim(),
  prefix: form.prefix.trim() || undefined,
  forcePathStyle: form.forcePathStyle,
  accessKeyId: form.accessKeyId.trim() || undefined,
  secretAccessKey: form.secretAccessKey || undefined,
});

export const ObjectStorageConfigCard = () => {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(Permission.MANAGE_INTEGRATIONS);

  const [form, setForm] = useState<StorageForm>(EMPTY_FORM);
  const [configured, setConfigured] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<StorageTestResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: StorageConfigDisplay | null }>(
        '/api/integrations/storage-config'
      );
      const data = res.data.data;
      if (data) {
        setConfigured(true);
        setHasSecret(data.hasSecret);
        setForm({
          endpoint: data.endpoint ?? '',
          region: data.region ?? '',
          bucket: data.bucket ?? '',
          prefix: data.prefix ?? '',
          accessKeyId: data.accessKeyId ?? '',
          secretAccessKey: '',
          forcePathStyle: data.forcePathStyle,
        });
      } else {
        setConfigured(false);
        setHasSecret(false);
        setForm(EMPTY_FORM);
      }
    } catch (err) {
      toast.failure('Load storage config', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const canSubmit = form.region.trim().length > 0 && form.bucket.trim().length > 0;
  const set = (patch: Partial<StorageForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiClient.post<{ success: boolean; data: StorageTestResult }>(
        '/api/integrations/test-storage',
        toPayload(form)
      );
      setTestResult(res.data.data);
    } catch (err) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : 'Request failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/api/integrations/storage-config', toPayload(form));
      toast.success('Object storage configuration saved');
      await load();
    } catch (err) {
      toast.failure('Save storage config', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await apiClient.delete('/api/integrations/storage-config');
      toast.success('Object storage configuration removed');
      setTestResult(null);
      await load();
    } catch (err) {
      toast.failure('Remove storage config', err);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <HardDrive className="w-5 h-5" />
          Object Storage
          {configured && (
            <span className="px-2 py-0.5 text-xs rounded-full border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300">
              Configured
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Store attachments and knowledge-base files in your own S3-compatible bucket (AWS S3,
          Hetzner Object Storage, MinIO). Leave the endpoint blank for AWS; leave both keys blank to
          use the server's ambient identity (EC2 instance profile / ECS task role / IRSA). Without a
          config here, files use Odly's managed storage.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
            <div>
              <label htmlFor="storage-endpoint" className="text-sm font-medium">
                Endpoint (Optional)
              </label>
              <input
                id="storage-endpoint"
                type="text"
                autoComplete="off"
                value={form.endpoint}
                onChange={(event) => set({ endpoint: event.target.value })}
                disabled={!canManage}
                className={inputClass}
                placeholder="https://fsn1.your-objectstorage.com (blank = AWS)"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="storage-region" className="text-sm font-medium">
                  Region *
                </label>
                <input
                  id="storage-region"
                  type="text"
                  value={form.region}
                  onChange={(event) => set({ region: event.target.value })}
                  disabled={!canManage}
                  className={inputClass}
                  placeholder="eu-central-1"
                />
              </div>
              <div>
                <label htmlFor="storage-bucket" className="text-sm font-medium">
                  Bucket *
                </label>
                <input
                  id="storage-bucket"
                  type="text"
                  value={form.bucket}
                  onChange={(event) => set({ bucket: event.target.value })}
                  disabled={!canManage}
                  className={inputClass}
                  placeholder="odly-attachments"
                />
              </div>
            </div>

            <div>
              <label htmlFor="storage-prefix" className="text-sm font-medium">
                Key Prefix (Optional)
              </label>
              <input
                id="storage-prefix"
                type="text"
                value={form.prefix}
                onChange={(event) => set({ prefix: event.target.value })}
                disabled={!canManage}
                className={inputClass}
                placeholder="prod"
              />
            </div>

            <div>
              <label htmlFor="storage-access-key" className="text-sm font-medium">
                Access Key ID (Optional)
              </label>
              <input
                id="storage-access-key"
                type="text"
                autoComplete="off"
                value={form.accessKeyId}
                onChange={(event) => set({ accessKeyId: event.target.value })}
                disabled={!canManage}
                className={`${inputClass} font-mono text-xs`}
                placeholder="AKIA… (blank = ambient identity)"
              />
            </div>

            <div>
              <label htmlFor="storage-secret-key" className="text-sm font-medium">
                Secret Access Key
              </label>
              <input
                id="storage-secret-key"
                type="password"
                autoComplete="off"
                value={form.secretAccessKey}
                onChange={(event) => set({ secretAccessKey: event.target.value })}
                disabled={!canManage}
                className={`${inputClass} font-mono text-xs`}
                placeholder={hasSecret ? '•••••••• (stored — leave blank to keep)' : '••••••••'}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Encrypted at rest, never shown again. Leave blank to keep the stored secret; enter
                both keys (or leave both blank for ambient identity) to test.
              </p>
            </div>

            <div className="rounded-md border bg-background p-3">
              <label className="flex gap-2 items-center text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.forcePathStyle}
                  onChange={(event) => set({ forcePathStyle: event.target.checked })}
                  disabled={!canManage}
                />
                Force path-style addressing
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Required for MinIO and most on-prem S3 gateways. Leave off for AWS/Hetzner.
              </p>
            </div>

            {/* Test button + result */}
            <div className="space-y-2">
              <Button variant="outline" onClick={handleTest} isLoading={testing} disabled={!canSubmit || !canManage}>
                <TestTube2 className="mr-2 w-4 h-4" />
                Test Connection
              </Button>
              {testResult && (
                <div
                  className={`p-3 text-xs rounded border ${
                    testResult.ok
                      ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300'
                      : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                  }`}
                >
                  <p>
                    {testResult.ok ? 'Connection OK' : 'Connection failed'} · {testResult.latencyMs}ms
                  </p>
                  {testResult.error && <p className="mt-1">{testResult.error}</p>}
                </div>
              )}
            </div>

            {canManage && (
              <div className="flex gap-2">
                <Button onClick={handleSave} isLoading={saving} disabled={!canSubmit}>
                  <Save className="mr-2 w-4 h-4" />
                  Save
                </Button>
                {configured && (
                  <Button variant="destructive" onClick={handleRemove} isLoading={removing}>
                    <Trash2 className="mr-2 w-4 h-4" />
                    Remove
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
