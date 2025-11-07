import { useEffect, useState } from 'react';
import { JiraIntegrationCard } from '@/components/settings/integrations/JiraIntegrationCard';
import type { AlertState } from '@/components/settings/integrations/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { integrationsService, type Integration } from '@/services/integrations.service';

export const TicketAutomationSettings = () => {
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
    return <div className="py-12 text-center">Loading automation settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Ticket Automation</h2>
        <p className="text-sm text-muted-foreground">
          Configure how tickets are integrated with external systems and automated workflows.
        </p>
      </div>

      {/* Jira Integration */}
      <JiraIntegrationCard
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
