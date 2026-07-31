import { useCallback, useEffect, useState } from 'react';
import { EmailIntegrationCard } from '@/components/settings/integrations/EmailIntegrationCard';
import { GmailIntegrationCard } from '@/components/settings/integrations/GmailIntegrationCard';
import { SlackIntegrationCard } from '@/components/settings/integrations/SlackIntegrationCard';
import { TelegramIntegrationCard } from '@/components/settings/integrations/TelegramIntegrationCard';
import type { AlertState } from '@/components/settings/integrations/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { logger } from '@/lib/logger';

type Props = {
  /** Notifies the wizard whether at least one message source is connected (for the Next label). */
  onConnectedChange: (connected: boolean) => void;
};

const SOURCE_TYPES = new Set(['gmail', 'email', 'slack', 'telegram']);

/**
 * Step 4 — connect message sources. Wraps the existing Gmail / IMAP / Slack /
 * Telegram cards. Optional: the client connects one or more now, or skips and
 * adds them later in Settings. The Gmail popup OAuth flow keeps the wizard
 * mounted; the blocked-popup redirect fallback returns here via the
 * `onboarding_resume` sessionStorage flag.
 */
export const ChannelsStep = ({ onConnectedChange }: Props) => {
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
      onConnectedChange(list.some((item) => SOURCE_TYPES.has(item.type) && !item.isKnowledgeBase));
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

  const cardProps = {
    integrations,
    onRefresh: fetchIntegrations,
    onShowAlert: setAlertDialog,
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect the channels your customers reach you on — messages are fetched, analyzed and
        routed to your departments. Set up one or more now, or skip and add them anytime in
        Settings.
      </p>

      <GmailIntegrationCard {...cardProps} defaultKB={false} />
      <EmailIntegrationCard {...cardProps} defaultKB={false} />
      <TelegramIntegrationCard {...cardProps} />
      <SlackIntegrationCard {...cardProps} />

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
