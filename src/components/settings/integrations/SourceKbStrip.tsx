import { BookOpen, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { kbService } from '@/services/kb.service';
import { logger } from '@/lib/logger';
import type { AlertState } from '@/components/settings/integrations/types';

/**
 * The Knowledge Base strip under a channel row.
 *
 * Channels and KB sources are one list now (Addendum A.3), so each row has to carry its own
 * KB state instead of inheriting it from a section heading. This shows the two facts that
 * are actually knowable and offers the one action that is safe to expose today:
 *
 *   - the cutoff (`kbMarkedAt`), read-only. It is stamped server-side at the moment KB is
 *     enabled (`integrationsController` → `kbJustEnabled` → `new Date()`) and cleared when
 *     it is switched off. There is no API path for a client-chosen cutoff, so a date picker
 *     would be dead UI — Addendum A.5 lists one, but the correction in
 *     CLIENT-SERVICE-PRIORITIES (feedback 4) is the accurate one, confirmed in the code.
 *   - re-mine, which re-reads history already ingested before that cutoff.
 *
 * Deliberately NOT here yet, because neither can be done safely from the FE alone:
 *   - a KB on/off toggle. The cutoff stamp and the retroactive trigger live in
 *     `upsertIntegration` (POST), not PATCH, so a light PATCH toggle would leave
 *     `isKnowledgeBase=true` with `kbMarkedAt=null` — the silent no-op A.5 item 3 exists to
 *     kill — while routing it through upsert means re-sending a config the GET response has
 *     MASKED, risking real credentials being overwritten with placeholders. Toggling stays
 *     in the Edit form, which owns the full config. BE A.5 item 3 unblocks it.
 *   - "delete KB content, keep the channel". `knowledgeBaseRoutes` has only
 *     `DELETE /entries/:id` and `DELETE /documents/:id` — both single-item. There is no
 *     delete-by-source endpoint, so the headline capability of the independent lifecycle has
 *     no BE support yet (A.5 item 2 assumes it exists; it does not).
 */
export const SourceKbStrip = ({
  source,
  onShowAlert,
}: {
  source: { id: number; isKnowledgeBase?: boolean; kbMarkedAt?: string | null };
  onShowAlert: (alert: AlertState) => void;
}) => {
  const [remining, setRemining] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!source.isKnowledgeBase) return null;

  const cutoff = source.kbMarkedAt ? new Date(source.kbMarkedAt) : null;
  const cutoffValid = cutoff !== null && !Number.isNaN(cutoff.getTime());
  const cutoffLabel = cutoffValid
    ? cutoff.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  const handleRemine = async () => {
    setRemining(true);
    try {
      await kbService.reprocessSource(source.id);
      onShowAlert({
        open: true,
        title: 'Re-mining started',
        // Worded as "started" on purpose: the endpoint is fire-and-forget and returns
        // before any work happens, so promising a result here would be a lie.
        description:
          'Existing conversations are being re-read for Q&A pairs in the background. New entries appear in the Knowledge Base as they are extracted.',
        variant: 'info',
      });
    } catch (error) {
      logger.error('Failed to start KB re-mining:', error);
      onShowAlert({
        open: true,
        title: 'Could not start re-mining',
        description: error instanceof Error ? error.message : 'Failed to start re-mining',
        variant: 'error',
      });
    } finally {
      setRemining(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-2 justify-between items-center px-3 py-2 mt-2 text-xs rounded-md border bg-muted/40">
      <div className="flex gap-2 items-center min-w-0 text-muted-foreground">
        <BookOpen className="w-4 h-4 flex-shrink-0 text-purple-500" />
        <span className="font-medium text-foreground">Knowledge Base</span>
        {cutoffValid ? (
          <span className="truncate">
            · mining conversations received before{' '}
            {cutoff.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : (
          // Flag-on with no cutoff means nothing is ever mined. Surfacing it beats showing
          // a confident-looking strip for a source that silently produces nothing.
          <span className="truncate text-amber-600 dark:text-amber-500">
            · no cutoff recorded — nothing is being mined. Re-save this channel to set one.
          </span>
        )}
      </div>
      {/* Re-mining sends every already-ingested conversation before the cutoff to the AI
          provider AGAIN — paid work, with no count or estimate available up front. One
          click used to start it; it now asks first. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        isLoading={remining}
      >
        <RefreshCw className="mr-1 w-3 h-3" />
        Re-mine
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void handleRemine()}
        title="Re-mine this mailbox's history?"
        description={`All conversations in this mailbox${cutoffLabel ? ` received before ${cutoffLabel}` : ''} will be sent to your AI provider again to extract Q&A pairs. That is billed AI usage, and there is no count or estimate available before it starts.`}
        confirmText="Re-mine"
        variant="warning"
      />
    </div>
  );
};
