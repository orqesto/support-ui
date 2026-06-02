import { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen, Inbox, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { DepartmentMultiPicker } from './DepartmentMultiPicker';
import type { Department } from '@/services/department.service';

type GmailConfig = {
  isKnowledgeBase?: boolean;
  searchQuery: string;
  maxResults: number;
  pollingMaxPages: number;
  bulkImportDays: number;
};

const searchQueryOptions = [
  { value: '', label: 'Everything (all folders)' },
  { value: 'is:unread in:inbox', label: 'Unread inbox (ongoing polling)' },
  { value: 'in:inbox OR in:sent', label: 'Inbox + Sent (full conversations)' },
  { value: 'in:inbox', label: 'All inbox messages' },
];

const historicalRangeOptions = [
  { value: '0', label: 'All Time' },
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
  { value: '180', label: 'Last 6 Months' },
  { value: '365', label: 'Last Year' },
];

type GmailFormProps = {
  config: GmailConfig;
  saving: boolean;
  pollingPagesInput: string;
  maxResultsInput: string;
  defaultKB?: boolean;
  departments: Department[];
  departmentsLoading?: boolean;
  selectedDepartmentIds: number[];
  defaultDepartmentId: number | undefined;
  onConfigChange: (config: GmailConfig) => void;
  onPollingPagesChange: (value: string) => void;
  onPollingPagesBlur: () => void;
  onMaxResultsChange: (value: string) => void;
  onMaxResultsBlur: () => void;
  onSelectedDepartmentsChange: (next: number[]) => void;
  onDefaultDepartmentChange: (id: number | undefined) => void;
  onConnect: () => void;
  onCancel: () => void;
};

export const GmailForm = ({
  config,
  saving,
  pollingPagesInput,
  maxResultsInput,
  defaultKB,
  departments,
  departmentsLoading,
  selectedDepartmentIds,
  defaultDepartmentId,
  onConfigChange,
  onPollingPagesChange,
  onPollingPagesBlur,
  onMaxResultsChange,
  onMaxResultsBlur,
  onSelectedDepartmentsChange,
  onDefaultDepartmentChange,
  onConnect,
  onCancel,
}: GmailFormProps) => {
  const canConnect = selectedDepartmentIds.length > 0;
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
      <h4 className="font-medium">
        {defaultKB ? 'Add Gmail KB Source via OAuth2' : 'Add Gmail Account via OAuth2'}
      </h4>

      {defaultKB === true && (
        <div className="flex gap-2 items-start p-3 rounded-md border bg-amber-500/10 border-amber-500/20">
          <BookOpen className="mt-0.5 w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Knowledge Base Source
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
              Extracts Q&amp;A pairs and documents for AI-powered responses. Won't appear in the
              active inbox.
            </p>
          </div>
        </div>
      )}
      {defaultKB === false && (
        <div className="flex gap-2 items-start p-3 rounded-md border bg-blue-500/10 border-blue-500/20">
          <Inbox className="mt-0.5 w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Active Inbox</p>
            <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
              Incoming messages will appear in the inbox for review, assignment, and response. To
              use Gmail as a Knowledge Base source instead, use the{' '}
              <span className="font-medium">Knowledge Base Sources</span> section below.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <ReactSelect
            label="Email Filter"
            value={config.searchQuery}
            onChange={(value) => onConfigChange({ ...config, searchQuery: value })}
            options={searchQueryOptions}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Applied during ongoing polling. Initial sync always fetches full inbox + sent to
            reconstruct conversation history.
          </p>
        </div>

        <div>
          <ReactSelect
            label="Historical Import Range"
            value={config.bulkImportDays.toString()}
            onChange={(value) => onConfigChange({ ...config, bulkImportDays: parseInt(value) })}
            options={historicalRangeOptions}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            How far back to fetch on first connect. After that, polling continues from the last
            checkpoint.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex gap-1 items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAdvanced ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          Advanced
        </button>

        {showAdvanced && (
          <div className="space-y-3 pl-3 border-l-2 border-border">
            <div>
              <label htmlFor="maxResults" className="text-sm font-medium">
                Max Results per Page
              </label>
              <input
                id="maxResults"
                type="number"
                value={maxResultsInput}
                onChange={(event) => onMaxResultsChange(event.target.value)}
                onBlur={onMaxResultsBlur}
                className="px-3 py-2 mt-1 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                min="1"
                max="500"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Messages per API page (max 500). Default 500.
              </p>
            </div>
            <div>
              <label htmlFor="pollingMaxPages" className="text-sm font-medium">
                Max Pages per Poll Cycle
              </label>
              <input
                id="pollingMaxPages"
                type="number"
                value={pollingPagesInput}
                onChange={(event) => onPollingPagesChange(event.target.value)}
                onBlur={onPollingPagesBlur}
                className="px-3 py-2 mt-1 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                min="1"
                max="200"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Limits work per cycle (max 200). Default 50.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 pt-1">
        <label className="text-sm font-medium flex items-center gap-1">
          <Building2 className="w-3.5 h-3.5" /> Departments
        </label>
        <DepartmentMultiPicker
          allDepts={departments}
          selected={selectedDepartmentIds}
          defaultId={defaultDepartmentId}
          loading={departmentsLoading}
          onSelectedChange={onSelectedDepartmentsChange}
          onDefaultChange={onDefaultDepartmentChange}
        />
        {!departmentsLoading && departments.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            No active departments. Create one before connecting a source.
          </p>
        )}
        {!departmentsLoading && departments.length > 0 && !canConnect && (
          <p className="text-xs text-muted-foreground">
            Select at least one department to route messages from this source.
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={onConnect} isLoading={saving} disabled={!canConnect || saving}>
          Connect with Google
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
