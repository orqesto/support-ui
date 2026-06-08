import { AlertTriangle, CheckCircle, Inbox, Loader2, Mail, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

type IngestionTarget = 'all' | 'email' | 'telegram';

type Props = {
  hasMessageSources: boolean;
  hasEmailIntegrations: boolean;
  hasTelegramIntegrations: boolean;
  isProcessing: boolean;
  processingStatus: string;
  processingStage: string | undefined;
  ingesting: string | null;
  noNewMessagesInfo: { show: boolean; type: 'email' | 'telegram' | 'all' | null };
  onIngest: (type: IngestionTarget) => void;
};

export const DashboardQuickActions = ({
  hasMessageSources,
  hasEmailIntegrations,
  hasTelegramIntegrations,
  isProcessing,
  processingStatus,
  processingStage,
  ingesting,
  noNewMessagesInfo,
  onIngest,
}: Props) => {
  const blockedByActive =
    isProcessing || processingStatus === 'processing' || processingStatus === 'complete';

  const allTitle = !hasMessageSources
    ? 'No message sources configured (email, gmail, telegram, or slack)'
    : isProcessing || processingStatus === 'processing'
      ? 'Email processing is already running. Please wait for completion.'
      : processingStatus === 'complete'
        ? 'Processing just completed. Wait for widget to close before starting again.'
        : '';

  const emailTitle = !hasEmailIntegrations
    ? 'No email integrations configured'
    : isProcessing || processingStatus === 'processing'
      ? 'Processing already in progress'
      : processingStatus === 'complete'
        ? 'Wait for widget to close'
        : '';

  const telegramTitle = !hasTelegramIntegrations
    ? 'No Telegram integration configured'
    : isProcessing || processingStatus === 'processing'
      ? 'Processing already in progress'
      : processingStatus === 'complete'
        ? 'Wait for widget to close'
        : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <PlayCircle className="w-5 h-5 text-primary" />
          Quick Actions
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Start all services or trigger specific ingestion channels
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={() => onIngest('all')}
          isLoading={ingesting === 'all'}
          disabled={!hasMessageSources || blockedByActive}
          className="w-full h-12 text-base font-semibold"
          size="lg"
          title={allTitle}
        >
          <PlayCircle className="mr-2 w-5 h-5" />
          {isProcessing || processingStatus === 'processing'
            ? 'Processing...'
            : 'Start All Services'}
        </Button>
        {!hasMessageSources && (
          <p className="flex gap-1 justify-center items-center text-xs text-amber-600">
            <AlertTriangle className="w-3 h-3" />
            No message sources configured. Go to Settings to add email, Gmail, Telegram, or Slack
            integrations.
          </p>
        )}
        {blockedByActive && (
          <p className="flex gap-1 justify-center items-center text-xs text-blue-600 dark:text-blue-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            {processingStatus === 'complete'
              ? 'Processing completed. Widget will close automatically...'
              : processingStage === 'kb-processing'
                ? 'Building knowledge base from attachments...'
                : 'Email processing in progress. Please wait...'}
          </p>
        )}
        {noNewMessagesInfo.show && (
          <p className="flex gap-1 justify-center items-center text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            All caught up! No new{' '}
            {noNewMessagesInfo.type === 'email'
              ? 'emails'
              : noNewMessagesInfo.type === 'telegram'
                ? 'Telegram messages'
                : 'messages'}{' '}
            found.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={() => onIngest('email')}
            isLoading={ingesting === 'email'}
            disabled={!hasEmailIntegrations || blockedByActive}
            className="w-full"
            title={emailTitle}
          >
            <Mail className="mr-2 w-4 h-4" />
            Email
          </Button>
          <Button
            variant="outline"
            onClick={() => onIngest('telegram')}
            isLoading={ingesting === 'telegram'}
            disabled={!hasTelegramIntegrations || blockedByActive}
            className="w-full"
            title={telegramTitle}
          >
            <Inbox className="mr-2 w-4 h-4" />
            Telegram
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
