import { useCallback, useEffect, useState } from 'react';
import { AtSign, Check, ChevronDown, Hash, Mail, MessageCircle, Send } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmailIntegrationCard } from '@/components/settings/integrations/EmailIntegrationCard';
import { GmailIntegrationCard } from '@/components/settings/integrations/GmailIntegrationCard';
import { SlackIntegrationCard } from '@/components/settings/integrations/SlackIntegrationCard';
import { TelegramIntegrationCard } from '@/components/settings/integrations/TelegramIntegrationCard';
import { WhatsAppIntegrationCard } from '@/components/settings/integrations/WhatsAppIntegrationCard';
import type { AlertState } from '@/components/settings/integrations/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { useGmailOAuthAvailability } from '@/hooks/useGmailOAuthAvailability';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

type Props = {
  /** Notifies the wizard whether at least one message source is connected (for the Next label). */
  onConnectedChange: (connected: boolean) => void;
};

type ChannelKey = 'gmail' | 'email' | 'telegram' | 'slack' | 'whatsapp';

const CHANNELS: {
  key: ChannelKey;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { key: 'gmail', label: 'Gmail', description: 'Connect a Google inbox with OAuth', icon: Mail },
  { key: 'email', label: 'Email (IMAP)', description: 'Any mailbox via IMAP/SMTP', icon: AtSign },
  { key: 'telegram', label: 'Telegram', description: 'Receive messages from a Telegram bot', icon: Send },
  { key: 'slack', label: 'Slack', description: 'Connect a Slack workspace', icon: Hash },
  { key: 'whatsapp', label: 'WhatsApp', description: 'Connect a WhatsApp Business number', icon: MessageCircle },
];

/**
 * Step 4 — connect message channels. A light chooser: one compact row per channel
 * with its connected count; expanding a row reveals that channel's existing
 * connect card (only one open at a time), so the step isn't four stacked cards.
 * Optional — connect one or more now, or skip and add them later in Settings.
 */
export const ChannelsStep = ({ onConnectedChange }: Props) => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  // Start with the Gmail row open when returning from a blocked-popup OAuth
  // redirect — the card must be mounted for its effect to consume the pending
  // result. (The redirect lands back on this step via `onboarding_resume`.)
  const [openKey, setOpenKey] = useState<ChannelKey | null>(() =>
    typeof window !== 'undefined' && window.sessionStorage.getItem('gmail_oauth_pending_config')
      ? 'gmail'
      : null
  );
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
      onConnectedChange(
        list.some(
          (item) =>
            (item.type === 'gmail' ||
              item.type === 'email' ||
              item.type === 'telegram' ||
              item.type === 'slack') && !item.isKnowledgeBase
        )
      );
    } catch (error) {
      logger.error('Failed to fetch integrations:', error);
    } finally {
      setLoading(false);
    }
  }, [onConnectedChange]);

  useEffect(() => {
    void fetchIntegrations();
  }, [fetchIntegrations]);

  const countFor = (key: ChannelKey) =>
    integrations.filter((item) => item.type === key && !item.isKnowledgeBase).length;

  const cardProps = {
    integrations,
    onRefresh: fetchIntegrations,
    onShowAlert: setAlertDialog,
  };

  // Gmail OAuth is Enterprise-only pre-CASA — drop it from onboarding for regular clients
  // (who use IMAP). null until known; only hide on an explicit false.
  const gmailAvailable = useGmailOAuthAvailability();
  const visibleChannels =
    gmailAvailable === false ? CHANNELS.filter((channel) => channel.key !== 'gmail') : CHANNELS;

  const renderCard = (key: ChannelKey) => {
    switch (key) {
      case 'gmail':
        return <GmailIntegrationCard {...cardProps} defaultKB={false} />;
      case 'email':
        return <EmailIntegrationCard {...cardProps} defaultKB={false} />;
      case 'telegram':
        return <TelegramIntegrationCard {...cardProps} />;
      case 'slack':
        return <SlackIntegrationCard {...cardProps} />;
      case 'whatsapp':
        return <WhatsAppIntegrationCard {...cardProps} />;
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect the channels your customers reach you on — messages are fetched, analyzed and routed
        to your departments. Set up one or more now, or skip and add them anytime in Settings.
      </p>
      <p className="text-xs text-muted-foreground">
        Tip: when adding a mailbox, tick “Use as Knowledge Base source” to also learn answers from
        its past emails — no cutoff to pick, we index history from the moment you enable it.
      </p>

      <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {visibleChannels.map(({ key, label, description, icon: Icon }) => {
          const count = countFor(key);
          const open = openKey === key;
          return (
            <div key={key}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={open}
                onClick={() => setOpenKey(open ? null : key)}
                className="w-full items-center gap-3 p-3 h-auto text-left rounded-none hover:bg-muted/40"
              >
                <Icon className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{label}</div>
                  <div className="truncate text-sm text-muted-foreground">{description}</div>
                </div>
                {count > 0 ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    <Check className="h-3 w-3" />
                    {count} connected
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">Not connected</span>
                )}
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                    open && 'rotate-180'
                  )}
                  aria-hidden
                />
              </Button>
              {open && <div className="border-t border-border bg-muted/20 p-3">{renderCard(key)}</div>}
            </div>
          );
        })}
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
