import { useEffect, useState } from 'react';
import { EmailIntegrationCard } from '@/components/settings/integrations/EmailIntegrationCard';
import { GmailIntegrationCard } from '@/components/settings/integrations/GmailIntegrationCard';
import { JiraIntegrationCard } from '@/components/settings/integrations/JiraIntegrationCard';
import { SlackIntegrationCard } from '@/components/settings/integrations/SlackIntegrationCard';
import { TelegramIntegrationCard } from '@/components/settings/integrations/TelegramIntegrationCard';
import type { AlertState } from '@/components/settings/integrations/types';
import { ObjectStorageConfigCard } from '@/components/settings/providers/ObjectStorageConfigCard';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { logger } from '@/lib/logger';

export const IntegrationsSettings = () => {
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
    return <div className="py-12 text-center">Loading integrations...</div>;
  }

  return (
    <div className="space-y-10">
      {/* Active Sources */}
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold">Active Sources</h3>
          <p className="text-sm text-muted-foreground">Inboxes that receive and process incoming messages</p>
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
        <JiraIntegrationCard
          integrations={integrations}
          onRefresh={fetchIntegrations}
          onShowAlert={setAlertDialog}
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
          <h3 className="text-base font-semibold">Knowledge Base Sources</h3>
          <p className="text-sm text-muted-foreground">Email accounts used to extract Q&amp;A pairs and documentation for AI responses</p>
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

      {/* Object Storage */}
      <div className="space-y-6">
        <div className="pt-4 border-t">
          <h3 className="text-base font-semibold">Object Storage</h3>
          <p className="text-sm text-muted-foreground">
            Where attachments and knowledge-base files are stored (your own S3 bucket, or Odly's
            managed storage by default)
          </p>
        </div>
        <ObjectStorageConfigCard />
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
