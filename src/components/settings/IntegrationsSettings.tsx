import { useEffect, useState } from 'react';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { AlertDialog } from '../ui/AlertDialog';
import { EmailIntegrationCard } from './integrations/EmailIntegrationCard';
import { GmailIntegrationCard } from './integrations/GmailIntegrationCard';
import { JiraIntegrationCard } from './integrations/JiraIntegrationCard';
import { SlackIntegrationCard } from './integrations/SlackIntegrationCard';
import { TelegramIntegrationCard } from './integrations/TelegramIntegrationCard';
import type { AlertState } from './integrations/types';

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
      console.error('Failed to fetch integrations:', error);
    });
  }, []);

  const fetchIntegrations = async () => {
    try {
      const response = await integrationsService.getAll();
      if (response.success && response.data) {
        setIntegrations(response.data.map((integration) => ({ ...integration })));
      } else {
        console.error('Failed to fetch integrations:', response.error);
        throw new Error(response.error ?? 'Failed to fetch integrations');
      }
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center">Loading integrations...</div>;
  }

  return (
    <div className="space-y-6">
      <EmailIntegrationCard
        integrations={integrations}
        onRefresh={fetchIntegrations}
        onShowAlert={setAlertDialog}
      />

      <GmailIntegrationCard
        integrations={integrations}
        onRefresh={fetchIntegrations}
        onShowAlert={setAlertDialog}
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
