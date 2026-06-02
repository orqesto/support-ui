import { useEffect, useState } from 'react';
import { EmailIntegrationCard } from '@/components/settings/integrations/EmailIntegrationCard';
import { GmailIntegrationCard } from '@/components/settings/integrations/GmailIntegrationCard';
import { SlackIntegrationCard } from '@/components/settings/integrations/SlackIntegrationCard';
import { TelegramIntegrationCard } from '@/components/settings/integrations/TelegramIntegrationCard';
import type { AlertState } from '@/components/settings/integrations/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { logger } from '@/lib/logger';

export const MessageSourcesSettings = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertDialog, setAlertDialog] = useState<AlertState>({
    open: false,
    title: '',
    description: '',
    variant: 'info',
  });

  useEffect(() => {
    fetchIntegrations().catch((error) => {
      logger.error('Failed to fetch integrations:', error);
    });
  }, []);

  const fetchIntegrations = async () => {
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
  };

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

        <GmailIntegrationCard
          integrations={integrations}
          onRefresh={fetchIntegrations}
          onShowAlert={setAlertDialog}
          defaultKB={false}
        />

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
            Email accounts used to extract Q&amp;A pairs and documentation for AI-powered responses. These don't appear in the active inbox.
          </p>
        </div>

        <EmailIntegrationCard
          integrations={integrations}
          onRefresh={fetchIntegrations}
          onShowAlert={setAlertDialog}
          defaultKB={true}
        />

        <GmailIntegrationCard
          integrations={integrations}
          onRefresh={fetchIntegrations}
          onShowAlert={setAlertDialog}
          defaultKB={true}
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
