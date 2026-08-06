import { useEffect, useState } from 'react';
import { Check, Cloud, HardDrive } from 'lucide-react';
import { ObjectStorageConfigCard } from '@/components/settings/providers/ObjectStorageConfigCard';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

type Choice = 'managed' | 'byo';

interface StorageStepProps {
  /**
   * Notifies the wizard whenever a storage choice is made (or cleared), so the
   * footer button can switch from "Skip this step" to "Next" once the user has
   * actually engaged with the step. Mirrors ChannelsStep's onConnectedChange.
   */
  onChoiceChange?: (choice: Choice | undefined) => void;
}

/**
 * Step — where attachments and KB documents are stored. Two choices, mirroring
 * the AI step: managed (default, nothing to configure) or bring-your-own S3. The
 * heavy config form only appears when BYO is chosen, so the default state is a
 * light two-card selector. Optional — the client can skip and set this up later.
 */
export const StorageStep = ({ onChoiceChange }: StorageStepProps) => {
  const [choice, setChoice] = useState<Choice | undefined>();

  // Report the current selection up to the wizard on every change (click or the
  // resume pre-select below), so "Skip this step" becomes "Next" once chosen.
  useEffect(() => {
    onChoiceChange?.(choice);
  }, [choice, onChoiceChange]);

  // On resume, reflect an existing BYO storage config: the choice itself isn't
  // persisted to onboarding state, but a saved config is the source of truth, so
  // pre-select "bring your own" (revealing its form) when one already exists.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data: unknown }>('/api/integrations/storage-config')
      .then((res) => {
        if (!cancelled && res.data?.data) setChoice('byo');
      })
      .catch((error: unknown) => {
        // Non-fatal: couldn't check existing config; leave the selection default.
        logger.error('Failed to check storage config for onboarding:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose where attachments and knowledge-base documents are stored. You can change this
        anytime in Settings.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={choice === 'managed'}
          onClick={() => setChoice('managed')}
          className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Card
            className={cn(
              'h-full cursor-pointer transition-colors hover:border-primary/60',
              choice === 'managed' && 'border-primary ring-2 ring-primary'
            )}
          >
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Use built-in storage</span>
                {choice === 'managed' && <Check className="ml-auto h-4 w-4 text-primary" />}
              </div>
              <p className="text-sm text-muted-foreground">
                Files are stored on the platform — nothing to set up. For production we recommend
                bringing your own S3 bucket (right) for durability and control.
              </p>
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          aria-pressed={choice === 'byo'}
          onClick={() => setChoice('byo')}
          className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Card
            className={cn(
              'h-full cursor-pointer transition-colors hover:border-primary/60',
              choice === 'byo' && 'border-primary ring-2 ring-primary'
            )}
          >
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Bring your own S3 bucket</span>
                {choice === 'byo' && <Check className="ml-auto h-4 w-4 text-primary" />}
              </div>
              <p className="text-sm text-muted-foreground">
                Keep files in your own S3-compatible storage (AWS, Hetzner, MinIO) — recommended for
                production.
              </p>
            </CardContent>
          </Card>
        </button>
      </div>

      {choice === 'byo' && <ObjectStorageConfigCard />}
    </div>
  );
};
