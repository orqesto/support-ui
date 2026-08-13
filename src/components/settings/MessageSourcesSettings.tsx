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
      {/* Active Sources */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Active Sources</h2>
          <p className="text-sm text-muted-foreground">
            Inboxes that receive and process incoming messages.
          </p>
        </div>

        <EmailIntegrationCard
          integrations={integrations}
          onRefresh={fetchIntegrations}
          onShowAlert={setAlertDialog}
          defaultKB={false}
        />

        {gmailAvailable !== false && (
          <GmailIntegrationCard
            integrations={integrations}
            onRefresh={fetchIntegrations}
            onShowAlert={setAlertDialog}
            defaultKB={false}
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

      {/* Knowledge Base Sources */}
      <div className="space-y-6">
        <div className="pt-4 border-t">
          <h2 className="text-lg font-semibold text-foreground">Knowledge Base Sources</h2>
          <p className="text-sm text-muted-foreground">
            Email accounts and content sources used to extract Q&amp;A pairs and documentation for AI-powered responses. These don't appear in the active inbox.
          </p>
        </div>

        <EmailIntegrationCard
          integrations={integrations}
          onRefresh={fetchIntegrations}
          onShowAlert={setAlertDialog}
          defaultKB={true}
        />

        {gmailAvailable !== false && (
          <GmailIntegrationCard
            integrations={integrations}
            onRefresh={fetchIntegrations}
            onShowAlert={setAlertDialog}
            defaultKB={true}
          />
        )}

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
