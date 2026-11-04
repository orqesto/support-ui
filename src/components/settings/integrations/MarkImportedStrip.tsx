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
import { gmailOAuthService } from '@/services/gmail-oauth.service';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';

export const NEEDS_PERMISSION_NOTE =
  'Turning this on opens a Google window asking for one more permission (to change messages). The mailbox stays connected as it is.';
const WAITING_NOTE = 'Waiting for Google… finish in the window that opened.';

/**
 * "Mark imported messages read and label them" on a source row (support-service#1229), for Gmail
 * and IMAP alike: saves on its own (a PATCH of `config.<gmail|email>.markImported`), like the other
 * per-row editors, so nobody has to open the IMAP edit form to find it.
 *
 * A Gmail source whose Google grant cannot modify mail yet does not need a reconnect: turning the
 * switch ON asks Google for that one permission (the backend's mark-imported grant), and the
 * backend switches the setting on when Google answers. Turning it OFF never needs the grant.
 */
export const MarkImportedStrip = ({
  source,
  onRefresh,
  onShowAlert,
}: {
  source: Integration;
  onRefresh: () => Promise<void>;
  onShowAlert: (alert: AlertState) => void;
}) => {
  const branch = source.type === 'gmail' ? 'gmail' : 'email';
  const stored = readMarkImported(
    (source.config as Record<string, { markImported?: unknown } | undefined> | undefined)?.[branch]
      ?.markImported
  );
  const [draft, setDraft] = useState<MarkImportedSetting>(stored);
  const [saving, setSaving] = useState(false);
  const [granting, setGranting] = useState(false);
  // Follow the stored value when it changes under us (a save, another admin, any list refresh),
  // so a stale draft never shows a Save button that would write the old value back.
  useEffect(() => {
    setDraft({
      enabled: stored.enabled,
      ...(stored.label !== undefined ? { label: stored.label } : {}),
    });
  }, [stored.enabled, stored.label]);
  const needsGrant = branch === 'gmail' && !gmailCanModify(source.config);
  const changed =
    draft.enabled !== stored.enabled || (draft.label ?? '').trim() !== (stored.label ?? '').trim();

  const refreshAfterSave = async () => {
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
    }
  };

  /**
   * Called straight from the click: connectWithPopup opens its window before any await, which is
   * what keeps the browser from blocking it.
   */
  const grantAndTurnOn = async (label: string | undefined) => {
    setGranting(true);
    const result = await gmailOAuthService.connectWithPopup({
      grant: { sourceId: source.id, label: label?.trim() ?? '' },
    });
    setGranting(false);
    if (!result.success) {
      onShowAlert({
        open: true,
        title: 'Not turned on',
        description:
          result.error === 'POPUP_BLOCKED'
            ? 'The browser blocked the Google window. Allow pop-ups for this site and turn the switch on again.'
            : (result.error ?? 'Google did not give the permission. Please try again.'),
        variant: 'error',
      });
      return;
    }
    if (!result.markImportedGranted) {
      // An older server reconnected the mailbox but knows nothing of the switch: say so, never "on".
      onShowAlert({
        open: true,
        title: 'Not turned on',
        description:
          'The mailbox signed in again, but this server cannot turn the setting on yet. Please try again later.',
        variant: 'warning',
      });
      await refreshAfterSave();
      return;
    }
    onShowAlert({
      open: true,
      title: 'Turned on',
      description:
        'Google gave the permission. Messages Odly imports from now on are marked read and labelled in this mailbox.',
      variant: 'success',
    });
    await refreshAfterSave();
  };

  const onChange = (next: MarkImportedSetting) => {
    if (needsGrant && next.enabled && !stored.enabled) {
      void grantAndTurnOn(draft.label);
      return;
    }
    setDraft(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await integrationsService.update(source.id, {
        type: source.type,
        config: { [branch]: { markImported: toSavedMarkImported(draft) } },
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
    await refreshAfterSave();
    setSaving(false);
  };

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <MarkImportedControl
        value={draft}
        onChange={onChange}
        disabled={granting}
        note={
          granting
            ? WAITING_NOTE
            : needsGrant && !stored.enabled
              ? NEEDS_PERMISSION_NOTE
              : undefined
        }
      />
      {changed && (
        <Button size="sm" onClick={() => void save()} isLoading={saving}>
          Save
        </Button>
      )}
    </div>
  );
};
