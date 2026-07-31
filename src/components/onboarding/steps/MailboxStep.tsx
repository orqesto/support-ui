import { useCallback, useEffect, useState } from 'react';
import { EmailIntegrationCard } from '@/components/settings/integrations/EmailIntegrationCard';
import { GmailIntegrationCard } from '@/components/settings/integrations/GmailIntegrationCard';
import type { AlertState } from '@/components/settings/integrations/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { logger } from '@/lib/logger';

type Props = {
  /** Notifies the wizard so "Next" can reflect whether a mailbox is connected. */
  onConnectedChange: (connected: boolean) => void;
};

/**
 * Step 3 — connect a mailbox. Wraps the existing Gmail + IMAP settings cards.
 * The Gmail popup OAuth flow keeps the wizard mounted; the blocked-popup
 * redirect fallback returns here via the `onboarding_resume` sessionStorage flag
 * (set by OnboardingPage, honored by OAuthCallbackPage).
 */
export const MailboxStep = ({ onConnectedChange }: Props) => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertDialog, setAlertDialog] = useState<AlertState>({
    open: false,
    title: '',
    description: '',
    variant: 'info',
  });

  const fetchIntegrations = useCallback(async () => {
    try {
      const response = await integrationsService.getAll();
      const list = response.success && response.data ? response.data : [];
      setIntegrations(list);
      onConnectedChange(list.some((item) => item.type === 'gmail' || item.type === 'email'));
    } catch (error) {
      logger.error('Failed to fetch integrations:', error);
    } finally {
      setLoading(false);
    }
  }, [onConnectedChange]);

  useEffect(() => {
    void fetchIntegrations();
  }, [fetchIntegrations]);

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect the inbox your customers write to. Incoming mail is fetched, analyzed and routed
        to your departments. More channels (Telegram, Slack, chat widget) can be added later in
        Settings.
      </p>

      <GmailIntegrationCard
        integrations={integrations}
        onRefresh={fetchIntegrations}
        onShowAlert={setAlertDialog}
        defaultKB={false}
      />

      <EmailIntegrationCard
        integrations={integrations}
        onRefresh={fetchIntegrations}
        onShowAlert={setAlertDialog}
        defaultKB={false}
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
