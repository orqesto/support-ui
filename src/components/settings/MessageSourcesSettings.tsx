import { useCallback, useEffect, useState } from 'react';
import { ConfluenceIntegrationCard } from '@/components/settings/integrations/ConfluenceIntegrationCard';
import { EmailIntegrationCard } from '@/components/settings/integrations/EmailIntegrationCard';
import { GmailIntegrationCard } from '@/components/settings/integrations/GmailIntegrationCard';
import { SlackIntegrationCard } from '@/components/settings/integrations/SlackIntegrationCard';
import { TelegramIntegrationCard } from '@/components/settings/integrations/TelegramIntegrationCard';
import type { AlertState } from '@/components/settings/integrations/types';
import { useGmailOAuthAvailability } from '@/hooks/useGmailOAuthAvailability';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { logger } from '@/lib/logger';

export const MessageSourcesSettings = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  // Gmail OAuth is Enterprise-only pre-CASA — hide its cards for regular clients (who use
  // IMAP). null until known; only hide on an explicit false. The BE 403 is the real gate.
  const gmailAvailable = useGmailOAuthAvailability();
  const [alertDialog, setAlertDialog] = useState<AlertState>({
    open: false,
    title: '',
    description: '',
    variant: 'info',
  });

  // Stable identity (closes over nothing) so children's effects keyed on onRefresh —
  // e.g. the Confluence card's sync poll cap — don't churn every render.
  const fetchIntegrations = useCallback(async () => {
    try {
      const response = await integrationsService.getAll();
      if (response.success && response.data) {
        setIntegrations(response.data.map((integration) => ({ ...integration })));
      } else {
        logger.error('Failed to fetch integrations:', response.error);
        throw new Error(response.error ?? 'Failed to fetch integrations');
      }
    } catch (error) {
      logger.error('Failed to fetch integrations:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations().catch((error) => {
      logger.error('Failed to fetch integrations:', error);
    });
  }, [fetchIntegrations]);

  if (loading) {
    return <div className="py-12 text-center">Loading message sources...</div>;
  }

  return (
    <div className="space-y-10">
      {/*
        Two sections, split along the seam the data model actually has (Addendum A.3 of
        SOURCE-IMPORT-LIFECYCLE-SPEC): `message_sources` = live channels, everything else
        (`content_source_integrations` + uploads) = Spaces.

        This page used to render Email and Gmail TWICE — once under "Active Sources" and
        again under "Knowledge Base Sources" next to Confluence — off the same components
        with `defaultKB={false|true}`. That presented one mechanism as two unrelated
        things: a "KB source" is not a different kind of entity, it is the same
        `message_sources` row with `isKnowledgeBase` set. The duplication made a mailbox
        look like it had to be either an inbox or a KB source, when it can be both, and it
        filed Confluence — which never receives messages — beside mailboxes.

        Omitting `defaultKB` is what merges them: the cards filter on it only when it is
        defined, title themselves as channels, and reveal the "Use as Knowledge Base
        Source" checkbox (`EmailForm`'s `!defaultKB`), so an existing inbox can be promoted
        in place. Per-row KB state, which the section heading used to convey, is now a
        badge on the row itself.
      */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Channels</h2>
          <p className="text-sm text-muted-foreground">
            Inboxes and chat connections that receive and process incoming messages. Any
            channel can also be mined for Knowledge Base content — enable that on the
            channel itself.
          </p>
        </div>

        <EmailIntegrationCard
          integrations={integrations}
          onRefresh={fetchIntegrations}
          onShowAlert={setAlertDialog}
        />

        {gmailAvailable !== false && (
          <GmailIntegrationCard
            integrations={integrations}
            onRefresh={fetchIntegrations}
            onShowAlert={setAlertDialog}
          />
        )}

        <TelegramIntegrationCard
          integrations={integrations}
          onRefresh={fetchIntegrations}
          onShowAlert={setAlertDialog}
        />

        <SlackIntegrationCard
          integrations={integrations}
          onRefresh={fetchIntegrations}
          onShowAlert={setAlertDialog}
        />
      </div>

      {/* Spaces — document sources, not channels. Notion/Google Docs and uploads join here. */}
      <div className="space-y-6">
        <div className="pt-4 border-t">
          <h2 className="text-lg font-semibold text-foreground">Spaces</h2>
          <p className="text-sm text-muted-foreground">
            Document sources mined for Q&amp;A pairs and documentation used in AI-powered
            responses. Unlike channels, these never receive messages.
          </p>
        </div>

        <ConfluenceIntegrationCard
          integrations={integrations}
          onRefresh={fetchIntegrations}
          onShowAlert={setAlertDialog}
        />
      </div>

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </div>
  );
};
