import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Toggle } from '@/components/ui/Toggle';
import { useAiDraftsOff, useRefreshAiDrafts } from '@/hooks/useAiDraftsOff';
import { usePermissions } from '@/hooks/usePermissions';
import { formatError } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { organizationService } from '@/services/organization.service';

/**
 * "AI drafts off" — a workspace where no model writes anything a customer can read.
 * Backed by `GET/PATCH /api/organizations/ai-drafts` (`{ off }`); the PATCH is admin-only on the
 * backend, so everyone else sees the state and who can change it.
 *
 * The lists below are the backend's, not a paraphrase: what stops is every path its guard
 * covers, what keeps running is search (local embeddings) and internal sorting, which still use
 * the model — so this never says "no AI".
 */
export const AiDraftsSettings = () => {
  const { isOrgAdmin } = usePermissions();
  const { off, resolved, available } = useAiDraftsOff();
  const refresh = useRefreshAiDrafts();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await organizationService.updateAiDrafts(next);
    } catch (err) {
      logger.error('Failed to save AI drafts setting', err);
      setError(formatError('save the AI drafts setting', err));
    } finally {
      // Re-read either way: after a failure the switch must show what the server holds, not
      // what was clicked.
      refresh();
      setSaving(false);
    }
  };

  // Hidden on a backend without the setting (the frontend ships on its own schedule): a switch
  // whose save answers 404 is a dead control.
  if (!resolved || !available) return null;

  return (
    <div className="p-4 space-y-3 rounded-lg border bg-card">
      <div className="flex gap-4 justify-between items-start">
        <div>
          <h3 className="font-display text-sm font-medium text-foreground">AI drafts off</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing a model writes reaches your customers: no drafted or polished replies in the
            composer, no AI-written suggested replies, no draft translation, no AI auto-replies or
            follow-up emails, and the chat widget stops answering with AI — it collects the
            visitor&apos;s email and hands the chat to your team. Lead qualification stops too,
            because it writes the reply sent to the lead.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Still on: knowledge-base search, the prepared acknowledgment reply (not AI-written), and
            internal sorting — routing, classification and spam checks still use AI.
          </p>
        </div>
        <Toggle
          checked={off}
          onChange={(next) => void change(next)}
          disabled={!isOrgAdmin || saving}
        />
      </div>
      {!isOrgAdmin && (
        <p className="text-xs text-muted-foreground">
          {off ? 'AI drafts are off for this workspace.' : 'AI drafts are on for this workspace.'}{' '}
          Only a workspace admin can change this.
        </p>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
    </div>
  );
};
