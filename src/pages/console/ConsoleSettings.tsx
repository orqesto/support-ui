import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import {
  useAllianceSettings,
  useUpdateAllianceSettings,
  useDetachAllOrgs,
} from '@/hooks/useAllianceSettings';

/**
 * Alliance Settings (05-09): edit the alliance name + slug, plus a danger zone.
 *
 * The `settings` defaults blob is free-form (Record<string, unknown>) in v1 and has
 * no concrete fields in the ADMIN-CONSOLE-SPEC yet, so this page persists name/slug
 * only and passes the existing settings through untouched (see 05-09-SUMMARY).
 *
 * Slug is unique alliance-wide; a collision returns 409 from the BE, surfaced both
 * as a toast (from the mutation hook) and inline under the field. The danger-zone
 * detach-all is gated behind a Dialog that only enables its confirm button once the
 * admin types the alliance slug exactly (T-05-32 typed confirm).
 */

export const ConsoleSettings = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const settingsQuery = useAllianceSettings(numericId);
  const updateSettings = useUpdateAllianceSettings(numericId);
  const detachAll = useDetachAllOrgs(numericId);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  // Seed the form once settings load (and re-seed if a save changes the canonical values).
  const settings = settingsQuery.data;
  useEffect(() => {
    if (settings) {
      setName(settings.name);
      setSlug(settings.slug);
    }
  }, [settings]);

  // Danger-zone typed-confirm gate.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');

  if (settingsQuery.isLoading) {
    return <ConsoleLoading />;
  }

  if (settingsQuery.isError || !settings) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load alliance settings.</span>
          <Button variant="secondary" onClick={() => void settingsQuery.refetch()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  // The 409 slug-collision message is bubbled through the mutation error.
  const saveError =
    updateSettings.isError && updateSettings.error instanceof Error
      ? updateSettings.error.message
      : null;
  const slugCollision = saveError !== null && /slug/i.test(saveError);

  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  const dirty = trimmedName !== settings.name || trimmedSlug !== settings.slug;
  // Slug must match the documented format (lowercase letters, numbers, hyphens only).
  const slugFormatValid = /^[a-z0-9-]+$/.test(trimmedSlug);
  const canSave =
    dirty && trimmedName.length >= 2 && trimmedSlug.length >= 2 && slugFormatValid;

  const handleSave = () => {
    if (!canSave) {
      return;
    }
    // Pass `settings` through unchanged (v1 no-op) alongside name/slug.
    updateSettings.mutate({ name: trimmedName, slug: trimmedSlug });
  };

  const openDangerZone = () => {
    setConfirmSlug('');
    setConfirmOpen(true);
  };

  const confirmMatches = confirmSlug.trim() === settings.slug;

  const handleDetachConfirm = () => {
    if (!confirmMatches) {
      return;
    }
    detachAll.mutate(undefined, {
      onSuccess: () => setConfirmOpen(false),
    });
  };

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Settings"
        description="Edit your alliance's name and URL slug, and manage destructive actions."
      />

      {/* ─── General ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <SettingsIcon className="w-5 h-5 text-primary" />
            General
          </CardTitle>
          <CardDescription>
            The alliance name is shown across the console. The slug is unique and used in URLs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Input
              label="Alliance name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Acme Group"
            />
          </div>

          <div className="space-y-1">
            <Input
              label="Slug"
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="e.g. acme-group"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers and hyphens only.
            </p>
            {trimmedSlug.length > 0 && !slugFormatValid && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Use only lowercase letters, numbers and hyphens (no spaces or uppercase).
              </p>
            )}
            {slugCollision && (
              <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              isLoading={updateSettings.isPending}
              disabled={!canSave || updateSettings.isPending}
            >
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Danger zone ─────────────────────────────────────────────────── */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
            Danger zone
          </CardTitle>
          <CardDescription>
            Detach every workspace from this alliance. Each workspace keeps its own data and users, but
            loses alliance-wide identity, groups and provisioning. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Detach all workspaces from <strong>{settings.name}</strong>.
            </p>
            <Button
              type="button"
              variant="destructive"
              onClick={openDangerZone}
              disabled={detachAll.isPending}
            >
              Detach all workspaces
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Typed-confirm gate — the confirm button stays disabled until the slug matches. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogHeader>
          <DialogTitle>Detach all workspaces?</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <Alert variant="warning">
            <span className="text-sm">
              This detaches <strong>every</strong> workspace from <strong>{settings.name}</strong> and
              cannot be undone. Members without a direct grant lose access across all of them — their open
              tickets are reassigned and their sessions revoked. Type the alliance slug{' '}
              <code className="px-1 font-mono rounded bg-muted">{settings.slug}</code> to confirm.
            </span>
          </Alert>
          <div className="space-y-1">
            <Label htmlFor="detach-confirm-slug" className="mb-1">
              Alliance slug
            </Label>
            <Input
              id="detach-confirm-slug"
              type="text"
              value={confirmSlug}
              onChange={(event) => setConfirmSlug(event.target.value)}
              placeholder={settings.slug}
              className="font-mono text-sm"
              autoComplete="off"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDetachConfirm}
            isLoading={detachAll.isPending}
            disabled={!confirmMatches || detachAll.isPending}
          >
            Detach all
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};
