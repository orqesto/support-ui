import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MarkImportedControl } from '@/components/settings/integrations/MarkImportedControl';
import {
  gmailCanModify,
  readMarkImported,
  toSavedMarkImported,
  type MarkImportedSetting,
} from '@/components/settings/integrations/markImported';
import type { AlertState } from '@/components/settings/integrations/types';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';

const NEEDS_PERMISSION_NOTE =
  'Needs an extra Gmail permission (to change messages) that Odly does not ask Google for yet. Once it is available, reconnect this mailbox to turn it on.';

/**
 * "Mark imported messages read and label them" on a Gmail row (support-service#1229). Gmail
 * sources have no edit form, so this saves on its own (a PATCH of `config.gmail.markImported`),
 * like the other per-row editors. Disabled until the source's Google grant can modify mail.
 */
export const GmailMarkImportedStrip = ({
  source,
  onRefresh,
  onShowAlert,
}: {
  source: Integration;
  onRefresh: () => Promise<void>;
  onShowAlert: (alert: AlertState) => void;
}) => {
  const stored = readMarkImported(
    (source.config as { gmail?: { markImported?: unknown } } | undefined)?.gmail?.markImported
  );
  const [draft, setDraft] = useState<MarkImportedSetting>(stored);
  const [saving, setSaving] = useState(false);
  // Follow the stored value when it changes under us (a save, another admin, any list refresh),
  // so a stale draft never shows a Save button that would write the old value back.
  useEffect(() => {
    setDraft({
      enabled: stored.enabled,
      ...(stored.label !== undefined ? { label: stored.label } : {}),
    });
  }, [stored.enabled, stored.label]);
  const canModify = gmailCanModify(source.config);
  const changed =
    draft.enabled !== stored.enabled || (draft.label ?? '').trim() !== (stored.label ?? '').trim();

  const save = async () => {
    setSaving(true);
    try {
      await integrationsService.update(source.id, {
        type: 'gmail',
        config: { gmail: { markImported: toSavedMarkImported(draft) } },
      });
    } catch (error) {
      logger.error('Failed to save the mark-imported setting:', error);
      onShowAlert({
        open: true,
        title: 'Not saved',
        description:
          getApiErrorMessage(error) ?? 'The setting could not be saved. Please try again.',
        variant: 'error',
      });
      setSaving(false);
      return;
    }
    // Saved. A failed list refresh must not read as "Not saved" — the setting is stored.
    try {
      await onRefresh();
    } catch (error) {
      logger.error('Saved the mark-imported setting, but the list did not refresh:', error);
      onShowAlert({
        open: true,
        title: 'Saved',
        description:
          'The setting is saved, but the list could not be refreshed. Reload the page to see it.',
        variant: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <MarkImportedControl
        value={draft}
        onChange={setDraft}
        // Turning it OFF stays possible without the grant, so a stored "on" is never stuck.
        disabled={!canModify && !stored.enabled}
        note={canModify ? undefined : NEEDS_PERMISSION_NOTE}
      />
      {changed && (
        <Button size="sm" onClick={() => void save()} isLoading={saving}>
          Save
        </Button>
      )}
    </div>
  );
};
