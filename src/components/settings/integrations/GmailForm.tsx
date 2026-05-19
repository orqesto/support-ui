import { Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ReactSelect } from '@/components/ui/ReactSelect';

type GmailConfig = {
  isKnowledgeBase?: boolean;
  searchQuery: string;
  lookbackDays?: number;
  maxResults: number;
  pollingMaxPages: number;
  bulkImportDays: number;
  bulkImportMaxResults: number;
};

const searchQueryOptions = [
  { value: 'is:unread', label: 'Unread only (recommended)' },
  { value: 'in:inbox', label: 'All inbox messages' },
  { value: 'is:unread OR in:inbox', label: 'Unread + All inbox' },
  { value: '', label: 'Everything (all folders)' },
];

const lookbackOptions = [
  { value: 7, label: 'Last 7 Days' },
  { value: 30, label: 'Last 30 Days' },
  { value: 90, label: 'Last 90 Days' },
  { value: 180, label: 'Last 6 Months' },
  { value: 365, label: 'Last Year' },
  { value: 0, label: 'All Time (slow)' },
];

type GmailFormProps = {
  config: GmailConfig;
  saving: boolean;
  pollingPagesInput: string;
  maxResultsInput: string;
  bulkImportMaxResultsInput: string;
  onConfigChange: (config: GmailConfig) => void;
  onPollingPagesChange: (value: string) => void;
  onPollingPagesBlur: () => void;
  onMaxResultsChange: (value: string) => void;
  onMaxResultsBlur: () => void;
  onBulkImportMaxResultsChange: (value: string) => void;
  onBulkImportMaxResultsBlur: () => void;
  onConnect: () => void;
  onCancel: () => void;
};

export const GmailForm = ({
  config,
  saving,
  pollingPagesInput,
  maxResultsInput,
  bulkImportMaxResultsInput,
  onConfigChange,
  onPollingPagesChange,
  onPollingPagesBlur,
  onMaxResultsChange,
  onMaxResultsBlur,
  onBulkImportMaxResultsChange,
  onBulkImportMaxResultsBlur,
  onConnect,
  onCancel,
}: GmailFormProps) => (
    <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
      <h4 className="font-medium">Add Gmail Account via OAuth2</h4>
      <div className="space-y-3">
        <div className="flex gap-2 items-center pt-2">
          <input
            type="checkbox"
            checked={config.isKnowledgeBase ?? false}
            onChange={(event) => onConfigChange({ ...config, isKnowledgeBase: event.target.checked })}
            className="rounded"
          />
          <label htmlFor="isKnowledgeBase" className="text-sm font-medium">
            📚 Use as Knowledge Base Source
          </label>
        </div>
        <p className="-mt-2 ml-6 text-xs text-muted-foreground">
          Extract Q&A pairs and documents from conversations for AI-powered support
          responses
        </p>

        <div>
          <ReactSelect
            label="Email Filter"
            value={config.searchQuery}
            onChange={(value) => onConfigChange({ ...config, searchQuery: value })}
            options={searchQueryOptions}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Which emails to sync (unread, inbox, etc.)
          </p>
        </div>
        <div>
          <ReactSelect
            label="Time Range"
            value={(config.lookbackDays ?? 30).toString()}
            onChange={(value) => onConfigChange({ ...config, lookbackDays: parseInt(value) })}
            options={lookbackOptions.map((opt) => ({
              value: opt.value.toString(),
              label: opt.label,
            }))}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            How far back in time (combines with filter above)
          </p>
        </div>
        <div>
          <label htmlFor="maxResults" className="text-sm font-medium">
            Max Results per Sync
          </label>
          <input
            id="maxResults"
            type="number"
            value={maxResultsInput}
            onChange={(event) => onMaxResultsChange(event.target.value)}
            onBlur={onMaxResultsBlur}
            className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
            placeholder="500"
            min="1"
            max="500"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Messages fetched per page during regular polling
          </p>
        </div>

        {/* Polling Settings */}
        <div className="pt-3 border-t">
          <h5 className="mb-3 text-sm font-semibold">Regular Polling Settings</h5>
          <div className="space-y-3">
            <div>
              <label htmlFor="pollingMaxPages" className="text-sm font-medium">
                Max Pages to Poll
              </label>
              <input
                id="pollingMaxPages"
                type="number"
                value={pollingPagesInput}
                onChange={(event) => onPollingPagesChange(event.target.value)}
                onBlur={onPollingPagesBlur}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                placeholder="50"
                min="1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Maximum pages per polling cycle (max: 200). Example: 100 pages × 10/page =
                1,000 messages.
              </p>
            </div>
          </div>
        </div>

        {/* Bulk Import Settings */}
        <div className="pt-3 border-t">
          <h5 className="mb-3 text-sm font-semibold">Bulk Import Settings</h5>
          <div className="space-y-3">
            <div>
              <ReactSelect
                label="Import Time Range (Days)"
                value={config.bulkImportDays.toString()}
                onChange={(value) =>
                  onConfigChange({ ...config, bulkImportDays: parseInt(value) })
                }
                options={[
                  { value: '0', label: 'All Time' },
                  { value: '7', label: 'Last 7 Days' },
                  { value: '30', label: 'Last 30 Days' },
                  { value: '90', label: 'Last 90 Days' },
                  { value: '180', label: 'Last 6 Months' },
                  { value: '365', label: 'Last Year' },
                ]}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                How far back to import emails when using bulk import (0 = all emails)
              </p>
            </div>
            <div>
              <label htmlFor="bulkImportMaxResults" className="text-sm font-medium">
                Bulk Import Page Size
              </label>
              <input
                id="bulkImportMaxResults"
                type="number"
                value={bulkImportMaxResultsInput}
                onChange={(event) => onBulkImportMaxResultsChange(event.target.value)}
                onBlur={onBulkImportMaxResultsBlur}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                placeholder="500"
                min="100"
                max="500"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Messages per page during bulk import (max: 500, recommended for large
                imports)
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={onConnect}
          isLoading={saving}
        >
          <Save className="mr-2 w-4 h-4" />
          Connect with Google
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
