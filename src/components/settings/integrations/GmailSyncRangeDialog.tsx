import { Save } from 'lucide-react';
import { useState } from 'react';
import type { AlertState } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { logger } from '@/lib/logger';
import { integrationsService } from '@/services/integrations.service';

/**
 * "Change Initial Sync Range" for a Gmail source. Moved out of `GmailIntegrationCard` unchanged
 * in behaviour when the card reached its `max-lines` ceiling (2026-09-16).
 */
type Props = {
  source: { id: number; name: string; currentDays: number };
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onShowAlert: (alert: AlertState) => void;
};

export const GmailSyncRangeDialog = ({ source, onClose, onRefresh, onShowAlert }: Props) => {
  const [daysInput, setDaysInput] = useState(source.currentDays.toString());
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const days = parseInt(daysInput) || 0;

      await integrationsService.update(source.id, {
        config: { gmail: { bulkImportDays: days } },
      });

      await onRefresh();
      onClose();

      onShowAlert({
        open: true,
        title: 'Success',
        description: `Bulk import days updated to ${days === 0 ? 'All time' : `${days} days`}`,
        variant: 'success',
      });
    } catch (error) {
      logger.error('Failed to update initial sync range:', error);
      onShowAlert({
        open: true,
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update initial sync range',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex fixed inset-0 z-50 justify-center items-center bg-black/50">
      <div className="p-6 w-full max-w-md rounded-lg border shadow-lg bg-card">
        <h3 className="mb-4 text-lg font-semibold">Change Initial Sync Range</h3>
        <p className="mb-4 text-sm text-muted-foreground">{source.name}</p>
        <div className="space-y-4">
          <div>
            <ReactSelect
              label="Historical Import Range"
              value={daysInput}
              onChange={(value) => setDaysInput(value)}
              options={[
                { value: '0', label: 'All Time' },
                { value: '1', label: 'Last 1 Day' },
                { value: '7', label: 'Last 7 Days' },
                { value: '30', label: 'Last 30 Days' },
                { value: '90', label: 'Last 90 Days' },
                { value: '180', label: 'Last 6 Months' },
                { value: '365', label: 'Last Year' },
              ]}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              How far back to fetch emails on first connect. Set to &quot;All Time&quot; to fetch
              everything (may take a while).
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button onClick={() => void save()} isLoading={saving}>
              <Save className="mr-2 w-4 h-4" />
              Update
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
